import { BreakpointObserver } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, Component, contentChild, effect, ElementRef, inject, Injector, input, model, TemplateRef, untracked } from '@angular/core';
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
 * Patrón «lista + detalle» del administrador: lista compacta a la izquierda y, al lado, la plantilla del detalle
 * del elemento elegido (recibe su id). Bajo 1000 px el detalle reemplaza la lista. En pantalla ancha siempre hay
 * uno elegido: si el actual deja de estar, se pasa al primero. El panel se crea de nuevo por cada elemento, así
 * nada de lo escrito para una persona pasa a otra. El detalle debe tener un `h2` con `tabindex="-1"`.
 */
@Component({
  selector: 'app-lista-detalle',
  imports: [NgTemplateOutlet, MatButtonModule, MatIconModule],
  template: `
    <div class="maestro" [class.maestro--angosto]="angosto()">
      @if (!angosto() || seleccion() === null) {
        <ul class="tarjeta lista" [attr.aria-label]="etiqueta()">
          @for (f of filas(); track f.id) {
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
      grid-template-columns: minmax(280px, 2fr) minmax(0, 3fr);
      gap: 16px;
      align-items: start;
    }
    .maestro--angosto {
      grid-template-columns: minmax(0, 1fr);
    }
    /* En pantallas anchas la lista y el detalle se desplazan por separado: la página no crece. */
    .maestro:not(.maestro--angosto) > * {
      max-height: max(420px, calc(100dvh - 340px));
      overflow-y: auto;
    }
    .lista {
      list-style: none;
      margin: 0;
      padding: 6px;
    }
    .lista li + li {
      border-top: 1px solid var(--app-borde-suave);
    }
    .fila-lista {
      width: 100%;
      min-height: 56px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 10px;
      border: 0;
      border-left: 4px solid var(--app-borde);
      border-radius: 6px;
      background: transparent;
      font: inherit;
      color: var(--app-texto);
      text-align: left;
      cursor: pointer;
    }
    .fila-lista--destacada {
      border-left-color: var(--app-peligro-borde);
    }
    .fila-lista:hover {
      background: var(--app-fondo);
    }
    .fila-lista[aria-current='true'] {
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
  readonly seleccion = model<number | null>(null);
  protected readonly detalle = contentChild.required(TemplateRef);

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
        if (!filas.some((f) => f.id === this.seleccion())) this.seleccion.set(angosto ? null : (filas[0]?.id ?? null));
      });
    });
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
