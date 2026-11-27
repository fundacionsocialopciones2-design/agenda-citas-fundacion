import { inject, Service, signal } from '@angular/core';
import { AgendaApi } from './agenda.api';
import { ResumenUrgencias } from './models';

const CADA_MS = 60_000;

const iguales = (a: ResumenUrgencias | null, b: ResumenUrgencias | null): boolean =>
  a === b || (!!a && !!b && a.sin_atender === b.sin_atender && a.en_gestion === b.en_gestion && a.ultima_id === b.ultima_id);

/**
 * Cifras de urgencias compartidas por el contador del menú y la pantalla «Urgencias». La señal solo cambia
 * cuando cambian las cifras, así que sirve para saber cuándo recargar la lista. Consultar no cuenta como
 * actividad del usuario: no impide el cierre de sesión por inactividad.
 */
@Service()
export class UrgenciasResumen {
  private readonly api = inject(AgendaApi);
  private readonly _resumen = signal<ResumenUrgencias | null>(null, { equal: iguales });
  readonly resumen = this._resumen.asReadonly();
  private vigencia = 0;

  async actualizar(): Promise<void> {
    const vigencia = this.vigencia;
    try {
      const r = await this.api.resumenUrgencias();
      if (vigencia === this.vigencia) this._resumen.set(r);
    } catch {
      // Sin conexión o sesión vencida: se conserva la última cifra y se reintenta en el siguiente ciclo.
    }
  }

  /** Consulta ahora, cada minuto y al volver a la pestaña. Devuelve la función que detiene la vigilancia. */
  vigilar(): () => void {
    const consultar = () => {
      if (!document.hidden) void this.actualizar();
    };
    void this.actualizar();
    const intervalo = setInterval(consultar, CADA_MS);
    document.addEventListener('visibilitychange', consultar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', consultar);
      this.vigencia++; // descarta respuestas que lleguen tarde
      this._resumen.set(null);
    };
  }
}
