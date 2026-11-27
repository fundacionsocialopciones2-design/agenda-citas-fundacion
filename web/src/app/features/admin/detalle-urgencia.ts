import { Component, computed, DestroyRef, ElementRef, inject, input, linkedSignal, model, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgendaApi } from '../../core/agenda.api';
import { ErrorApi, mensajeDeError } from '../../core/errores';
import { ETIQUETA_SOLICITUD, EstadoSolicitud, Urgencia } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';
import { valorDe } from '../../shared/eventos-formulario';
import { enlaceLlamada, enlaceWhatsApp, telefonoParaLlamar } from './contacto';

/** Pestaña de «Urgencias» en la que queda cada estado. */
const PESTANA: Record<EstadoSolicitud, string> = {
  pendiente: 'Sin atender',
  contactado: 'En gestión',
  agendada: 'En gestión',
  atendida: 'Historial',
  cancelada: 'Historial',
};

/**
 * Panel con el detalle de una urgencia: todos los datos de la persona, cómo contactarla, cambio de estado y notas
 * de seguimiento (se acumulan; no se editan ni se borran). Lo que se escribe aquí no se envía a la persona.
 */
@Component({
  selector: 'app-detalle-urgencia',
  imports: [MatButtonModule, MatIconModule],
  template: `
    @let u = urgencia();
    <div class="cabecera">
      <h2 #titulo tabindex="-1">{{ u.nombre_completo }}</h2>
      <span class="chip" [class]="'chip chip--' + u.estado">{{ etiqueta[u.estado] }}</span>
    </div>

    <p class="caso">
      <span class="caso__etiqueta">Lo que le pasa</span>
      {{ u.detalle || 'No escribió lo que le pasa.' }}
    </p>
    <p class="lugar">
      <strong>{{ u.modalidad || 'Atención no indicada' }}</strong>
      @if (u.direccion) {
        · {{ u.direccion }}
      }
    </p>

    <div class="acciones">
      <a mat-flat-button [href]="llamar()">
        <mat-icon aria-hidden="true">call</mat-icon>
        Llamar al {{ telefono() }}
      </a>
      <a mat-stroked-button [href]="whatsapp()" target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp (se abre en otra pestaña)">
        <mat-icon aria-hidden="true">chat</mat-icon>
        WhatsApp
      </a>
    </div>

    @if (error()) {
      <div class="aviso aviso--error" role="alert">{{ error() }}</div>
    }

    <form class="gestion" (submit)="$event.preventDefault(); guardarEstado()">
      <div class="campo gestion__campo">
        <label for="u-estado">Estado de la gestión</label>
        <select id="u-estado" [disabled]="ocupado()" (change)="elegir(valor($event))">
          @for (e of estados; track e.valor) {
            <option [value]="e.valor" [selected]="estado() === e.valor">{{ e.texto }}</option>
          }
        </select>
      </div>
      <button mat-flat-button type="submit" [disabled]="ocupado() || estado() === u.estado">Guardar estado</button>
    </form>

    <h3>Seguimiento</h3>
    @if (notas().length) {
      <ol class="notas">
        @for (n of notas(); track $index) {
          <li>{{ n }}</li>
        }
      </ol>
    } @else {
      <p class="ayuda">Todavía no hay notas.</p>
    }
    <form (submit)="$event.preventDefault(); agregarNota()">
      <div class="campo">
        <label for="u-nota">Nueva nota</label>
        <textarea
          id="u-nota"
          rows="2"
          maxlength="500"
          placeholder="Ej.: Llamé, viene a la sede a las 2 p. m."
          [value]="nota()"
          [disabled]="ocupado()"
          (input)="nota.set(valor($event))"
        ></textarea>
      </div>
      <button mat-stroked-button type="submit" [disabled]="ocupado() || !nota().trim()">Agregar nota</button>
    </form>

    <h3>Datos de la persona</h3>
    <dl class="datos">
      <div><dt>Documento</dt>
      <dd>{{ u.numero_documento ? u.tipo_documento + ' ' + u.numero_documento : 'No registrado' }}</dd></div>
      <div><dt>WhatsApp</dt>
      <dd>{{ u.telefono }}</dd></div>
      <div><dt>Teléfono de contacto</dt>
      <dd>{{ u.telefono_contacto || 'El mismo de WhatsApp' }}</dd></div>
      @if (u.correo) {
        <div><dt>Correo</dt>
        <dd><a [href]="'mailto:' + u.correo">{{ u.correo }}</a></dd></div>
      }
      <div><dt>Reportada</dt>
      <dd>{{ fecha(u.creado) }}</dd></div>
      <div><dt>Autorizó datos</dt>
      <dd>{{ fecha(u.autoriza_datos_at) }}</dd></div>
    </dl>
    <p class="ayuda">Información confidencial de salud. Cambiar el estado o escribir notas no envía mensajes a la persona.</p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    h2,
    h3,
    p,
    .gestion {
      margin: 0;
    }
    .cabecera {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    h2 {
      font-size: 1.25rem;
      overflow-wrap: anywhere;
    }
    h3 {
      margin-top: 8px;
      font-size: 1rem;
    }
    .caso {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--app-fondo);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .caso__etiqueta {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--app-suave);
    }
    .lugar {
      overflow-wrap: anywhere;
    }
    .gestion {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 12px;
    }
    .gestion__campo {
      flex: 1 1 180px;
      margin: 0;
    }
    .notas {
      margin: 0;
      padding-left: 20px;
      overflow-wrap: anywhere;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
    }
    .datos {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 8px 16px;
      margin: 0;
    }
    dt {
      font-weight: 700;
      color: var(--app-suave);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  `,
})
export class DetalleUrgencia {
  readonly urgencia = input.required<Urgencia>();
  /** Nota que se está escribiendo; la pantalla la conserva si se pasa a otra urgencia. */
  readonly nota = model('');
  /** Se guardó un estado o una nota (o lo que se veía ya no era lo guardado): hay que volver a consultar. */
  readonly cambiada = output<void>();
  /** Mientras guarda, la pantalla no deja cambiar de urgencia. */
  readonly ocupado = signal(false);

