import { computed, inject, Service, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { Perfil } from './models';
import { SupabaseService } from './supabase.service';

/**
 * Estado de sesión. Es solo para la interfaz: la autorización real la aplican RLS y las funciones del servidor.
 */
@Service()
export class AuthService {
  private readonly sb = inject(SupabaseService).client;
  private cola: Promise<void> = Promise.resolve();

  readonly sesion = signal<Session | null>(null);
  readonly perfil = signal<Perfil | null>(null);
  readonly especialistaId = signal<string | null>(null);
  readonly enRecuperacion = signal(false);
  /** Aumenta cada vez que la sesión se pierde sin que esta pestaña lo pidiera (otra pestaña cerró sesión, expiró, etc.). */
  readonly sesionPerdida = signal(0);
  private cierreSolicitado = false;

  readonly rol = computed(() => this.perfil()?.role ?? null);
  readonly autenticado = computed(() => this.sesion() !== null && this.perfil()?.active === true);

  private readonly listo: Promise<void>;

  constructor() {
    // Suscribirse antes de leer la sesión para no perder el evento PASSWORD_RECOVERY de un enlace de correo.
    this.sb.auth.onAuthStateChange((evento, sesion) => {
      if (evento === 'PASSWORD_RECOVERY') this.enRecuperacion.set(true);
      // No se hacen llamadas a Supabase dentro del callback (puede bloquear el cliente).
      setTimeout(() => void this.aplicarSesion(sesion), 0);
    });
    this.listo = this.sb.auth.getSession().then(({ data }) => this.aplicarSesion(data.session));
  }

  whenReady(): Promise<void> {
    return this.listo;
  }

  /** Las cargas se encolan: el evento de Supabase y el inicio de sesión manual no se pisan entre sí. */
  private aplicarSesion(sesion: Session | null): Promise<void> {
    this.cola = this.cola.then(() => this.cargarSesion(sesion)).catch(() => undefined);
    return this.cola;
  }

  private async cargarSesion(sesion: Session | null): Promise<void> {
    if (!sesion) {
      if (this.sesion() !== null && !this.cierreSolicitado) this.sesionPerdida.update((n) => n + 1);
      this.sesion.set(null);
      this.perfil.set(null);
      this.especialistaId.set(null);
      return;
    }
    const { data: perfil } = await this.sb
      .from('profiles')
      .select('id, full_name, role, active, email')
      .eq('id', sesion.user.id)
      .maybeSingle();
    let especialistaId: string | null = null;
    if (perfil?.role === 'especialista') {
      const { data } = await this.sb.from('specialists').select('id').maybeSingle();
      especialistaId = data?.id ?? null;
    }
    this.sesion.set(sesion);
    this.perfil.set((perfil as Perfil | null) ?? null);
    this.especialistaId.set(especialistaId);
  }

  /** Devuelve un mensaje de error o null si todo salió bien. */
  async iniciarSesion(correo: string, clave: string): Promise<string | null> {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: correo.trim(), password: clave });
    if (error) {
      if (error.status === 429) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
      if (error.message.toLowerCase().includes('invalid login')) return 'Correo o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.';
      return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
    }
    await this.aplicarSesion(data.session);
    if (!this.autenticado()) {
      await this.cerrarSesion();
      return 'Tu cuenta no está habilitada. Comunícate con la administración.';
    }
    return null;
  }

  /** Cierra la sesión de ESTE navegador (scope local): no cierra las sesiones del usuario en otros dispositivos. */
  async cerrarSesion(): Promise<void> {
    this.cierreSolicitado = true;
    try {
      try {
        await this.sb.auth.signOut({ scope: 'local' });
      } catch {
        // Sin red o con error del servidor: igual se limpia el estado local para no dejar la sesión abierta en pantalla.
      }
      await this.aplicarSesion(null);
      this.enRecuperacion.set(false);
    } finally {
      this.cierreSolicitado = false;
    }
  }

  /** Siempre responde igual para no revelar qué correos existen. */
  async enviarRecuperacion(correo: string): Promise<void> {
    await this.sb.auth.resetPasswordForEmail(correo.trim(), { redirectTo: `${location.origin}/restablecer` });
  }

  async cambiarClave(nueva: string): Promise<string | null> {
    const { error } = await this.sb.auth.updateUser({ password: nueva });
    if (!error) {
      this.enRecuperacion.set(false);
      return null;
    }
    if (error.message.toLowerCase().includes('different from the old')) return 'La nueva contraseña debe ser distinta a la anterior.';
    if (error.message.toLowerCase().includes('weak') || error.message.toLowerCase().includes('at least')) return 'La contraseña es muy débil. Usa al menos 8 caracteres.';
    return 'No se pudo cambiar la contraseña. El enlace pudo haber vencido; solicita uno nuevo.';
  }

  rutaInicio(): string {
    return this.rol() === 'admin' ? '/admin/agenda' : this.rol() === 'especialista' ? '/mi-agenda' : '/ingresar';
  }
}
