import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { CitaPendiente, ETIQUETA_SOLICITUD, EstadoSolicitud, FiltrosCitasPendientes, ServicioCita } from '../../core/models';
import { fechaBogota } from '../../core/tiempo';
import { Estado } from '../../shared/estado';
import { valorDe } from '../../shared/eventos-formulario';
import { DetalleCitaPendiente } from './detalle-cita-pendiente';

const SIN_FILTROS: FiltrosCitasPendientes = { servicioId: '', estado: '', busqueda: '' };

/**
 * Citas «abiertas» del chatbot: cuando un servicio de salud no tiene agenda en línea (p. ej. Fonoaudiología,
 * Optometría, Fisioterapia), la atención es a domicilio o no hay horarios para reprogramar, el bot pide a la
 * persona el día y la hora que prefiere y deja la solicitud para que la fundación la confirme. El administrador
 * cambia el estado desde el detalle. Datos: admin_servicios_cita / admin_citas_pendientes (exigen admin).
 */
@Component({
  selector: 'app-agenda-pendiente',
  imports: [MatButtonModule, Estado],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Agenda pendiente</h1>
          <p>
            Personas que pidieron una cita por WhatsApp eligiendo ellas mismas el día y la hora, porque el servicio no tiene agenda en línea.
            Hay que contactarlas para confirmar la cita y, con «Ver», cambiar el estado de las que ya gestionaste.
          </p>
        </div>
      </div>

      <form class="tarjeta" (submit)="$event.preventDefault(); buscar()" aria-label="Filtros de citas pendientes">
        <div class="fila">
          <div class="campo" style="margin: 0">
            <label for="f-servicio">Servicio</label>
            <select id="f-servicio" (change)="cambiar('servicioId', valor($event))">
              <option value="" [selected]="!filtros().servicioId">Todos</option>
              @for (s of servicios(); track s.servicio_id) {
                <option [value]="s.servicio_id" [selected]="filtros().servicioId === s.servicio_id">{{ s.titulo }} ({{ s.solicitudes }})</option>
              }
            </select>
          </div>
          <div class="campo" style="margin: 0">
            <label for="f-est">Estado</label>
            <select id="f-est" (change)="cambiar('estado', valor($event))">
              <option value="" [selected]="!filtros().estado">Todos</option>
              @for (e of estados; track e.valor) {
                <option [value]="e.valor" [selected]="filtros().estado === e.valor">{{ e.texto }}</option>
              }
            </select>
          </div>
          <div class="campo" style="margin: 0">
            <label for="f-buscar">Nombre o documento</label>
            <input id="f-buscar" type="search" autocomplete="off" [value]="filtros().busqueda" (input)="cambiar('busqueda', valor($event))" />
          </div>
        </div>
        <div class="acciones" style="margin-top: 12px">
          <button mat-flat-button type="submit" [disabled]="estado() === 'cargando'">Buscar</button>
          <button mat-button type="button" (click)="limpiar()">Limpiar filtros</button>
        </div>
      </form>

      <section aria-labelledby="t-pendientes">
        <h2 id="t-pendientes" class="titulo-resultados">{{ tituloResultados() }}</h2>
        @switch (estado()) {
          @case ('cargando') {
            <app-estado tipo="cargando" titulo="Cargando citas pendientes…" />
          }
          @case ('error') {
            <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="recargar()" />
          }
          @default {
            @if (citas().length === 0) {
              <app-estado icono="pending_actions" titulo="No hay solicitudes de cita con estos filtros" mensaje="Cuando alguien pida por WhatsApp una cita de un servicio sin agenda en línea, aparecerá aquí." />
            } @else {
              <table class="tabla">
                <caption>
                  {{ citas().length }} {{ citas().length === 1 ? 'solicitud' : 'solicitudes' }}{{ citas().length === 500 ? ' (se muestran las 500 más recientes; afina los filtros)' : '' }}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Solicitud</th>
                    <th scope="col">Persona</th>
                    <th scope="col">Servicio</th>
                    <th scope="col">Día y hora que pidió</th>
                    <th scope="col">Contacto</th>
                    <th scope="col">Estado</th>
                    <th scope="col"><span class="solo-lectores">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of citas(); track c.id) {
                    <tr>
                      <td data-etiqueta="Solicitud">{{ fecha(c.creado) }}</td>
                      <td data-etiqueta="Persona">
                        <strong>{{ c.nombre_completo }}</strong>
                        @if (c.numero_documento) {
                          <br /><small class="ayuda">{{ c.tipo_documento }} {{ c.numero_documento }}</small>
                        }
                      </td>
                      <td data-etiqueta="Servicio">
                        {{ c.servicio }}
                        @if (c.motivo) {
                          <br /><small class="ayuda">{{ c.motivo }}</small>
                        }
                      </td>
                      <td data-etiqueta="Día y hora que pidió">{{ c.preferencia || 'Sin indicar' }}</td>
                      <td data-etiqueta="Contacto">{{ c.telefono_contacto || c.telefono }}</td>
                      <td data-etiqueta="Estado"><span class="chip" [class]="'chip chip--' + c.estado">{{ etiqueta[c.estado] }}</span></td>
                      <td data-etiqueta="Detalle">
                        <button mat-stroked-button type="button" (click)="ver(c)" [attr.aria-label]="'Ver la solicitud de ' + c.nombre_completo">Ver</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          }
        }
      </section>
    </div>
  `,
})
export class AgendaPendiente {
  private readonly api = inject(AgendaApi);
  private readonly dialog = inject(MatDialog);

  protected readonly valor = valorDe;
  protected readonly fecha = fechaBogota;
  protected readonly etiqueta = ETIQUETA_SOLICITUD;
  protected readonly estados = (Object.keys(ETIQUETA_SOLICITUD) as EstadoSolicitud[]).map((valor) => ({ valor, texto: ETIQUETA_SOLICITUD[valor] }));

  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly mensajeError = signal('');
  protected readonly servicios = signal<ServicioCita[]>([]);
  protected readonly citas = signal<CitaPendiente[]>([]);
  protected readonly filtros = signal<FiltrosCitasPendientes>(SIN_FILTROS);
  /** Filtros con los que se hizo la última búsqueda (para el título de resultados). */
  private readonly aplicados = signal<FiltrosCitasPendientes>(SIN_FILTROS);

  protected readonly tituloResultados = computed(() => {
    const id = this.aplicados().servicioId;
    if (!id) return 'Todas las solicitudes de cita';
    return `Solicitudes de cita de ${this.servicios().find((s) => s.servicio_id === id)?.titulo ?? 'el servicio elegido'}`;
  });

  constructor() {
    this.recargar();
  }

  protected recargar(): void {
    void this.cargarServicios();
    void this.buscar();
  }

  /** Opciones del filtro «Servicio». Si fallan, la tabla sigue funcionando con «Todos». */
  private async cargarServicios(): Promise<void> {
    try {
      this.servicios.set(await this.api.serviciosCita());
    } catch {
      this.servicios.set([]);
    }
  }

  protected async buscar(f: FiltrosCitasPendientes = this.filtros()): Promise<void> {
    this.estado.set('cargando');
    try {
      this.citas.set(await this.api.citasPendientes(f));
      this.aplicados.set(f);
      this.estado.set('listo');
    } catch (e) {
      this.mensajeError.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }

  protected cambiar<K extends keyof FiltrosCitasPendientes>(campo: K, valor: string): void {
    this.filtros.update((f) => ({ ...f, [campo]: valor }));
  }

  protected limpiar(): void {
    this.filtros.set(SIN_FILTROS);
    void this.buscar();
  }

  /** Si el estado cambió en el detalle, se recarga la lista con los mismos filtros que se estaban viendo. */
  protected async ver(c: CitaPendiente): Promise<void> {
    const resultado = await firstValueFrom(this.dialog.open(DetalleCitaPendiente, { data: c, width: '520px' }).afterClosed());
    if (resultado === 'actualizada') await this.buscar(this.aplicados());
  }
}
