import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { Curso, ETIQUETA_INSCRIPCION, EstadoInscripcion, FiltrosInscripciones, Inscripcion, SIN_CURSO } from '../../core/models';
import { fechaBogota } from '../../core/tiempo';
import { Estado } from '../../shared/estado';
import { valorDe } from '../../shared/eventos-formulario';
import { agruparPorCategoria } from './agrupar-catalogo';
import { DetalleInscripcion } from './detalle-inscripcion';

const SIN_FILTROS: FiltrosInscripciones = { cursoId: '', categoriaId: '', estado: '', busqueda: '' };

/**
 * Cursos que ofrece el chatbot (catálogo = menú del bot) y personas inscritas por WhatsApp. Solo lectura.
 * Los datos llegan de admin_cursos / admin_inscripciones, que exigen ser administrador.
 */
@Component({
  selector: 'app-cursos',
  imports: [MatButtonModule, MatIconModule, Estado],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Cursos</h1>
          <p>Cursos que ofrece el chatbot y las personas que se inscribieron por WhatsApp. Elige un curso para ver sus inscritos.</p>
        </div>
      </div>

      @switch (estadoCatalogo()) {
        @case ('cargando') {
          <app-estado tipo="cargando" titulo="Cargando cursos…" />
        }
        @case ('error') {
          <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="cargarCatalogo()" />
        }
        @default {
          <section class="catalogo" aria-label="Catálogo de cursos">
            @for (g of categorias(); track g.nombre) {
              <article class="tarjeta catalogo-categoria">
                <h2>{{ g.nombre }} <span class="contador" [attr.aria-label]="g.total + ' inscritos'">{{ g.total }}</span></h2>
                <ul class="catalogo-lista">
                  @for (c of g.elementos; track c.curso_id) {
                    <li>
                      <button
                        type="button"
                        class="catalogo-item"
                        [class.catalogo-item--vacio]="c.inscritos === 0"
                        [attr.aria-pressed]="filtros().cursoId === c.curso_id"
                        (click)="elegirCurso(c)"
                      >
                        <span class="catalogo-item__texto">
                          <span class="catalogo-item__titulo">{{ c.titulo }}</span>
                          @if (c.grupo || !c.activo) {
                            <span class="catalogo-item__nota">{{ c.grupo }}{{ c.grupo && !c.activo ? ' · ' : '' }}{{ c.activo ? '' : 'No disponible en el menú' }}</span>
                          }
                        </span>
                        <span class="catalogo-item__cifra">{{ c.inscritos }}<span class="solo-lectores"> {{ c.inscritos === 1 ? 'inscrito' : 'inscritos' }}</span></span>
                      </button>
                    </li>
                  }
                </ul>
              </article>
            }
          </section>
        }
      }

      <form class="tarjeta" (submit)="$event.preventDefault(); buscar()" aria-label="Filtros de inscritos">
        <div class="fila">
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

      <section aria-labelledby="t-inscritos">
        <h2 id="t-inscritos" class="titulo-resultados" tabindex="-1" #encabezadoResultados>{{ tituloResultados() }}</h2>
        @switch (estado()) {
          @case ('cargando') {
            <app-estado tipo="cargando" titulo="Cargando inscritos…" />
          }
          @case ('error') {
            <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="buscar()" />
          }
          @default {
            @if (inscritos().length === 0) {
              <app-estado icono="school" titulo="No hay inscritos con estos filtros" mensaje="Elige otro curso o cambia los filtros." />
            } @else {
              <table class="tabla">
                <caption>
                  {{ inscritos().length }} {{ inscritos().length === 1 ? 'persona inscrita' : 'personas inscritas' }}{{ inscritos().length === 500 ? ' (se muestran las 500 más recientes; afina los filtros)' : '' }}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Inscripción</th>
                    <th scope="col">Persona</th>
                    <th scope="col">Curso</th>
                    <th scope="col">Contacto</th>
                    <th scope="col">Ciudad</th>
                    <th scope="col">Estado</th>
                    <th scope="col"><span class="solo-lectores">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (i of inscritos(); track i.id) {
                    <tr>
                      <td data-etiqueta="Inscripción">{{ fecha(i.creado) }}</td>
                      <td data-etiqueta="Persona">
                        <strong>{{ i.nombre_completo }}</strong><br />
                        <small class="ayuda">{{ i.tipo_documento }} {{ i.numero_documento }}</small>
                      </td>
                      <td data-etiqueta="Curso">
                        {{ i.curso }}
                        @if (i.modalidad) {
                          <br /><small class="ayuda">{{ i.modalidad }}</small>
                        }
                      </td>
                      <td data-etiqueta="Contacto">
                        {{ i.telefono_contacto || i.telefono }}<br />
                        <small class="ayuda">{{ i.correo }}</small>
                      </td>
                      <td data-etiqueta="Ciudad">{{ i.ciudad }}</td>
                      <td data-etiqueta="Estado"><span class="chip" [class]="'chip chip--' + i.estado">{{ etiqueta[i.estado] }}</span></td>
                      <td data-etiqueta="Detalle">
                        <button mat-stroked-button type="button" (click)="ver(i)" [attr.aria-label]="'Ver la información de ' + i.nombre_completo">Ver</button>
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
export class Cursos {
  private readonly api = inject(AgendaApi);
  private readonly dialog = inject(MatDialog);
  private readonly tituloResultadosRef = viewChild<ElementRef<HTMLElement>>('encabezadoResultados');

  protected readonly valor = valorDe;
  protected readonly fecha = fechaBogota;
  protected readonly etiqueta = ETIQUETA_INSCRIPCION;
  protected readonly estados = (Object.keys(ETIQUETA_INSCRIPCION) as EstadoInscripcion[]).map((valor) => ({ valor, texto: ETIQUETA_INSCRIPCION[valor] }));

  protected readonly estadoCatalogo = signal<'cargando' | 'listo' | 'error'>('cargando');
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
    return 'Todas las personas inscritas';
  });

  constructor() {
    void this.cargarCatalogo();
    void this.buscar();
  }

  protected async cargarCatalogo(): Promise<void> {
    this.estadoCatalogo.set('cargando');
    try {
      this.catalogo.set(await this.api.cursos());
      this.estadoCatalogo.set('listo');
    } catch (e) {
      this.mensajeError.set(mensajeDeError(e));
      this.estadoCatalogo.set('error');
    }
  }

  protected async buscar(): Promise<void> {
    const f = this.filtros();
    this.estado.set('cargando');
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

  /** Clic en un curso del catálogo: lo filtra (o lo quita si ya estaba elegido) y lleva el foco a los resultados. */
  protected async elegirCurso(c: Curso): Promise<void> {
    const yaElegido = this.filtros().cursoId === c.curso_id;
    this.filtros.update((f) => ({
      ...f,
      cursoId: yaElegido ? '' : c.curso_id,
      categoriaId: yaElegido || c.curso_id === SIN_CURSO ? '' : (c.categoria_id ?? ''),
    }));
    await this.buscar();
    this.tituloResultadosRef()?.nativeElement.focus();
  }

  protected limpiar(): void {
    this.filtros.set(SIN_FILTROS);
    void this.buscar();
  }

  protected ver(i: Inscripcion): void {
    this.dialog.open(DetalleInscripcion, { data: i, width: '480px' });
  }
}
