import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, Component, computed, contentChild, effect, ElementRef, inject, Injector, input, model, signal, TemplateRef, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { map } from 'rxjs';

/** Lo que se ve de cada elemento en la lista (dos líneas). */
export interface FilaLista {
  id: number;
  titulo: string;
  /** Texto de la derecha en la primera línea: fecha o tiempo de espera. */
  fecha: string;
  /** Segunda línea, recortada si no cabe. */
  resumen: string;
  chip?: { clave: string; texto: string };
  /** Barra roja: requiere atención. */
  destacada?: boolean;
  /** Ícono de casa: pide atención a domicilio. */
  domicilio?: boolean;
}

/**
 * Patrón «lista + detalle» del administrador: lista compacta y paginada a la izquierda y, al lado, la plantilla
 * del detalle del elemento elegido (recibe su id). Bajo 1000 px el detalle reemplaza la lista. En pantalla ancha
 * siempre hay uno elegido: al cambiar de página, el primero de ella; si el actual deja de estar, el primero de la
 * página en la que se estaba. El panel se crea de nuevo por cada elemento, así nada de lo escrito para una persona
 * pasa a otra. El detalle debe tener un `h2` con `tabindex="-1"`. La paginación es solo de presentación: los
 * filtros y el orden vienen de la base de datos.
 */
@Component({
  selector: 'app-lista-detalle',
  imports: [NgTemplateOutlet, MatButtonModule, MatIconModule],
  template: `
    <div class="maestro" [class.maestro--angosto]="angosto()">
      @if (!angosto() || seleccion() === null) {
        <div class="lista">
          <ul [attr.aria-label]="etiqueta()">
          @for (f of visibles(); track f.id) {
            <li>
              <button
                type="button"
                class="fila-lista"
                [class.fila-lista--destacada]="f.destacada"
                [id]="'fila-' + f.id"
                [attr.aria-current]="seleccion() === f.id ? 'true' : null"
                [disabled]="bloqueada()"
                (click)="elegir(f.id)"
              >
                <span class="linea">
                  <strong class="recortar">{{ f.titulo }}</strong>
                  <span class="fecha">{{ f.fecha }}</span>
                </span>
                <span class="linea">
                  <span class="recortar resumen">{{ f.resumen }}</span>
                  @if (f.chip) {
                    <span class="chip" [class]="'chip chip--' + f.chip.clave">{{ f.chip.texto }}</span>
                  }
                  @if (f.domicilio) {
                    <mat-icon class="domicilio" aria-hidden="true" title="Atención a domicilio">home</mat-icon>
                    <span class="solo-lectores">Atención a domicilio</span>
                  }
                </span>
              </button>
            </li>
          }
          </ul>
          @if (paginas() > 1) {
            <nav class="paginas" [attr.aria-label]="'Páginas de ' + etiqueta()">
              <button
                matIconButton
                type="button"
                aria-label="Página anterior"
                disabledInteractive
                [disabled]="bloqueada() || actual() === 0"
                (click)="irA(actual() - 1)"
              >
                <mat-icon aria-hidden="true">chevron_left</mat-icon>
              </button>
              <p role="status">{{ rango() }} <span>· Página {{ actual() + 1 }} de {{ paginas() }}</span></p>
              <button
                matIconButton
                type="button"
                aria-label="Página siguiente"
                disabledInteractive
                [disabled]="bloqueada() || actual() === paginas() - 1"
                (click)="irA(actual() + 1)"
              >
                <mat-icon aria-hidden="true">chevron_right</mat-icon>
              </button>
            </nav>
          }
        </div>
      }

      @if (seleccion() !== null) {
        <section class="tarjeta panel" aria-label="Detalle">
          @if (angosto()) {
            <button mat-button type="button" class="volver" [disabled]="bloqueada()" (click)="volver()">
              <mat-icon aria-hidden="true">arrow_back</mat-icon>
              Volver a la lista
            </button>
          }
          @for (id of [seleccion()]; track id) {
            <ng-container *ngTemplateOutlet="detalle(); context: { $implicit: id }" />
          }
        </section>
      }
    </div>
  `,
  styles: `
    .maestro {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
      gap: 8px;
      align-items: start;
    }
    .maestro--angosto {
      grid-template-columns: minmax(0, 1fr);
    }
    /* Cada solicitud es su propia tarjeta, separada 8 px de la siguiente (pedido del usuario). */
    .lista ul {
      display: flex;
      flex-direction: column;
      gap: 8px;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .paginas {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 8px;
    }
    .paginas p {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 700;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .paginas p span {
      font-weight: 400;
      color: var(--app-suave);
    }
    .fila-lista {
      width: 100%;
      min-height: 56px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
      padding: 8px 10px;
      border: 1px solid var(--app-borde-suave);
      border-left: 4px solid var(--app-borde);
      border-radius: 10px;
      background: var(--app-superficie);
      box-shadow: var(--app-sombra);
      font: inherit;
      color: var(--app-texto);
      text-align: left;
      cursor: pointer;
    }
    .fila-lista--destacada {
      border-left-color: var(--app-peligro-borde);
    }
    .fila-lista:hover {
      background: var(--app-resaltado);
    }
    .fila-lista[aria-current='true'] {
      border-top-color: var(--app-primario);
      border-right-color: var(--app-primario);
      border-bottom-color: var(--app-primario);
      background: var(--app-primario-suave);
    }
    .linea {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }
    .recortar {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .fecha {
      flex: none;
      font-size: 0.85rem;
      font-weight: 700;
    }
    .resumen {
      font-size: 0.9rem;
      color: var(--app-suave);
    }
    .domicilio {
      flex: none;
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--app-suave);
    }
    .panel {
      min-width: 0;
      padding: 14px 16px;
    }
    .volver {
      margin-bottom: 8px;
    }
  `,
})
export class ListaDetalle {
  readonly filas = input.required<FilaLista[]>();
  readonly etiqueta = input.required<string>();
  /** No deja cambiar de elemento (por ejemplo, mientras el detalle está guardando). */
  readonly bloqueada = input(false);
  readonly porPagina = input(8);
  readonly seleccion = model<number | null>(null);
  protected readonly detalle = contentChild.required(TemplateRef);