  private readonly api = inject(AgendaApi);
  private readonly aviso = inject(MatSnackBar);
  private readonly destruccion = inject(DestroyRef);
  private readonly titulo = viewChild<ElementRef<HTMLElement>>('titulo');

  protected readonly valor = valorDe;
  protected readonly fecha = fechaHoraBogota;
  protected readonly etiqueta = ETIQUETA_SOLICITUD;
  protected readonly estados = (Object.keys(ETIQUETA_SOLICITUD) as EstadoSolicitud[]).map((valor) => ({ valor, texto: ETIQUETA_SOLICITUD[valor] }));

  protected readonly llamar = computed(() => enlaceLlamada(this.urgencia()));
  protected readonly whatsapp = computed(() => enlaceWhatsApp(this.urgencia()));
  protected readonly telefono = computed(() => telefonoParaLlamar(this.urgencia()));

  /** Aparte para que una recarga sin cambio de estado no borre lo elegido en la lista. */
  private readonly estadoGuardado = computed(() => this.urgencia().estado);
  protected readonly estado = linkedSignal(() => this.estadoGuardado());
  protected readonly notas = linkedSignal(() => this.urgencia().notas);
  protected readonly error = signal<string | null>(null);

  enfocar(): void {
    this.titulo()?.nativeElement.focus();
  }

  protected elegir(estado: string): void {
    this.estado.set(estado as EstadoSolicitud);
  }

  protected async agregarNota(): Promise<void> {
    if (!this.nota().trim()) return;
    await this.ejecutar(async () => {
      await this.guardarNota(this.urgencia().id);
      return null;
    });
  }

  /** Si hay una nota escrita sin agregar, se guarda junto con el estado para que no se pierda. */
  protected async guardarEstado(): Promise<void> {
    const { id, estado: actual } = this.urgencia();
    const nuevo = this.estado();
    if (nuevo === actual) return;
    await this.ejecutar(async () => {
      if (this.nota().trim()) await this.guardarNota(id);
      await this.api.cambiarEstadoUrgencia(id, actual, nuevo);
      return `Estado actualizado a «${ETIQUETA_SOLICITUD[nuevo]}». Quedó en «${PESTANA[nuevo]}».`;
    });
  }

  private async guardarNota(id: number): Promise<void> {
    this.notas.set(await this.api.agregarNotaUrgencia(id, this.nota().trim()));
    this.nota.set('');
  }

  /** `accion` devuelve el aviso que se muestra al terminar, o null si no hace falta. */
  private async ejecutar(accion: () => Promise<string | null>): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      this.terminar(await accion());
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

  private terminar(mensaje: string | null): void {
    if (mensaje) this.aviso.open(mensaje, 'Cerrar', { duration: 5000 });
    // Si se salió de la pantalla mientras guardaba, ya no hay a quién avisar.
    if (!this.destruccion.destroyed) this.cambiada.emit();
  }
}
