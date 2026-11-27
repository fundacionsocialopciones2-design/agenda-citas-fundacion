import { Component, computed, DestroyRef, inject, input, linkedSignal, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ErrorApi, mensajeDeError } from '../../core/errores';
import { valorDe } from '../../shared/eventos-formulario';

/**
 * Selector «Estado de la gestión» de un panel de detalle. Guarda con la función que recibe (que envía el estado
 * que se estaba viendo, para no pisar un cambio hecho por otra persona) y avisa en qué pestaña quedó. Cambiar el
 * estado no envía mensajes a la persona.
 */
@Component({
  selector: 'app-gestion-estado',
  imports: [MatButtonModule],
  template: `
    @if (error()) {
      <div class="aviso aviso--error" role="alert">{{ error() }}</div>
    }
    <form class="gestion" (submit)="$event.preventDefault(); enviar()">
      <div class="campo">
        <label for="g-estado">Estado de la gestión</label>
        <select id="g-estado" [disabled]="ocupado()" (change)="elegir(valor($event))">
          @for (o of opciones(); track o.valor) {
            <option [value]="o.valor" [selected]="elegido() === o.valor">{{ o.texto }}</option>
          }
        </select>
      </div>
      <button mat-flat-button type="submit" [disabled]="ocupado() || elegido() === estado()">
        {{ ocupado() ? 'Guardando…' : 'Guardar estado' }}
      </button>
    </form>
  `,
})
export class GestionEstado<E extends string> {
  readonly estado = input.required<E>();
  readonly etiquetas = input.required<Record<E, string>>();
  readonly destino = input.required<(estado: E) => string>();
  readonly guardar = input.required<(actual: E, nuevo: E) => Promise<void>>();
  /** Se guardó (o lo que se veía ya no era lo guardado): hay que volver a consultar. */
  readonly cambiada = output<void>();
  readonly ocupado = signal(false);

  private readonly aviso = inject(MatSnackBar);
  private readonly destruccion = inject(DestroyRef);

  protected readonly valor = valorDe;
  protected readonly opciones = computed(() => (Object.keys(this.etiquetas()) as E[]).map((valor) => ({ valor, texto: this.etiquetas()[valor] })));
  /** Aparte para que una recarga sin cambio de estado no borre lo elegido en la lista. */
  private readonly estadoGuardado = computed(() => this.estado());
  protected readonly elegido = linkedSignal<E>(() => this.estadoGuardado());
  protected readonly error = signal<string | null>(null);

  protected elegir(valor: string): void {
    this.elegido.set(valor as E);
  }

  protected async enviar(): Promise<void> {
    const actual = this.estado();
    const nuevo = this.elegido();
    if (this.ocupado() || nuevo === actual) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await this.guardar()(actual, nuevo);
      this.terminar(`Estado actualizado a «${this.etiquetas()[nuevo]}». Quedó en «${this.destino()(nuevo)}».`);
    } catch (e) {
      // Si lo que se ve ya no es lo que hay guardado, se avisa y se vuelve a consultar.
      if (e instanceof ErrorApi && (e.codigo === 'status_changed' || e.codigo === 'request_not_found')) {
        this.terminar(e.message);
      } else {
        this.error.set(mensajeDeError(e));
      }
    } finally {
      this.ocupado.set(false);
    }
  }

  private terminar(mensaje: string): void {
    this.aviso.open(mensaje, 'Cerrar', { duration: 5000 });
    // Si se salió de la pantalla mientras guardaba, ya no hay a quién avisar.
    if (!this.destruccion.destroyed) this.cambiada.emit();
  }
}
