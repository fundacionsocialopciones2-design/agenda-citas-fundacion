import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { CalendarOptions, EventInput } from 'fullcalendar';
import esLocale from 'fullcalendar/locales/es';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import monarch from '@fullcalendar/angular/themes/monarch';
import timeGridPlugin from '@fullcalendar/angular/timegrid';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { EstadoCita } from '../../core/models';
import { aDetalle, DatosDetalle, DetalleCita } from './detalle-cita';
import { ListaCitas } from './lista-citas';

type Vista = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'lista';

const COLOR: Record<EstadoCita, string> = { confirmada: '#1f5aa6', asistida: '#14603f', no_asistio: '#5b6676', cancelada: '#8f2419' };
const HORA_24 = { hour: '2-digit', minute: '2-digit', hour12: false } as const;
const capitalizar = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

@Component({
  selector: 'app-mi-agenda',
  imports: [FullCalendarModule, MatButtonModule, MatIconModule, ListaCitas],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Mi agenda</h1>
          <p>Tus citas confirmadas. Horas de Colombia. Solo consulta: los cambios los realiza la administración.</p>
        </div>
        <div class="vistas" role="group" aria-label="Vista del calendario">
          @for (v of vistas; track v.id) {
            <button type="button" class="vista" [attr.aria-pressed]="vista() === v.id" (click)="cambiarVista(v.id)">{{ v.texto }}</button>
          }
        </div>
      </div>

      @if (vista() === 'lista') {
        <app-lista-citas />
      }

      <!-- El calendario permanece montado (oculto en la vista Lista) para conservar su posición al volver. -->
      <div class="calendario" [class.oculto]="vista() === 'lista'">
        <div class="barra">
          <h2 class="periodo" aria-live="polite">{{ titulo() }}</h2>
          <div class="nav" role="group" aria-label="Navegación del calendario">
            <button mat-stroked-button type="button" (click)="anterior()" [attr.aria-label]="etiquetaAnterior()">
              <mat-icon aria-hidden="true">chevron_left</mat-icon>
            </button>
            <button mat-stroked-button type="button" (click)="hoy()">Hoy</button>
            <button mat-stroked-button type="button" (click)="siguiente()" [attr.aria-label]="etiquetaSiguiente()">
              <mat-icon aria-hidden="true">chevron_right</mat-icon>
            </button>
          </div>
        </div>

        @if (error()) {
          <div class="aviso aviso--error" role="alert">
            <mat-icon aria-hidden="true">error</mat-icon>
            <div>
              <strong>No se pudieron cargar tus citas.</strong> {{ error() }}
              <div><button mat-stroked-button type="button" (click)="recargar()">Reintentar</button></div>
            </div>
          </div>
        }
        @if (cargando()) {
          <p class="ayuda" role="status" aria-live="polite">Cargando citas…</p>
        }
        @if (!cargando() && !error() && vacio()) {
          <p class="ayuda" role="status">No tienes citas confirmadas en este periodo.</p>
        }

        <full-calendar [options]="opciones" [events]="eventos">
          <ng-template #eventContent let-arg>
            <div class="cita-fc">
              <span class="cita-fc__hora">{{ arg.timeText }}</span>
              <span class="cita-fc__nombre">{{ arg.event.extendedProps.paciente }}</span>
              @if (!arg.isShort) {
                <span class="cita-fc__detalle">{{ arg.event.extendedProps.especialidad }}</span>
              }
            </div>
          </ng-template>
        </full-calendar>
      </div>
    </div>
  `,
  styles: `
    .vistas {
      display: inline-flex;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 999px;
      overflow: hidden;
      background: #fff;
    }
    .vista {
      min-height: 44px;
      padding: 0 18px;
      font: inherit;
      font-weight: 700;
      color: var(--app-suave);
      background: transparent;
      border: 0;
      cursor: pointer;
    }
    .vista[aria-pressed='true'] {
      background: #1f5aa6;
      color: #fff;
    }
    .oculto {
      display: none !important;
    }
    .calendario {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .barra {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .periodo {
      margin: 0;
      font-size: clamp(1.6rem, 3.4vw, 2.4rem);
      font-weight: 800;
      line-height: 1.1;
      color: var(--app-texto);
    }
    .nav {
      display: inline-flex;
      gap: 8px;
    }
    .nav button {
      min-width: 48px;
      min-height: 44px;
    }

    /* Contenido de cada cita dentro del calendario: letra más grande y legible. */
    .cita-fc {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 3px 6px;
      min-width: 0;
      font-size: 0.95rem;
      font-weight: 600;
      line-height: 1.25;
      overflow: hidden;
    }
    .cita-fc__hora {
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .cita-fc__nombre,
    .cita-fc__detalle {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .cita-fc__detalle {
      font-size: 0.85rem;
      font-weight: 500;
    }
  `,
})
export class MiAgenda {
  private readonly api = inject(AgendaApi);
  private readonly dialog = inject(MatDialog);
  private readonly calendario = viewChild(FullCalendarComponent);

  protected readonly vistas: { id: Vista; texto: string }[] = [
    { id: 'dayGridMonth', texto: 'Mes' },
    { id: 'timeGridWeek', texto: 'Semana' },
    { id: 'timeGridDay', texto: 'Día' },
    { id: 'lista', texto: 'Lista' },
  ];

  private readonly esMovil = inject(DOCUMENT).defaultView?.matchMedia('(max-width: 720px)').matches ?? false;
  protected readonly vista = signal<Vista>(this.esMovil ? 'lista' : 'timeGridWeek');
  protected readonly titulo = signal('');
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly vacio = signal(false);

  private readonly unidad = computed(() => {
    switch (this.vista()) {
      case 'dayGridMonth':
        return 'Mes';
      case 'timeGridDay':
        return 'Día';
      default:
        return 'Semana';
    }
  });
  protected readonly etiquetaAnterior = computed(() => `${this.unidad()} anterior`);
  protected readonly etiquetaSiguiente = computed(() => `${this.unidad()} siguiente`);

  protected readonly opciones: CalendarOptions = {
    plugins: [monarch, dayGridPlugin, timeGridPlugin],
    initialView: 'timeGridWeek',
    locale: esLocale,
    timeZone: 'America/Bogota',
    firstDay: 1,
    headerToolbar: false, // la barra de título y navegación es propia (más grande y accesible)
    datesSet: (info) => this.titulo.set(capitalizar(info.view.title)),
    allDaySlot: false,
    nowIndicator: true,
    slotMinTime: '08:00:00',
    slotMaxTime: '18:00:00',
    slotMinHeight: 44,
    eventTimeFormat: HORA_24,
    slotHeaderFormat: HORA_24,
    displayEventEnd: true,
    dayMaxEvents: 3,
    fixedWeekCount: false,
    height: 'auto',
    eventClick: (info) => this.verDetalle(info.event.extendedProps as DatosDetalle),
  };

  /** Carga las citas del rango visible desde my_agenda (el servidor limita a las del propio especialista). */
  protected readonly eventos = async (info: { start: Date; end: Date }): Promise<EventInput[]> => {
    this.cargando.set(true);
    this.error.set('');
    try {
      const citas = (await this.api.miAgenda(info.start.toISOString(), info.end.toISOString())).filter((c) => c.status !== 'cancelada');
      this.vacio.set(citas.length === 0);
      return citas.map<EventInput>((c) => ({
        id: c.id,
        title: `${c.patient_first_names} ${c.patient_last_names} · ${c.specialty_name}`,
        start: c.starts_at,
        end: c.ends_at,
        color: COLOR[c.status],
        display: 'block', // barra de color sólida (en el mes, en vez de un punto con texto pequeño)
        extendedProps: aDetalle(c),
      }));
    } catch (e) {
      this.error.set(mensajeDeError(e));
      return [];
    } finally {
      this.cargando.set(false);
    }
  };

  protected cambiarVista(v: Vista): void {
    this.vista.set(v);
    if (v !== 'lista') this.calendario()?.getApi().changeView(v);
  }

  protected anterior(): void {
    this.calendario()?.getApi().prev();
  }

  protected siguiente(): void {
    this.calendario()?.getApi().next();
  }

  protected hoy(): void {
    this.calendario()?.getApi().today();
  }

  protected recargar(): void {
    this.calendario()?.getApi().refetchEvents();
  }

  private verDetalle(datos: DatosDetalle): void {
    this.dialog.open(DetalleCita, { data: datos, width: '420px' });
  }
}
