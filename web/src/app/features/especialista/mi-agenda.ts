import { DOCUMENT } from '@angular/common';
import { Component, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { CalendarOptions, EventInput } from 'fullcalendar';
import esLocale from 'fullcalendar/locales/es';
import { FullCalendarComponent, FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/angular/daygrid';
import listPlugin from '@fullcalendar/angular/list';
import monarch from '@fullcalendar/angular/themes/monarch';
import timeGridPlugin from '@fullcalendar/angular/timegrid';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { ETIQUETA_ESTADO, EstadoCita, TipoDocumento } from '../../core/models';
import { fechaBogota, horaBogota } from '../../core/tiempo';

type Vista = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';

interface DatosDetalle {
  paciente: string;
  documento: string;
  especialidad: string;
  fecha: string;
  hora: string;
  estado: EstadoCita;
}

/** Detalle de una cita: solo los datos mínimos del paciente (nombre y documento). */
@Component({
  selector: 'app-detalle-cita',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Detalle de la cita</h2>
    <mat-dialog-content>
      <dl class="detalle">
        <dt>Paciente</dt>
        <dd>{{ d.paciente }}</dd>
        <dt>Documento</dt>
        <dd>{{ d.documento }}</dd>
        <dt>Especialidad</dt>
        <dd>{{ d.especialidad }}</dd>
        <dt>Fecha</dt>
        <dd>{{ d.fecha }}</dd>
        <dt>Hora</dt>
        <dd>{{ d.hora }}</dd>
        <dt>Estado</dt>
        <dd>
          <span class="chip" [class]="'chip chip--' + d.estado">{{ etiqueta[d.estado] }}</span>
        </dd>
      </dl>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close cdkFocusInitial>Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .detalle {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 8px 16px;
      margin: 0;
    }
    dt {
      font-weight: 700;
      color: var(--app-suave);
    }
    dd {
      margin: 0;
    }
  `,
})
export class DetalleCita {
  protected readonly d = inject<DatosDetalle>(MAT_DIALOG_DATA);
  protected readonly etiqueta = ETIQUETA_ESTADO;
}

const COLOR: Record<EstadoCita, string> = { confirmada: '#1f5aa6', asistida: '#14603f', no_asistio: '#5b6676', cancelada: '#8f2419' };

@Component({
  selector: 'app-mi-agenda',
  imports: [FullCalendarModule, MatButtonModule, MatIconModule],
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

      <full-calendar [options]="opciones" [events]="eventos" />
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
    { id: 'listWeek', texto: 'Lista' },
  ];

  private readonly esMovil = inject(DOCUMENT).defaultView?.matchMedia('(max-width: 720px)').matches ?? false;
  protected readonly vista = signal<Vista>(this.esMovil ? 'listWeek' : 'timeGridWeek');
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly vacio = signal(false);

  protected readonly opciones: CalendarOptions = {
    plugins: [monarch, dayGridPlugin, timeGridPlugin, listPlugin],
    initialView: this.vista(),
    locale: esLocale,
    timeZone: 'America/Bogota',
    firstDay: 1,
    headerToolbar: { start: 'prev,next today', end: 'title' },
    allDaySlot: false,
    nowIndicator: true,
    slotMinTime: '08:00:00',
    slotMaxTime: '18:00:00',
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
        extendedProps: {
          paciente: `${c.patient_first_names} ${c.patient_last_names}`,
          documento: `${c.patient_document_type satisfies TipoDocumento} ${c.patient_document_number}`,
          especialidad: c.specialty_name,
          fecha: fechaBogota(c.starts_at),
          hora: `${horaBogota(c.starts_at)} – ${horaBogota(c.ends_at)}`,
          estado: c.status,
        } satisfies DatosDetalle,
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
    this.calendario()?.getApi().changeView(v);
  }

  protected recargar(): void {
    this.calendario()?.getApi().refetchEvents();
  }

  private verDetalle(datos: DatosDetalle): void {
    this.dialog.open(DetalleCita, { data: datos, width: '420px' });
  }
}
