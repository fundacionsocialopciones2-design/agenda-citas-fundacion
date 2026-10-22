import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AgendaApi } from '../../core/agenda.api';
import { marcaRelativa, proximasCitas } from '../../core/citas.util';
import { mensajeDeError } from '../../core/errores';
import { CitaEspecialista } from '../../core/models';
import { bogotaAIso, diaBogota, fechaLargaBogota, horaBogota, hoyBogota, sumarDias } from '../../core/tiempo';
import { Estado } from '../../shared/estado';
import { aDetalle, DetalleCita } from './detalle-cita';

const DIAS_HACIA_ADELANTE = 400;

/** Todas las citas próximas del especialista en una sola lista, de la más cercana a la más lejana. */
@Component({
  selector: 'app-lista-citas',
  imports: [MatButtonModule, MatIconModule, Estado],
  template: `
    <section aria-labelledby="titulo-lista">
      <div class="cabecera">
        <div>
          <h2 id="titulo-lista">Citas próximas</h2>
          @if (estado() === 'listo') {
            <p class="resumen" role="status">
              <strong>{{ citas().length }}</strong> {{ citas().length === 1 ? 'cita agendada' : 'citas agendadas' }}, de la más cercana a la más lejana.
            </p>
          }
        </div>
        <button mat-stroked-button type="button" (click)="cargar()" [disabled]="estado() === 'cargando'">
          <mat-icon aria-hidden="true">refresh</mat-icon>
          Actualizar
        </button>
      </div>

      @switch (estado()) {
        @case ('cargando') {
          <app-estado tipo="cargando" titulo="Cargando tus citas…" />
        }
        @case ('error') {
          <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="cargar()" />
        }
        @default {
          @if (citas().length === 0) {
            <app-estado icono="event_available" titulo="No tienes citas próximas" mensaje="Cuando la administración agende una cita, aparecerá aquí." />
          } @else {
            <table class="tabla">
              <caption class="solo-lectores">Citas próximas ordenadas de la más cercana a la más lejana</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Hora</th>
                  <th scope="col">Paciente</th>
                  <th scope="col">Documento</th>
                  <th scope="col">Especialidad</th>
                  <th scope="col"><span class="solo-lectores">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (c of citas(); track c.id; let primera = $first) {
                  <tr [class.proxima]="primera">
                    <td data-etiqueta="Fecha">
                      <strong>{{ fecha(c.starts_at) }}</strong>
                      <span class="marcas">
                        @if (primera) {
                          <span class="chip chip--asistida">Próxima</span>
                        }
                        @if (marca(c.starts_at); as m) {
                          <span class="chip chip--confirmada">{{ m }}</span>
                        }
                      </span>
                    </td>
                    <td data-etiqueta="Hora" class="hora">{{ hora(c.starts_at) }} – {{ hora(c.ends_at) }}</td>
                    <td data-etiqueta="Paciente">{{ c.patient_first_names }} {{ c.patient_last_names }}</td>
                    <td data-etiqueta="Documento">{{ c.patient_document_type }} {{ c.patient_document_number }}</td>
                    <td data-etiqueta="Especialidad">{{ c.specialty_name }}</td>
                    <td data-etiqueta="Detalle">
                      <button mat-stroked-button type="button" (click)="ver(c)" [attr.aria-label]="'Ver detalle de la cita de ' + c.patient_first_names + ' ' + c.patient_last_names">
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        }
      }
    </section>
  `,
  styles: `
    .cabecera {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }
    h2 {
      font-size: 1.5rem;
    }
    .resumen {
      margin: 4px 0 0;
      color: var(--app-suave);
    }
    .marcas {
      display: inline-flex;
      gap: 6px;
      margin-left: 8px;
    }
    .hora {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      white-space: nowrap;
    }
    tr.proxima td {
      background: #f1f6fd;
    }
    tr.proxima td:first-child {
      box-shadow: inset 4px 0 0 #1f5aa6;
    }
  `,
})
export class ListaCitas {
  private readonly api = inject(AgendaApi);
  private readonly dialog = inject(MatDialog);

  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly mensajeError = signal('');
  protected readonly citas = signal<CitaEspecialista[]>([]);

  protected readonly fecha = fechaLargaBogota;
  protected readonly hora = horaBogota;
  private readonly hoy = computed(() => hoyBogota());

  constructor() {
    void this.cargar();
  }

  protected marca(iso: string): 'Hoy' | 'Mañana' | null {
    return marcaRelativa(diaBogota(iso), this.hoy(), sumarDias(this.hoy(), 1));
  }

  protected async cargar(): Promise<void> {
    this.estado.set('cargando');
    try {
      // Desde el inicio de hoy (para no perder la cita en curso) hasta ~13 meses; el servidor solo devuelve las del propio especialista.
      const desde = bogotaAIso(hoyBogota(), '00:00');
      const hasta = bogotaAIso(sumarDias(hoyBogota(), DIAS_HACIA_ADELANTE), '00:00');
      this.citas.set(proximasCitas(await this.api.miAgenda(desde, hasta), new Date()));
      this.estado.set('listo');
    } catch (e) {
      this.mensajeError.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }

  protected ver(c: CitaEspecialista): void {
    this.dialog.open(DetalleCita, { data: aDetalle(c), width: '420px' });
  }
}
