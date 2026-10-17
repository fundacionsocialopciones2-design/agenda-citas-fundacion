// Edge Function: administración de usuarios Auth para especialistas.
// Seguridad: (1) el llamante debe traer un JWT válido; (2) se verifica EN SERVIDOR que es administrador
// (RPC is_admin con su propio token); (3) solo entonces se usa la clave privilegiada, que nunca sale de aquí.
// No se registran correos, nombres ni tokens en los logs.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = (Deno.env.get('APP_URL') ?? 'http://localhost:4200').replace(/\/$/, '');
const ORIGENES = (Deno.env.get('ALLOWED_ORIGINS') ?? APP_URL).split(',').map((s) => s.trim());

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cors(req: Request): Record<string, string> {
  const origen = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function responder(req: Request, estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

const fallo = (req: Request, estado: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  responder(req, estado, { code, message, ...extra });

async function crearEspecialista(req: Request, admin: SupabaseClient, b: Record<string, unknown>): Promise<Response> {
  const email = String(b.email ?? '').trim().toLowerCase();
  const nombre = String(b.full_name ?? '').trim();
  const especialidades = Array.isArray(b.specialty_ids) ? (b.specialty_ids as unknown[]).map(String) : [];
  if (!CORREO.test(email) || nombre.length < 2 || nombre.length > 120 || especialidades.length === 0 || !especialidades.every((s) => UUID.test(s))) {
    return fallo(req, 400, 'invalid_input', 'Revisa el nombre, el correo y las especialidades.');
  }

  const { data: invitado, error: errInv } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${APP_URL}/restablecer`,
    data: { full_name: nombre },
  });
  if (errInv || !invitado.user) {
    const existe = errInv?.message?.toLowerCase().includes('already');
    return fallo(req, existe ? 409 : 502, existe ? 'email_exists' : 'invite_failed', existe ? 'Ya existe un usuario con ese correo.' : 'No se pudo enviar la invitación. Inténtalo de nuevo.');
  }
  const userId = invitado.user.id;

  const limpiar = async () => {
    await admin.auth.admin.deleteUser(userId); // revierte la invitación si algo falla después
  };

  const { error: errPerfil } = await admin.from('profiles').insert({ id: userId, full_name: nombre, role: 'especialista', email });
  if (errPerfil) {
    await limpiar();
    return fallo(req, 500, 'profile_failed', 'No se pudo crear el perfil.');
  }
  const { data: esp, error: errEsp } = await admin.from('specialists').insert({ profile_id: userId, full_name: nombre }).select('id').single();
  if (errEsp || !esp) {
    await admin.from('profiles').delete().eq('id', userId);
    await limpiar();
    return fallo(req, 500, 'specialist_failed', 'No se pudo crear el especialista.');
  }
  const { error: errRel } = await admin.from('specialist_specialties').insert(especialidades.map((s) => ({ specialist_id: esp.id, specialty_id: s })));
  if (errRel) {
    await admin.from('specialists').delete().eq('id', esp.id);
    await admin.from('profiles').delete().eq('id', userId);
    await limpiar();
    return fallo(req, 400, 'specialties_failed', 'No se pudieron asignar las especialidades.');
  }
  return responder(req, 200, { specialist_id: esp.id });
}

async function perfilDe(admin: SupabaseClient, specialistId: string): Promise<string | null> {
  const { data } = await admin.from('specialists').select('profile_id').eq('id', specialistId).maybeSingle();
  return data?.profile_id ?? null;
}

async function cambiarCorreo(req: Request, admin: SupabaseClient, b: Record<string, unknown>): Promise<Response> {
  const email = String(b.email ?? '').trim().toLowerCase();
  const id = String(b.specialist_id ?? '');
  if (!UUID.test(id) || !CORREO.test(email)) return fallo(req, 400, 'invalid_input', 'Revisa el correo.');
  const perfil = await perfilDe(admin, id);
  if (!perfil) return fallo(req, 404, 'no_access', 'Este especialista no tiene acceso creado.');
  const { error } = await admin.auth.admin.updateUserById(perfil, { email, email_confirm: true });
  if (error) return fallo(req, 409, 'email_change_failed', 'No se pudo cambiar el correo (¿ya está en uso?).');
  await admin.from('profiles').update({ email }).eq('id', perfil);
  return responder(req, 200, { ok: true });
}

async function cambiarEstado(req: Request, admin: SupabaseClient, usuario: SupabaseClient, b: Record<string, unknown>): Promise<Response> {
  const id = String(b.specialist_id ?? '');
  const activo = b.active === true;
  if (!UUID.test(id) || typeof b.active !== 'boolean') return fallo(req, 400, 'invalid_input', 'Solicitud no válida.');

  // Con el token del administrador: la función valida is_admin y detecta conflictos con citas futuras (AG409).
  const { error } = await usuario.rpc('admin_set_specialist_active', { p_specialist_id: id, p_active: activo });
  if (error) {
    if (error.code === 'AG409') {
      const ids = (error.details ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
      return fallo(req, 409, 'AG409', 'Hay citas futuras confirmadas que debes resolver primero.', { cita_ids: ids });
    }
    if (error.code === '42501') return fallo(req, 403, 'forbidden', 'No tienes permiso.');
    return fallo(req, 400, 'update_failed', 'No se pudo cambiar el estado.');
  }

  const perfil = await perfilDe(admin, id);
  if (perfil) {
    await admin.from('profiles').update({ active: activo }).eq('id', perfil);
    await admin.auth.admin.updateUserById(perfil, { ban_duration: activo ? 'none' : '876000h' });
  }
  return responder(req, 200, { ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return fallo(req, 405, 'method_not_allowed', 'Método no permitido.');

  const autorizacion = req.headers.get('Authorization');
  if (!autorizacion?.startsWith('Bearer ')) return fallo(req, 401, 'unauthorized', 'Sesión requerida.');

  const usuario = createClient(URL, ANON, { global: { headers: { Authorization: autorizacion } } });
  const { data: sesion, error: errSesion } = await usuario.auth.getUser();
  if (errSesion || !sesion.user) return fallo(req, 401, 'unauthorized', 'Sesión no válida.');

  const { data: esAdmin, error: errAdmin } = await usuario.rpc('is_admin');
  if (errAdmin || esAdmin !== true) return fallo(req, 403, 'forbidden', 'Solo un administrador puede realizar esta acción.');

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return fallo(req, 400, 'invalid_json', 'Solicitud no válida.');
  }

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    switch (cuerpo.action) {
      case 'create_specialist':
        return await crearEspecialista(req, admin, cuerpo);
      case 'change_email':
        return await cambiarCorreo(req, admin, cuerpo);
      case 'set_active':
        return await cambiarEstado(req, admin, usuario, cuerpo);
      default:
        return fallo(req, 400, 'unknown_action', 'Acción desconocida.');
    }
  } catch (_e) {
    console.error('admin-users: error inesperado', cuerpo.action);
    return fallo(req, 500, 'internal', 'Error interno. Inténtalo de nuevo.');
  }
});
