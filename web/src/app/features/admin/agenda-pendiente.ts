import { Component, computed, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { CitaPendiente, ETIQUETA_SOLICITUD, EstadoSolicitud, FiltrosCitasPendientes, ServicioCita } from '../../core/models';
import { fechaBogota } from '../../core/tiempo';
import { Estado } from '../../shared/estado';
import { valorDe } from '../../shared/eventos-formulario';
import { DetalleCitaPendiente } from './detalle-cita-pendiente';
import { FilaLista, ListaDetalle } from './lista-detalle';

const SIN_FILTROS: FiltrosCitasPendientes = { servicioId: '', estado: '', busqueda: '' };

/**
 * Citas «abiertas» del chatbot: cuando un servicio de salud no tiene agenda en línea (p. ej. Fonoaudiología,
 * Optometría, Fisioterapia), la atención es a domicilio o no hay horarios para reprogramar, el bot pide a la
 * persona el día y la hora que prefiere y deja la solicitud para que la fundación la confirme. El administrador
 * cambia el estado desde el panel de detalle. Datos: admin_servicios_cita / admin_citas_pendientes (exigen admin).
 */
@Component({
  selector: 'app-agenda-pendiente',
  imports: [MatButtonModule, Estado, ListaDetalle, DetalleCitaPendiente],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Agenda pendiente</h1>
          <p>
            Personas que pidieron una cita por WhatsApp eligiendo ellas mismas el día y la hora, porque el servicio no tiene agenda en línea.
            Hay que contactarlas para confirmar la cita y cambiar el estado de las que ya gestionaste.
          </p>
        </div>
      </div>

      <form class="tarjeta" (submit)="$event.preventDefault(); buscar()" aria-label="Filtros de citas pendientes">
        <div class="fila fila--filtros">
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
          <div class="acciones">
            <button mat-flat-button type="submit" [disabled]="estado() === 'cargando' || bloqueado()">Buscar</button>
            <button mat-button type="button" [disabled]="bloqueado()" (click)="limpiar()">Limpiar filtros</button>
          </div>
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
              <p class="ayuda conteo">
                {{ citas().length }} {{ citas().length === 1 ? 'solicitud' : 'solicitudes' }}{{ citas().length === 500 ? ' (se muestran las 500 más recientes; afina los filtros)' : '' }}
              </p>
              <app-lista-detalle etiqueta="Solicitudes de cita" [filas]="filas()" [bloqueada]="bloqueado()" [(seleccion)]="seleccion">
                <ng-template let-id>
                  @if (porId().get(id); as c) {
                    <app-detalle-cita-pendiente [cita]="c" (cambiada)="alCambiar()" />
                  }
                </ng-template>
              </app-lista-detalle>
            }
          }
        }
      </section>
    </div>
  `,
})
export class AgendaPendiente implements OnInit {
  private readonly api = inject(AgendaApi);
  private readonly detalle = viewChild(DetalleCitaPendiente);

  /** Filtro de estado con el que se llega desde «Inicio» (?estado=pendiente). */
  readonly filtroEstado = input<string | undefined>(undefined, { alias: 'estado' });

  protected readonly valor = valorDe;
  protected readonly estados = (Object.keys(ETIQUETA_SOLICITUD) as EstadoSolicitud[]).map((valor) => ({ valor, texto: ETIQUETA_SOLICITUD[valor] }));

  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly mensajeError = signal('');
  protected readonly servicios = signal<ServicioCita[]>([]);
  protected readonly citas = signal<CitaPendiente[]>([]);
  protected readonly seleccion = signal<number | null>(null);
  protected readonly filtros = signal<FiltrosCitasPendientes>(SIN_FILTROS);
  /** Filtros con los que se hizo la última búsqueda (para el título de resultados y las recargas). */
  private readonly aplicados = signal<FiltrosCitasPendientes>(SIN_FILTROS);

  protected readonly bloqueado = computed(() => this.detalle()?.ocupado() ?? false);
  protected readonly porId = computed(() => new Map(this.citas().map((c) => [c.id, c])));
  protected readonly filas = computed<FilaLista[]>(() =>
    this.citas().map((c) => ({
      id: c.id,
      titulo: c.nombre_completo,
      fecha: fechaBogota(c.creado),
      resumen: `${c.servicio} · Pide: ${c.preferencia || 'sin indicar'}`,
      chip: { clave: c.estado, texto: ETIQUETA_SOLICITUD[c.estado] },
      destacada: c.estado === 'pendiente',
    })),
  );

  protected readonly tituloResultados = computed(() => {
    const id = this.aplicados().servicioId;
    if (!id) return 'Todas las solicitudes de cita';
    return `Solicitudes de cita de ${this.servicios().find((s) => s.servicio_id === id)?.titulo ?? 'el servicio elegido'}`;
  });

  ngOnInit(): void {
    const estado = this.filtroEstado();
    if (estado && estado in ETIQUETA_SOLICITUD) this.cambiar('estado', estado);
    this.recargar();
  }

  protected recargar(): void {
    void this.cargarServicios();
    void this.buscar();
  }

  /** Opciones del filtro «Servicio». Si fallan, la lista sigue funcionando con «Todos». */
  private async cargarServicios(): Promise<void> {
    try {
      this.servicios.set(await this.api.serviciosCita());
    } catch {
      this.servicios.set([]);
    }
  }

  /** `silencioso`: conserva lo que se ve mientras llega la respuesta (tras guardar un estado). */
  protected async buscar(silencioso = false): Promise<void> {
    const f = silencioso ? this.aplicados() : this.filtros();
    if (!silencioso) this.estado.set('cargando');
    try {
      this.citas.set(await this.api.citasPendientes(f));
      this.aplicados.set(f);
      this.estado.set('listo');
    } catch (e) {
      this.mensajeError.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }

  protected alCambiar(): void {
    void this.buscar(true);
  }

  protected cambiar<K extends keyof FiltrosCitasPendientes>(campo: K, valor: string): void {
    this.filtros.update((f) => ({ ...f, [campo]: valor }));
  }

  protected limpiar(): void {
    this.filtros.set(SIN_FILTROS);
    void this.buscar();
  }
}
