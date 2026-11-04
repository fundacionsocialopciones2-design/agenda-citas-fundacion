import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { ETIQUETA_SOLICITUD, EstadoSolicitud, FiltrosAsesorias, SIN_SERVICIO, SolicitudAsesoria, TipoAsesoria } from '../../core/models';
import { fechaBogota } from '../../core/tiempo';
import { Estado } from '../../shared/estado';
import { valorDe } from '../../shared/eventos-formulario';
import { agruparPorCategoria } from './agrupar-catalogo';
import { DetalleSolicitud } from './detalle-solicitud';

const SIN_FILTROS: FiltrosAsesorias = { servicioId: '', categoriaId: '', estado: '', busqueda: '' };

/**
 * Asesorías jurídicas y generales que ofrece el chatbot (catálogo = menú del bot) y las solicitudes hechas
 * por WhatsApp. Solo lectura. Los datos llegan de admin_asesorias / admin_solicitudes_asesoria (exigen admin).
 */
@Component({
  selector: 'app-asesorias',
  imports: [MatButtonModule, MatIconModule, Estado],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Asesorías</h1>
          <p>Asesorías jurídicas y generales que ofrece el chatbot, y las solicitudes que llegaron por WhatsApp. Elige un tipo para ver sus solicitudes.</p>
        </div>
      </div>

      @switch (estadoCatalogo()) {
        @case ('cargando') {
          <app-estado tipo="cargando" titulo="Cargando asesorías…" />
        }
        @case ('error') {
          <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="cargarCatalogo()" />
        }
        @default {
          <section class="catalogo" aria-label="Tipos de asesoría">
            @for (g of categorias(); track g.nombre) {
              <article class="tarjeta catalogo-categoria">
                <h2>{{ g.nombre }} <span class="contador" [attr.aria-label]="g.total + ' solicitudes'">{{ g.total }}</span></h2>
                <ul class="catalogo-lista">
                  @for (t of g.elementos; track t.servicio_id) {
                    <li>
                      <button
                        type="button"
                        class="catalogo-item"
                        [class.catalogo-item--vacio]="t.solicitudes === 0"
                        [attr.aria-pressed]="filtros().servicioId === t.servicio_id"
                        (click)="elegirTipo(t)"
                      >
                        <span class="catalogo-item__texto">
                          <span class="catalogo-item__titulo">{{ t.titulo }}</span>
                          @if (t.grupo || !t.activo) {
                            <span class="catalogo-item__nota">{{ t.grupo }}{{ t.grupo && !t.activo ? ' · ' : '' }}{{ t.activo ? '' : 'No disponible en el menú' }}</span>
                          }
                        </span>
                        <span class="catalogo-item__cifra">{{ t.solicitudes }}<span class="solo-lectores"> {{ t.solicitudes === 1 ? 'solicitud' : 'solicitudes' }}</span></span>
                      </button>
                    </li>
                  }
                </ul>
              </article>
            }
          </section>
        }
      }

      <form class="tarjeta" (submit)="$event.preventDefault(); buscar()" aria-label="Filtros de solicitudes">
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
            <label for="f-tipo">Tipo de asesoría</label>
            <select id="f-tipo" (change)="cambiar('servicioId', valor($event))">
              <option value="" [selected]="!filtros().servicioId">Todos</option>
              @for (t of tiposDelFiltro(); track t.servicio_id) {
                <option [value]="t.servicio_id" [selected]="filtros().servicioId === t.servicio_id">{{ t.titulo }} ({{ t.solicitudes }})</option>
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

      <section aria-labelledby="t-solicitudes">
        <h2 id="t-solicitudes" class="titulo-resultados" tabindex="-1" #encabezadoResultados>{{ tituloResultados() }}</h2>
        @switch (estado()) {
          @case ('cargando') {
            <app-estado tipo="cargando" titulo="Cargando solicitudes…" />
          }
          @case ('error') {
            <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="buscar()" />
          }
          @default {
            @if (solicitudes().length === 0) {
              <app-estado icono="gavel" titulo="No hay solicitudes con estos filtros" mensaje="Cuando alguien pida una asesoría por WhatsApp, aparecerá aquí." />
            } @else {
              <table class="tabla">
                <caption>
                  {{ solicitudes().length }} {{ solicitudes().length === 1 ? 'solicitud' : 'solicitudes' }}{{ solicitudes().length === 500 ? ' (se muestran las 500 más recientes; afina los filtros)' : '' }}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Solicitud</th>
                    <th scope="col">Persona</th>
                    <th scope="col">Asesoría</th>
                    <th scope="col">Contacto</th>
                    <th scope="col">Estado</th>
                    <th scope="col"><span class="solo-lectores">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (s of solicitudes(); track s.id) {
                    <tr>
                      <td data-etiqueta="Solicitud">{{ fecha(s.creado) }}</td>
                      <td data-etiqueta="Persona">
                        <strong>{{ s.nombre_completo }}</strong>
                        @if (s.numero_documento) {
                          <br /><small class="ayuda">{{ s.tipo_documento }} {{ s.numero_documento }}</small>
                        }
                      </td>
                      <td data-etiqueta="Asesoría">
                        {{ s.servicio }}
                        @if (s.categoria) {
                          <br /><small class="ayuda">{{ s.categoria }}</small>
                        }
                      </td>
                      <td data-etiqueta="Contacto">
                        {{ s.telefono_contacto || s.telefono }}
                        @if (s.correo) {
                          <br /><small class="ayuda">{{ s.correo }}</small>
                        }
                      </td>
                      <td data-etiqueta="Estado"><span class="chip" [class]="'chip chip--' + s.estado">{{ etiqueta[s.estado] }}</span></td>
                      <td data-etiqueta="Detalle">
                        <button mat-stroked-button type="button" (click)="ver(s)" [attr.aria-label]="'Ver la solicitud de ' + s.nombre_completo">Ver</button>
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
export class Asesorias {
  private readonly api = inject(AgendaApi);
  private readonly dialog = inject(MatDialog);
  private readonly encabezado = viewChild<ElementRef<HTMLElement>>('encabezadoResultados');

  protected readonly valor = valorDe;
  protected readonly fecha = fechaBogota;
  protected readonly etiqueta = ETIQUETA_SOLICITUD;
  protected readonly estados = (Object.keys(ETIQUETA_SOLICITUD) as EstadoSolicitud[]).map((valor) => ({ valor, texto: ETIQUETA_SOLICITUD[valor] }));

  protected readonly estadoCatalogo = signal<'cargando' | 'listo' | 'error'>('cargando');
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
    return 'Todas las solicitudes de asesoría';
  });

  constructor() {
    void this.cargarCatalogo();
    void this.buscar();
  }

  protected async cargarCatalogo(): Promise<void> {
    this.estadoCatalogo.set('cargando');
    try {
      this.catalogo.set(await this.api.asesorias());
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

  /** Clic en un tipo del catálogo: lo filtra (o lo quita si ya estaba elegido) y lleva el foco a los resultados. */
  protected async elegirTipo(t: TipoAsesoria): Promise<void> {
    const yaElegido = this.filtros().servicioId === t.servicio_id;
    this.filtros.update((f) => ({
      ...f,
      servicioId: yaElegido ? '' : t.servicio_id,
      categoriaId: yaElegido || t.servicio_id === SIN_SERVICIO ? '' : (t.categoria_id ?? ''),
    }));
    await this.buscar();
    this.encabezado()?.nativeElement.focus();
  }

  protected limpiar(): void {
    this.filtros.set(SIN_FILTROS);
    void this.buscar();
  }

  protected ver(s: SolicitudAsesoria): void {
    this.dialog.open(DetalleSolicitud, { data: s, width: '520px' });
  }
}
