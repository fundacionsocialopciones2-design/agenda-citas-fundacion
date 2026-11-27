// Edge Function PÚBLICA: un especialista crea su acceso con un enlace de invitación.
// Seguridad: la única credencial es el token del enlace (256 bits, un solo uso, vence en 72 h), que genera un
// administrador. La base de datos lo valida (huella SHA-256) y vincula la cuenta; esta función solo puede crear
// el usuario de Auth, y lo borra si el canje falla. No se registran correos, contraseñas ni tokens en los logs.
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = (Deno.env.get('APP_URL') ?? 'http://localhost:4200').replace(/\/$/, '');
const ORIGENES = (Deno.env.get('ALLOWED_ORIGINS') ?? APP_URL).split(',').map((s) => s.trim());

const TOKEN = /^[0-9a-f]{64}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALIDA = 'Este enlace no es válido o ya venció. Pide uno nuevo a la administración.';

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
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...cors(req), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const fallo = (req: Request, estado: number, code: string, message: string) => responder(req, estado, { code, message });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return fallo(req, 405, 'method_not_allowed', 'Método no permitido.');

  const texto = await req.text();
  if (texto.length > 2000) return fallo(req, 413, 'invalid_input', 'Solicitud no válida.');
  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return fallo(req, 400, 'invalid_json', 'Solicitud no válida.');
  }

  const accion = cuerpo?.action;
  const token = String(cuerpo?.token ?? '');
  if (accion !== 'consultar' && accion !== 'aceptar') return fallo(req, 400, 'unknown_action', 'Acción desconocida.');
  if (!TOKEN.test(token)) return fallo(req, 404, 'invitation_invalid', INVALIDA);

  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { data: invitacion, error: errConsulta } = await admin.rpc('invitacion_consultar', { p_token: token });
    if (errConsulta) return fallo(req, 500, 'internal', 'No se pudo verificar el enlace. Inténtalo de nuevo.');
    if (!invitacion?.ok) return fallo(req, 404, 'invitation_invalid', INVALIDA);
    if (accion === 'consultar') return responder(req, 200, { full_name: invitacion.full_name });

    const email = String(cuerpo.email ?? '').trim().toLowerCase();
    const clave = String(cuerpo.password ?? '');
    if (email.length > 254 || !CORREO.test(email)) return fallo(req, 400, 'invalid_email', 'Escribe un correo válido.');
    // 72 bytes es el máximo que Auth admite para una contraseña.
    if (clave.length < 8 || new TextEncoder().encode(clave).length > 72) {
      return fallo(req, 400, 'weak_password', 'La contraseña debe tener entre 8 y 72 caracteres.');
    }

    const { data: creado, error: errUsuario } = await admin.auth.admin.createUser({
      email,
      password: clave,
      email_confirm: true,
      user_metadata: { full_name: invitacion.full_name },
    });
    if (errUsuario || !creado.user) {
      const codigo = (errUsuario as { code?: string } | null)?.code;
      if (codigo === 'email_exists' || errUsuario?.message?.toLowerCase().includes('already')) {
        return fallo(req, 409, 'email_exists', 'Ya existe una cuenta con ese correo. Usa otro o habla con la administración.');
      }
      if (codigo === 'weak_password') return fallo(req, 400, 'weak_password', 'La contraseña es muy débil. Elige una más larga o difícil.');
      return fallo(req, 502, 'user_failed', 'No se pudo crear la cuenta. Inténtalo de nuevo.');
    }

    const { data: canje, error: errCanje } = await admin.rpc('invitacion_canjear', { p_token: token, p_user_id: creado.user.id });
    if (errCanje || !canje?.ok) {
      await admin.auth.admin.deleteUser(creado.user.id); // sin vínculo no debe quedar una cuenta suelta
      return errCanje
        ? fallo(req, 500, 'internal', 'No se pudo crear la cuenta. Inténtalo de nuevo.')
        : fallo(req, 404, 'invitation_invalid', INVALIDA);
    }
    return responder(req, 200, { ok: true });
  } catch (_e) {
    console.error('invitacion-especialista: error inesperado', accion);
    return fallo(req, 500, 'internal', 'Error interno. Inténtalo de nuevo.');
  }
});
