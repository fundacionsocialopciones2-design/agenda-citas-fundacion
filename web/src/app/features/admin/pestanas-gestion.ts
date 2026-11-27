import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { CifrasGestion, EstadoInscripcion, EstadoSolicitud, VistaGestion } from '../../core/models';

/** Estados que ofrece el filtro en cada pestaña (la base de datos usa la misma agrupación, migración 30). */
export const ESTADOS_INSCRIPCION: Record<VistaGestion, EstadoInscripcion[]> = {
  por_confirmar: ['pendiente', 'contactado'],
  confirmados: ['matriculado'],
  cancelados: ['cancelado'],
};

export const ESTADOS_ASESORIA: Record<VistaGestion, EstadoSolicitud[]> = {
  por_confirmar: ['pendiente', 'contactado'],
  confirmados: ['agendada', 'atendida'],
  cancelados: ['cancelada'],
};

export function vistaDe(porVista: Record<VistaGestion, string[]>, estado: string): VistaGestion {
  return (Object.keys(porVista) as VistaGestion[]).find((v) => porVista[v].includes(estado)) ?? 'por_confirmar';
}

/** Pestaña en la que queda un registro al cambiar su estado (para el aviso). */
export const destinoInscripcion = (estado: EstadoInscripcion): string =>
  ({ por_confirmar: 'Por confirmar', confirmados: 'Confirmados', cancelados: 'Cancelados' })[vistaDe(ESTADOS_INSCRIPCION, estado)];

export const destinoAsesoria = (estado: EstadoSolicitud): string =>
  ({ por_confirmar: 'Por confirmar', confirmados: 'Confirmadas', cancelados: 'Canceladas' })[vistaDe(ESTADOS_ASESORIA, estado)];

export const VACIO_GESTION: Record<VistaGestion, { icono: string; titulo: string; mensaje: string }> = {
  por_confirmar: { icono: 'task_alt', titulo: 'No hay nada por confirmar', mensaje: 'Lo que llegue por WhatsApp aparecerá aquí. Revisa los filtros si esperabas ver algo.' },
  confirmados: { icono: 'history', titulo: 'No hay confirmados con estos filtros', mensaje: 'Aquí queda el historial de lo que ya confirmaste.' },
  cancelados: { icono: 'block', titulo: 'No hay cancelados con estos filtros', mensaje: 'Aquí quedan los registros cancelados.' },
};

/** Pestañas «Por confirmar / Confirmados / Cancelados» de Cursos y Asesorías. */
@Component({
  selector: 'app-pestanas-gestion',
  imports: [MatButtonModule],
  host: { class: 'acciones', role: 'group', '[attr.aria-label]': 'etiqueta()' },
  template: `
    @for (v of vistas; track v) {
      <button
        type="button"
        [matButton]="vista() === v ? 'filled' : 'outlined'"
        [attr.aria-pressed]="vista() === v"
        [disabled]="bloqueada()"
        (click)="elegida.emit(v)"
      >
        {{ textos()[v] }}
        @if (cifras(); as c) {
          <span class="cantidad">{{ c[v] }}</span>
        }
      </button>
    }
  `,
  styles: `
    .cantidad {
      display: inline-block;
      min-width: 22px;
      margin-left: 8px;
      padding: 0 6px;
      border-radius: 999px;
      background: var(--app-primario-suave);
      color: var(--app-primario-suave-texto);
      font-size: 0.8rem;
      font-weight: 800;
      line-height: 22px;
    }
  `,
})
export class PestanasGestion {
  readonly etiqueta = input.required<string>();
  readonly textos = input.required<Record<VistaGestion, string>>();
  readonly cifras = input<CifrasGestion | null>(null);
  readonly vista = input.required<VistaGestion>();
  readonly bloqueada = input(false);
  readonly elegida = output<VistaGestion>();
  protected readonly vistas: VistaGestion[] = ['por_confirmar', 'confirmados', 'cancelados'];
}
