import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgendaApi } from '../../core/agenda.api';
import { ErrorApi, mensajeDeError } from '../../core/errores';
import { CitaPendiente, ETIQUETA_SOLICITUD, EstadoSolicitud } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';
import { valorDe } from '../../shared/eventos-formulario';

/** Valor con el que se cierra el detalle cuando la solicitud cambió (la lista debe recargarse). */
export type ResultadoCitaPendiente = 'actualizada';

/**
 * Toda la información de una cita abierta del bot (lo que la persona pidió y cómo contactarla) y el cambio de
 * estado con el que el administrador lleva su gestión. Cambiar el estado no crea la cita ni avisa a la persona.
 */
@Component({
  selector: 'app-detalle-cita-pendiente',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ c.nombre_completo }}</h2>
    <mat-dialog-content>
      <p class="pedido">
        <span class="pedido__etiqueta">Día y hora que pidió</span>
        <strong>{{ c.preferencia || 'No lo indicó' }}</strong>
      </p>

      <form class="gestion" (submit)="$event.preventDefault(); guardar()">
        @if (error()) {
          <div class="aviso aviso--error" role="alert">{{ error() }}</div>
        }
        <div class="gestion__fila">
          <div class="campo gestion__campo">
            <label for="d-estado">Estado de la gestión</label>
            <select id="d-estado" [disabled]="ocupado()" (change)="elegir(valor($event))">
              @for (e of estados; track e.valor) {
                <option [value]="e.valor" [selected]="estado() === e.valor">{{ e.texto }}</option>
              }
            </select>
          </div>
          <button mat-flat-button type="submit" [disabled]="ocupado() || estado() === c.estado">
            {{ ocupado() ? 'Guardando…' : 'Guardar estado' }}
          </button>
        </div>
      </form>

      <dl class="detalle">
        <dt>Servicio</dt>
        <dd>{{ c.servicio }}</dd>
        @if (c.grupo) {
          <dt>Grupo</dt>
          <dd>{{ c.grupo }}</dd>
        }
        <dt>Motivo</dt>
        <dd>{{ c.motivo || 'No registrado' }}</dd>
        <dt>Solicitud</dt>
        <dd>{{ fecha(c.creado) }}</dd>
        <dt>Documento</dt>
        <dd>{{ c.numero_documento ? c.tipo_documento + ' ' + c.numero_documento : 'No registrado' }}</dd>
        <dt>WhatsApp</dt>
        <dd><a [href]="'tel:+' + c.telefono" [attr.aria-label]="'Llamar al ' + c.telefono">{{ c.telefono }}</a></dd>
        <dt>Teléfono de contacto</dt>
        <dd>
          @if (c.telefono_contacto) {
            <a [href]="'tel:' + c.telefono_contacto" [attr.aria-label]="'Llamar al ' + c.telefono_contacto">{{ c.telefono_contacto }}</a>
          } @else {
            <span class="ayuda">El mismo de WhatsApp</span>
          }
        </dd>
        @if (c.correo) {
          <dt>Correo</dt>
          <dd><a [href]="'mailto:' + c.correo">{{ c.correo }}</a></dd>
        }
        <dt>Atención</dt>
        <dd>{{ c.modalidad || 'No indicada' }}</dd>
        @if (c.direccion) {
          <dt>Dirección</dt>
          <dd>{{ c.direccion }}</dd>
        }
        <dt>Autorizó datos</dt>
        <dd>{{ fecha(c.autoriza_datos_at) }}</dd>
      </dl>
      @if (c.detalle) {
        <h3>Lo que contó la persona</h3>
        <p class="caso">{{ c.detalle }}</p>
      }
      @if (c.notas) {
        <h3>Notas</h3>
        <p class="caso">{{ c.notas }}</p>
      }
      <p class="ayuda">Cambiar el estado no crea la cita en la agenda ni envía un mensaje a la persona.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close cdkFocusInitial [disabled]="ocupado()">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .pedido {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0 0 16px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--app-fondo);
    }
    .pedido__etiqueta {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--app-suave);
    }
    .gestion {
      margin: 0 0 16px;
    }
    .gestion__fila {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 12px;
    }
    .gestion__campo {
      flex: 1 1 200px;
      margin: 0;
    }
    .detalle {
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
    h3 {
      margin: 16px 0 6px;
      font-size: 1rem;
    }
    .caso {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--app-fondo);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
})
export class DetalleCitaPendiente {
  protected readonly c = inject<CitaPendiente>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<DetalleCitaPendiente, ResultadoCitaPendiente>);
  private readonly api = inject(AgendaApi);
  private readonly aviso = inject(MatSnackBar);

  protected readonly valor = valorDe;
  protected readonly fecha = fechaHoraBogota;
  protected readonly estados = (Object.keys(ETIQUETA_SOLICITUD) as EstadoSolicitud[]).map((valor) => ({ valor, texto: ETIQUETA_SOLICITUD[valor] }));

  protected readonly estado = signal<EstadoSolicitud>(this.c.estado);
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  protected elegir(estado: string): void {
    this.estado.set(estado as EstadoSolicitud);
  }

  protected async guardar(): Promise<void> {
    const nuevo = this.estado();
    if (this.ocupado() || nuevo === this.c.estado) return;
    this.ocupado.set(true);
    this.error.set(null);
    this.ref.disableClose = true;
    try {
      await this.api.cambiarEstadoCitaPendiente(this.c.id, this.c.estado, nuevo);
      this.terminar(`Estado actualizado a «${ETIQUETA_SOLICITUD[nuevo]}».`);
    } catch (e) {
      // Si lo que se ve ya no es lo que hay guardado, se cierra para que la lista se vuelva a cargar.
      if (e instanceof ErrorApi && (e.codigo === 'status_changed' || e.codigo === 'request_not_found')) {
        this.terminar(e.message);
      } else {
        this.error.set(mensajeDeError(e));
        this.ref.disableClose = false;
        this.ocupado.set(false);
      }
    }
  }

  private terminar(mensaje: string): void {
    this.aviso.open(mensaje, 'Cerrar', { duration: 5000 });
    this.ref.close('actualizada');
  }
}
