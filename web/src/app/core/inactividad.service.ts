import { DOCUMENT } from '@angular/common';
import { effect, inject, Service, signal, untracked } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AvisoInactividad, DatosAvisoInactividad, RespuestaAvisoInactividad } from '../shared/aviso-inactividad';
import { AuthService } from './auth.service';

/** Clave compartida entre pestañas: solo guarda un número (marca de tiempo), nunca datos personales. */
export const CLAVE_ULTIMA_ACTIVIDAD = 'agenda-citas:ultima-actividad';

// Acciones deliberadas de la persona. No se usa "mousemove": mover el ratón sin querer no mantiene la sesión abierta.
const EVENTOS_ACTIVIDAD = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
const INTERVALO_REVISION_MS = 1000;
const INTERVALO_ESCRITURA_MS = 5000;

/**
 * Cierra la sesión tras un periodo sin actividad (por defecto 15 min, con aviso 60 s antes).
 *
 * - Compara marcas de tiempo (Date.now) en lugar de depender de un solo temporizador largo: si el equipo se
 *   suspende o la pestaña queda en segundo plano, al volver se cierra la sesión de inmediato.
 * - La última actividad se comparte entre pestañas: trabajar en una mantiene viva la sesión de todas.
 * - Solo vigila mientras hay una sesión iniciada; los oyentes se retiran al cerrarla.
 *
 * Es una capa de usabilidad y seguridad del lado del cliente. No sustituye la caducidad de sesión del servidor.
 */
@Service()
export class InactividadService {
  private readonly doc = inject(DOCUMENT);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  private readonly limiteMs = environment.inactividad.limiteMinutos * 60_000;
  private readonly avisoMs = environment.inactividad.avisoSegundos * 1000;

  /** Segundos que faltan para cerrar la sesión mientras se muestra el aviso; null si no hay aviso. */
  readonly segundosRestantes = signal<number | null>(null);

  private ultimaActividad = Date.now();
  private ultimaEscritura = 0;
  private aviso: MatDialogRef<AvisoInactividad, RespuestaAvisoInactividad> | null = null;
  private cerrando = false;

  constructor() {
    effect((limpiar) => {
      if (!this.auth.autenticado()) return;
      untracked(() => this.registrarActividad(true)); // iniciar sesión cuenta como actividad
      limpiar(this.vigilar());
    });
  }

  /** Acción explícita de «Continuar sesión». */
  continuar(): void {
    this.registrarActividad(true);
    this.cerrarAviso();
  }

  private vigilar(): () => void {
    const ventana = this.doc.defaultView;
    if (!ventana) return () => undefined;
    this.cerrando = false; // nueva sesión: el vigilante vuelve a estar activo

    // Mientras el aviso está abierto, la actividad no extiende la sesión: solo lo hace «Continuar».
    const alActividad = (): void => {
      if (this.aviso === null) this.registrarActividad(false);
    };
    for (const evento of EVENTOS_ACTIVIDAD) ventana.addEventListener(evento, alActividad, { passive: true, capture: true });
    this.doc.addEventListener('visibilitychange', this.revisar);
    const reloj = setInterval(this.revisar, INTERVALO_REVISION_MS);

    return () => {
      for (const evento of EVENTOS_ACTIVIDAD) ventana.removeEventListener(evento, alActividad, { capture: true });
      this.doc.removeEventListener('visibilitychange', this.revisar);
      clearInterval(reloj);
      this.cerrarAviso();
    };
  }

  private readonly revisar = (): void => {
    if (this.cerrando) return;
    const inactivo = Date.now() - this.actividadMasReciente();
    if (inactivo >= this.limiteMs) {
      void this.cerrarPorInactividad();
      return;
    }
    const restanteMs = this.limiteMs - inactivo;
    if (restanteMs <= this.avisoMs) {
      this.mostrarAviso(Math.ceil(restanteMs / 1000));
    } else if (this.aviso !== null) {
      this.cerrarAviso(); // hubo actividad en otra pestaña
    }
  };

  private mostrarAviso(segundos: number): void {
    this.segundosRestantes.set(segundos);
    if (this.aviso !== null) return;
    this.aviso = this.dialog.open<AvisoInactividad, DatosAvisoInactividad, RespuestaAvisoInactividad>(AvisoInactividad, {
      data: { segundos: this.segundosRestantes.asReadonly() },
      disableClose: true,
      role: 'alertdialog',
      ariaModal: true,
      width: '420px',
    });
    this.aviso.afterClosed().subscribe((respuesta) => {
      this.aviso = null;
      this.segundosRestantes.set(null);
      if (respuesta === 'continuar') this.registrarActividad(true);
      else if (respuesta === 'salir') void this.salir();
    });
  }

  private cerrarAviso(): void {
    const aviso = this.aviso;
    this.aviso = null;
    this.segundosRestantes.set(null);
    aviso?.close();
  }

  private async cerrarPorInactividad(): Promise<void> {
    await this.terminar('inactividad');
  }

  private async salir(): Promise<void> {
    await this.terminar(null);
  }

  private async terminar(motivo: 'inactividad' | null): Promise<void> {
    // Una vez decidido el cierre, el vigilante no vuelve a actuar hasta la próxima sesión (ver vigilar()):
    // así un fallo de red no provoca reintentos cada segundo.
    if (this.cerrando) return;
    this.cerrando = true;
    this.cerrarAviso();
    this.dialog.closeAll(); // no deja abierto ningún diálogo con datos de pacientes
    await this.auth.cerrarSesion();
    await this.router.navigate(['/ingresar'], motivo ? { queryParams: { motivo } } : {});
  }

  private registrarActividad(forzar: boolean): void {
    const ahora = Date.now();
    this.ultimaActividad = ahora;
    // La escritura compartida se limita en frecuencia: los eventos de scroll pueden llegar a decenas por segundo.
    if (forzar || ahora - this.ultimaEscritura >= INTERVALO_ESCRITURA_MS) {
      this.ultimaEscritura = ahora;
      try {
        localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(ahora));
      } catch {
        // Sin almacenamiento disponible (modo privado, bloqueado): se sigue solo con la actividad de esta pestaña.
      }
    }
  }

  private actividadMasReciente(): number {
    try {
      const compartida = Number(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD));
      if (Number.isFinite(compartida) && compartida > this.ultimaActividad && compartida <= Date.now()) return compartida;
    } catch {
      // ver registrarActividad
    }
    return this.ultimaActividad;
  }
}
