import { Component, computed, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { CifrasGestion, ETIQUETA_SOLICITUD, EstadoSolicitud, FiltrosAsesorias, SolicitudAsesoria, TipoAsesoria, VistaGestion } from '../../core/models';
import { fechaBogota } from '../../core/tiempo';
import { Estado } from '../../shared/estado';
import { valorDe } from '../../shared/eventos-formulario';
import { agruparPorCategoria } from './agrupar-catalogo';
import { DetalleSolicitud } from './detalle-solicitud';
import { FilaLista, ListaDetalle } from './lista-detalle';
import { ESTADOS_ASESORIA, PestanasGestion, VACIO_GESTION, vistaDe } from './pestanas-gestion';

const SIN_FILTROS: FiltrosAsesorias = { vista: 'por_confirmar', servicioId: '', categoriaId: '', estado: '', busqueda: '' };

/**
 * Asesorías jurídicas y generales que ofrece el chatbot (catálogo = menú del bot) y las solicitudes hechas
 * por WhatsApp. Solo lectura. Los datos llegan de admin_asesorias / admin_solicitudes_asesoria (exigen admin).
 */
@Component({
  selector: 'app-asesorias',
  imports: [MatButtonModule, Estado, ListaDetalle, PestanasGestion, DetalleSolicitud],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Asesorías</h1>
          <p>Asesorías jurídicas y generales que ofrece el chatbot, y las solicitudes que llegaron por WhatsApp. Cambia su estado cuando las gestiones.</p>
        </div>
      </div>

      <app-pestanas-gestion
        [etiqueta]="'Asesorías por estado'"
        [textos]="textosPestanas"
        [cifras]="cifras()"
        [vista]="filtros().vista"
        [bloqueada]="bloqueado()"
        (elegida)="cambiarVista($event)"
      />

      <form class="tarjeta" (submit)="$event.preventDefault(); buscar()" aria-label="Filtros de solicitudes">
        <div class="fila fila--filtros">
          <div class="campo" style="margin: 0">
            <label for="f-cat">Categoría</label>
            <select id="f-cat" (change)="cambiarCategoria(valor($event))">
              <option value="" [selected]="!filtros().categoriaId">Todas</option>
              @for (g of categoriasConId(); track g.id) {
                <option [value]="g.id" [selected]="filtros().categoriaId === g.id">{{ g.nombre }}</option>
              }
            </select>
          </div>
          <div class="campo" style="margin: 0">
            <label for="f-tipo">Tipo de asesoría</label>
            <select id="f-tipo" (change)="cambiar('servicioId', valor($event))">
              <option value="" [selected]="!filtros().servicioId">Todos</option>
              @for (t of tiposDelFiltro(); track t.servicio_id) {
                <option [value]="t.servicio_id" [selected]="filtros().servicioId === t.servicio_id">{{ t.titulo }} ({{ t.solicitudes }})</option>
              }
            </select>
          </div>
          @if (estados().length > 1) {
            <div class="campo" style="margin: 0">
              <label for="f-est">Estado</label>
              <select id="f-est" (change)="cambiar('estado', valor($event))">
                <option value="" [selected]="!filtros().estado">Todos</option>
                @for (e of estados(); track e.valor) {
                  <option [value]="e.valor" [selected]="filtros().estado === e.valor">{{ e.texto }}</option>
                }
              </select>
            </div>
          }
          <div class="campo" style="margin: 0">
            <label for="f-buscar">Nombre o documento</label>
            <input id="f-buscar" type="search" autocomplete="off" [value]="filtros().busqueda" (input)="cambiar('busqueda', valor($event))" />
          </div>
          <div class="acciones">
            <button mat-flat-button type="submit" [disabled]="estado() === 'cargando'">Buscar</button>
            <button mat-button type="button" (click)="limpiar()">Limpiar filtros</button>
          </div>
        </div>
      </form>

      <section aria-labelledby="t-solicitudes">
        <h2 id="t-solicitudes" class="titulo-resultados">{{ tituloResultados() }}</h2>
        @switch (estado()) {
          @case ('cargando') {
            <app-estado tipo="cargando" titulo="Cargando solicitudes…" />
          }
          @case ('error') {
            <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="recargar()" />
          }
          @default {
            @if (solicitudes().length === 0) {
              <app-estado [icono]="vacio().icono" [titulo]="vacio().titulo" [mensaje]="vacio().mensaje" />
            } @else {
              <p class="ayuda conteo">
                {{ solicitudes().length }} {{ solicitudes().length === 1 ? 'solicitud' : 'solicitudes' }}{{ solicitudes().length === 500 ? ' (se muestran las 500 más recientes; afina los filtros)' : '' }}
              </p>
              <app-lista-detalle etiqueta="Solicitudes de asesoría" [filas]="filas()" [bloqueada]="bloqueado()" [(seleccion)]="seleccion">
                <ng-template let-id>
                  @if (porId().get(id); as r) {
                    <app-detalle-solicitud [solicitud]="r" (cambiada)="alCambiar()" />
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
export class Asesorias implements OnInit {
  private readonly api = inject(AgendaApi);

  /** Filtro de estado con el que se llega desde «Inicio» (?estado=pendiente). */
  readonly filtroEstado = input<string | undefined>(undefined, { alias: 'estado' });

  protected readonly valor = valorDe;
  protected readonly estados = computed(() => ESTADOS_ASESORIA[this.filtros().vista].map((valor) => ({ valor, texto: ETIQUETA_SOLICITUD[valor] })));
  protected readonly textosPestanas = { por_confirmar: 'Por confirmar', confirmados: 'Confirmadas', cancelados: 'Canceladas' };
  private readonly conteo = signal<CifrasGestion | null>(null);
  protected readonly cifras = this.conteo.asReadonly();
  protected readonly vacio = computed(() => VACIO_GESTION[this.filtros().vista]);
  private readonly detalle = viewChild(DetalleSolicitud);
  protected readonly bloqueado = computed(() => this.detalle()?.ocupado() ?? false);

  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly mensajeError = signal('');
  protected readonly catalogo = signal<TipoAsesoria[]>([]);
  protected readonly solicitudes = signal<SolicitudAsesoria[]>([]);
  protected readonly filtros = signal<FiltrosAsesorias>(SIN_FILTROS);
  /** Filtros con los que se hizo la última búsqueda (para el título de resultados). */
  private readonly aplicados = signal<FiltrosAsesorias>(SIN_FILTROS);

  protected readonly categorias = computed(() => agruparPorCategoria(this.catalogo(), (t) => t.solicitudes));
  protected readonly categoriasConId = computed(() => this.categorias().filter((g) => g.id !== null));
  protected readonly tiposDelFiltro = computed(() => {
    const cat = this.filtros().categoriaId;
    return cat ? this.catalogo().filter((t) => t.categoria_id === cat) : this.catalogo();
  });

  protected readonly tituloResultados = computed(() => {
    const f = this.aplicados();
    if (f.servicioId) return `Solicitudes de ${this.catalogo().find((t) => t.servicio_id === f.servicioId)?.titulo ?? 'la asesoría elegida'}`;
    if (f.categoriaId) return `Solicitudes de ${this.categorias().find((g) => g.id === f.categoriaId)?.nombre ?? 'la categoría elegida'}`;
    return { por_confirmar: 'Solicitudes por confirmar', confirmados: 'Solicitudes confirmadas', cancelados: 'Solicitudes canceladas' }[f.vista];
  });

  protected readonly seleccion = signal<number | null>(null);
  protected readonly porId = computed(() => new Map(this.solicitudes().map((r) => [r.id, r])));
  protected readonly filas = computed<FilaLista[]>(() =>
    this.solicitudes().map((r) => ({
      id: r.id,
      titulo: r.nombre_completo,
      fecha: fechaBogota(r.creado),
      resumen: r.servicio,
      chip: { clave: r.estado, texto: ETIQUETA_SOLICITUD[r.estado] },
      destacada: r.estado === 'pendiente',
    })),
  );

  ngOnInit(): void {
    const estado = this.filtroEstado();
    if (estado && estado in ETIQUETA_SOLICITUD) {
      this.filtros.update((f) => ({ ...f, estado: estado as EstadoSolicitud, vista: vistaDe(ESTADOS_ASESORIA, estado) }));
    }
    this.recargar();
  }

  protected recargar(): void {
    void this.cargarCatalogo();
    void this.cargarCifras();
    void this.buscar();
  }

  /** Opciones de los filtros. Si fallan, la tabla sigue funcionando con «Todos». */
  private async cargarCatalogo(): Promise<void> {
    try {
      this.catalogo.set(await this.api.asesorias());
    } catch {
      this.catalogo.set([]);
    }
  }

  /** Cifras de las pestañas. Si fallan, las pestañas se muestran sin número. */
  private async cargarCifras(): Promise<void> {
    try {
      this.conteo.set((await this.api.conteoGestion()).asesorias);
    } catch {
      this.conteo.set(null);
    }
  }

  protected cambiarVista(vista: VistaGestion): void {
    if (vista === this.filtros().vista) return;
    this.filtros.update((f) => ({ ...f, vista, estado: '' }));
    this.seleccion.set(null);
    void this.buscar();
  }

  protected alCambiar(): void {
    void this.buscar(true);
    void this.cargarCifras();
  }

  /** `silencioso`: conserva lo que se ve y los filtros aplicados (tras guardar un estado). */
  protected async buscar(silencioso = false): Promise<void> {
    const f = silencioso ? this.aplicados() : this.filtros();
    if (!silencioso) this.estado.set('cargando');
    try {
      this.solicitudes.set(await this.api.solicitudesAsesoria(f));
      this.aplicados.set(f);
      this.estado.set('listo');
    } catch (e) {
      this.mensajeError.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }

  protected cambiar<K extends keyof FiltrosAsesorias>(campo: K, valor: string): void {
    this.filtros.update((f) => ({ ...f, [campo]: valor }));
  }

  /** Al cambiar de categoría, el tipo elegido se quita si no pertenece a ella. */
  protected cambiarCategoria(categoriaId: string): void {
    this.filtros.update((f) => {
      const tipo = this.catalogo().find((t) => t.servicio_id === f.servicioId);
      const conserva = !categoriaId || tipo?.categoria_id === categoriaId;
      return { ...f, categoriaId, servicioId: conserva ? f.servicioId : '' };
    });
  }

  protected limpiar(): void {
    this.filtros.update((f) => ({ ...SIN_FILTROS, vista: f.vista }));
    void this.buscar();
  }
}