  private readonly pagina = signal(0);
  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.filas().length / this.porPagina())));
  /** Página que se muestra (la lista puede haberse acortado). */
  protected readonly actual = computed(() => Math.min(this.pagina(), this.paginas() - 1));
  protected readonly visibles = computed(() => {
    const desde = this.actual() * this.porPagina();
    return this.filas().slice(desde, desde + this.porPagina());
  });
  protected readonly rango = computed(() => {
    const desde = this.actual() * this.porPagina();
    return `${desde + 1}–${desde + this.visibles().length} de ${this.filas().length}`;
  });

  private readonly injector = inject(Injector);
  private readonly anfitrion = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly angosto = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 1000px)')
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  constructor() {
    effect(() => {
      const filas = this.filas();
      const angosto = this.angosto();
      untracked(() => {
        const i = filas.findIndex((f) => f.id === this.seleccion());
        if (i >= 0) {
          this.pagina.set(Math.floor(i / this.porPagina())); // se muestra la página de la elegida
          return;
        }
        this.pagina.set(this.actual());
        this.seleccion.set(angosto ? null : (this.visibles()[0]?.id ?? null));
      });
    });
  }

  protected irA(pagina: number): void {
    if (this.bloqueada() || pagina < 0 || pagina >= this.paginas()) return;
    this.pagina.set(pagina);
    this.seleccion.set(this.angosto() ? null : (this.visibles()[0]?.id ?? null));
  }

  protected elegir(id: number): void {
    this.seleccion.set(id);
    // En pantalla angosta la lista desaparece: el foco pasa al detalle.
    if (this.angosto()) this.enfocar('.panel h2');
  }

  protected volver(): void {
    const id = this.seleccion();
    this.seleccion.set(null);
    this.enfocar(`#fila-${id}`);
  }

  private enfocar(selector: string): void {
    afterNextRender(() => this.anfitrion.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }
}
