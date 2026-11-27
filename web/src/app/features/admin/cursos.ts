import { Component, computed, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { CifrasGestion, Curso, ETIQUETA_INSCRIPCION, EstadoInscripcion, FiltrosInscripciones, Inscripcion, VistaGestion } from '../../core/models';
import { fechaBogota } from '../../core/tiempo';
import { Estado } from '../../shared/estado';
import { valorDe } from '../../shared/eventos-formulario';
import { agruparPorCategoria } from './agrupar-catalogo';
import { DetalleInscripcion } from './detalle-inscripcion';
import { FilaLista, ListaDetalle } from './lista-detalle';
import { ESTADOS_INSCRIPCION, PestanasGestion, VACIO_GESTION, vistaDe } from './pestanas-gestion';

const SIN_FILTROS: FiltrosInscripciones = { vista: 'por_confirmar', cursoId: '', categoriaId: '', estado: '', busqueda: '' };

/**
 * Cursos que ofrece el chatbot (catálogo = menú del bot) y personas inscritas por WhatsApp. Solo lectura.
 * Los datos llegan de admin_cursos / admin_inscripciones, que exigen ser administrador.
 */
@Component({
  selector: 'app-cursos',
  imports: [MatButtonModule, Estado, ListaDetalle, PestanasGestion, DetalleInscripcion],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Cursos</h1>
          <p>Cursos que ofrece el chatbot y las personas que se inscribieron por WhatsApp. Cambia su estado cuando gestiones cada inscripción.</p>
        </div>
      </div>

      <app-pestanas-gestion
        [etiqueta]="'Inscripciones por estado'"
        [textos]="textosPestanas"
        [cifras]="cifras()"
        [vista]="filtros().vista"
        [bloqueada]="bloqueado()"
        (elegida)="cambiarVista($event)"
      />

      <form class="tarjeta" (submit)="$event.preventDefault(); buscar()" aria-label="Filtros de inscritos">
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
            <label for="f-curso">Curso</label>
            <select id="f-curso" (change)="cambiar('cursoId', valor($event))">
              <option value="" [selected]="!filtros().cursoId">Todos</option>
              @for (c of cursosDelFiltro(); track c.curso_id) {
                <option [value]="c.curso_id" [selected]="filtros().cursoId === c.curso_id">{{ c.titulo }} ({{ c.inscritos }})</option>
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

      <section aria-labelledby="t-inscritos">
        <h2 id="t-inscritos" class="titulo-resultados">{{ tituloResultados() }}</h2>
        @switch (estado()) {
          @case ('cargando') {
            <app-estado tipo="cargando" titulo="Cargando inscritos…" />
          }
          @case ('error') {
            <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="recargar()" />
          }
          @default {
            @if (inscritos().length === 0) {
              <app-estado [icono]="vacio().icono" [titulo]="vacio().titulo" [mensaje]="vacio().mensaje" />
            } @else {
              <p class="ayuda conteo">
                {{ inscritos().length }} {{ inscritos().length === 1 ? 'persona inscrita' : 'personas inscritas' }}{{ inscritos().length === 500 ? ' (se muestran las 500 más recientes; afina los filtros)' : '' }}
              </p>
              <app-lista-detalle etiqueta="Personas inscritas" [filas]="filas()" [bloqueada]="bloqueado()" [(seleccion)]="seleccion">
                <ng-template let-id>
                  @if (porId().get(id); as r) {
                    <app-detalle-inscripcion [inscripcion]="r" (cambiada)="alCambiar()" />
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
export class Cursos implements OnInit {
  private readonly api = inject(AgendaApi);

  /** Filtro de estado con el que se llega desde «Inicio» (?estado=pendiente). */
  readonly filtroEstado = input<string | undefined>(undefined, { alias: 'estado' });

  protected readonly valor = valorDe;
  protected readonly estados = computed(() => ESTADOS_INSCRIPCION[this.filtros().vista].map((valor) => ({ valor, texto: ETIQUETA_INSCRIPCION[valor] })));
  protected readonly textosPestanas = { por_confirmar: 'Por confirmar', confirmados: 'Confirmados', cancelados: 'Cancelados' };
  private readonly conteo = signal<CifrasGestion | null>(null);
  protected readonly cifras = this.conteo.asReadonly();
  protected readonly vacio = computed(() => VACIO_GESTION[this.filtros().vista]);
  private readonly detalle = viewChild(DetalleInscripcion);
  protected readonly bloqueado = computed(() => this.detalle()?.ocupado() ?? false);

  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly mensajeError = signal('');
  protected readonly catalogo = signal<Curso[]>([]);
  protected readonly inscritos = signal<Inscripcion[]>([]);
  protected readonly filtros = signal<FiltrosInscripciones>(SIN_FILTROS);
  /** Filtros con los que se hizo la última búsqueda (para el título de resultados). */
  private readonly aplicados = signal<FiltrosInscripciones>(SIN_FILTROS);

  protected readonly categorias = computed(() => agruparPorCategoria(this.catalogo(), (c) => c.inscritos));
  protected readonly categoriasConId = computed(() => this.categorias().filter((g) => g.id !== null));
  protected readonly cursosDelFiltro = computed(() => {
    const cat = this.filtros().categoriaId;
    return cat ? this.catalogo().filter((c) => c.categoria_id === cat) : this.catalogo();
  });

  protected readonly tituloResultados = computed(() => {
    const f = this.aplicados();
    if (f.cursoId) return `Inscritos en ${this.catalogo().find((c) => c.curso_id === f.cursoId)?.titulo ?? 'el curso elegido'}`;
    if (f.categoriaId) return `Inscritos en ${this.categorias().find((g) => g.id === f.categoriaId)?.nombre ?? 'la categoría elegida'}`;
    return { por_confirmar: 'Personas por confirmar', confirmados: 'Personas confirmadas', cancelados: 'Inscripciones canceladas' }[f.vista];
  });

  protected readonly seleccion = signal<number | null>(null);
  protected readonly porId = computed(() => new Map(this.inscritos().map((r) => [r.id, r])));
  protected readonly filas = computed<FilaLista[]>(() =>
    this.inscritos().map((r) => ({
      id: r.id,
      titulo: r.nombre_completo,
      fecha: fechaBogota(r.creado),
      resumen: r.modalidad ? `${r.curso} · ${r.modalidad}` : r.curso,
      chip: { clave: r.estado, texto: ETIQUETA_INSCRIPCION[r.estado] },
      destacada: r.estado === 'pendiente',
    })),
  );

  ngOnInit(): void {
    const estado = this.filtroEstado();
    if (estado && estado in ETIQUETA_INSCRIPCION) {
      this.filtros.update((f) => ({ ...f, estado: estado as EstadoInscripcion, vista: vistaDe(ESTADOS_INSCRIPCION, estado) }));
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
      this.catalogo.set(await this.api.cursos());
    } catch {
      this.catalogo.set([]);
    }
  }

  /** Cifras de las pestañas. Si fallan, las pestañas se muestran sin número. */
  private async cargarCifras(): Promise<void> {
    try {
      this.conteo.set((await this.api.conteoGestion()).inscripciones);
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
      this.inscritos.set(await this.api.inscripciones(f));
      this.aplicados.set(f);
      this.estado.set('listo');
    } catch (e) {
      this.mensajeError.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }

  protected cambiar<K extends keyof FiltrosInscripciones>(campo: K, valor: string): void {
    this.filtros.update((f) => ({ ...f, [campo]: valor }));
  }

  /** Al cambiar de categoría, el curso elegido se quita si no pertenece a ella. */
  protected cambiarCategoria(categoriaId: string): void {
    this.filtros.update((f) => {
      const curso = this.catalogo().find((c) => c.curso_id === f.cursoId);
      const conserva = !categoriaId || curso?.categoria_id === categoriaId;
      return { ...f, categoriaId, cursoId: conserva ? f.cursoId : '' };
    });
  }

  protected limpiar(): void {
    this.filtros.update((f) => ({ ...SIN_FILTROS, vista: f.vista }));
    void this.buscar();
  }
}
