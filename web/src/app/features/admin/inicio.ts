import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Params, RouterLink } from '@angular/router';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { Pendientes, ResumenInicio } from '../../core/models';
import { bogotaAIso, fechaLargaBogota, haceCuanto } from '../../core/tiempo';
import { Estado } from '../../shared/estado';

interface Tarjeta {
  titulo: string;
  icono: string;
  total: number;
  nota: string;
  ruta: string;
  filtro: Params;
  accion: string;
  alerta: boolean;
}

/**
 * Pantalla de llegada del administrador: lo que está pendiente por gestionar y las citas de hoy, cada cifra con
 * enlace a su pestaña ya filtrada. Todo se calcula en Postgres (admin_inicio); aquí solo se presenta.
 */
@Component({
  selector: 'app-inicio',
  imports: [MatButtonModule, MatIconModule, RouterLink, Estado],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Inicio</h1>
          <p>
            @if (fecha()) {
              {{ fecha() }}.
            }
            Esto es lo que está pendiente por gestionar.
          </p>
        </div>
        <button mat-stroked-button type="button" (click)="cargar()">
          <mat-icon aria-hidden="true">refresh</mat-icon>
          Actualizar
        </button>
      </div>

      @switch (estado()) {
        @case ('cargando') {
          <app-estado tipo="cargando" titulo="Cargando el resumen…" />
        }
        @case ('error') {
          <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="cargar()" />
        }
        @default {
          <ul class="tarjetas">
            @for (t of tarjetas(); track t.titulo) {
              <li>
                <a class="tarjeta tarjeta--accion cifra" [class.cifra--alerta]="t.alerta" [routerLink]="t.ruta" [queryParams]="t.filtro">
                  <span class="cifra__titulo">
                    <mat-icon aria-hidden="true">{{ t.icono }}</mat-icon>
                    {{ t.titulo }}
                  </span>
                  <span class="cifra__total">{{ t.total }}</span>
                  <span class="cifra__nota">{{ t.nota }}</span>
                  <span class="cifra__accion">{{ t.accion }} <mat-icon aria-hidden="true">arrow_forward</mat-icon></span>
                </a>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
  styles: `
    .tarjetas {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
      gap: 16px;
    }
    .cifra {
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 6px;
      color: var(--app-texto);
      text-decoration: none;
      border-top: 5px solid var(--app-primario);
    }
    .cifra--alerta {
      border-top-color: var(--app-peligro-borde);
    }
    .cifra__titulo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 800;
    }
    .cifra__total {
      font-size: 2.6rem;
      font-weight: 800;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .cifra--alerta .cifra__total {
      color: var(--app-peligro-texto);
    }
    .cifra__nota {
      color: var(--app-suave);
    }
    .cifra__accion {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: auto;
      padding-top: 6px;
      font-weight: 700;
      color: var(--app-primario);
    }
  `,
})
export class Inicio {
  private readonly api = inject(AgendaApi);

  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly mensajeError = signal('');
  private readonly resumen = signal<ResumenInicio | null>(null);

  protected readonly fecha = computed(() => {
    const hoy = this.resumen()?.hoy;
    return hoy ? fechaLargaBogota(bogotaAIso(hoy, '12:00')) : '';
  });

  protected readonly tarjetas = computed<Tarjeta[]>(() => {
    const r = this.resumen();
    if (!r) return [];
    const pendientes = (
      p: Pendientes,
      datos: Pick<Tarjeta, 'titulo' | 'icono' | 'ruta' | 'accion'> & { filtro?: Params; urgente?: boolean },
    ): Tarjeta => ({
      ...datos,
      filtro: datos.filtro ?? { estado: 'pendiente' },
      total: p.total,
      nota: p.mas_antigua ? `La más antigua: ${haceCuanto(p.mas_antigua)}` : 'Todo al día',
      alerta: !!datos.urgente && p.total > 0,
    });
    const h = r.citas_hoy;
    return [
      pendientes(r.urgencias, { titulo: 'Urgencias sin atender', icono: 'emergency', ruta: '/admin/urgencias', accion: 'Atender urgencias', filtro: {}, urgente: true }),
      {
        titulo: 'Citas de hoy',
        icono: 'event_note',
        total: h.total,
        nota: h.total === 0 ? 'No hay citas para hoy' : `Por atender: ${h.por_atender} (no se cuentan las canceladas)`,
        ruta: '/admin/agenda',
        filtro: { dia: r.hoy },
        accion: 'Ver la agenda de hoy',
        alerta: false,
      },
      pendientes(r.citas_pendientes, { titulo: 'Citas por confirmar', icono: 'pending_actions', ruta: '/admin/agenda-pendiente', accion: 'Ver agenda pendiente' }),
      pendientes(r.inscripciones, { titulo: 'Inscripciones pendientes', icono: 'school', ruta: '/admin/cursos', accion: 'Ver inscripciones' }),
      pendientes(r.asesorias, { titulo: 'Asesorías pendientes', icono: 'gavel', ruta: '/admin/asesorias', accion: 'Ver asesorías' }),
    ];
  });

  constructor() {
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.estado.set('cargando');
    try {
      this.resumen.set(await this.api.inicio());
      this.estado.set('listo');
    } catch (e) {
      this.mensajeError.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }
}
