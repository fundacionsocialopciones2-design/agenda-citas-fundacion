import { Component, computed, DestroyRef, inject, input, linkedSignal, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgendaApi } from '../../core/agenda.api';
import { ErrorApi, mensajeDeError } from '../../core/errores';
import { CitaPendiente, ETIQUETA_SOLICITUD, EstadoSolicitud } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';
import { valorDe } from '../../shared/eventos-formulario';
import { enlaceLlamada, enlaceWhatsApp, telefonoParaLlamar } from './contacto';

/**
 * Panel de una cita abierta del bot (lo que la persona pidió y cómo contactarla) con el cambio de estado con el
 * que el administrador lleva su gestión. Cambiar el estado no crea la cita ni avisa a la persona.
 */
@Component({
  selector: 'app-detalle-cita-pendiente',
  imports: [MatButtonModule, MatIconModule],
  host: { class: 'detalle-panel' },
  template: `
    @let c = cita();
    <div class="detalle-cabecera">
      <h2 tabindex="-1">{{ c.nombre_completo }}</h2>
      <span class="chip" [class]="'chip chip--' + c.estado">{{ etiqueta[c.estado] }}</span>
    </div>
    <p class="destacado">
      <span class="destacado__etiqueta">Día y hora que pidió</span>
      <strong>{{ c.preferencia || 'No lo indicó' }}</strong>
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
    <form class="gestion" (submit)="$event.preventDefault(); guardar()">
      <div class="campo">
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
    </form>

    <dl class="datos">
      <div><dt>Servicio</dt>
      <dd>{{ c.servicio }}</dd></div>
      @if (c.grupo) {
        <div><dt>Grupo</dt>
        <dd>{{ c.grupo }}</dd></div>
      }
      <div><dt>Motivo</dt>
      <dd>{{ c.motivo || 'No registrado' }}</dd></div>
      <div><dt>Solicitud</dt>
      <dd>{{ fecha(c.creado) }}</dd></div>
      <div><dt>Documento</dt>
      <dd>{{ c.numero_documento ? c.tipo_documento + ' ' + c.numero_documento : 'No registrado' }}</dd></div>
      <div><dt>WhatsApp</dt>
      <dd>{{ c.telefono }}</dd></div>
      <div><dt>Teléfono de contacto</dt>
      <dd>{{ c.telefono_contacto || 'El mismo de WhatsApp' }}</dd></div>
      @if (c.correo) {
        <div><dt>Correo</dt>
        <dd><a [href]="'mailto:' + c.correo">{{ c.correo }}</a></dd></div>
      }
      <div><dt>Atención</dt>
      <dd>{{ c.modalidad || 'No indicada' }}</dd></div>
      @if (c.direccion) {
        <div><dt>Dirección</dt>
        <dd>{{ c.direccion }}</dd></div>
      }
      <div><dt>Autorizó datos</dt>
      <dd>{{ fecha(c.autoriza_datos_at) }}</dd></div>
    </dl>
    @if (c.detalle) {
      <h3>Lo que contó la persona</h3>
      <p class="destacado destacado__texto">{{ c.detalle }}</p>
    }
    @if (c.notas) {
      <h3>Notas</h3>
      <p class="destacado destacado__texto">{{ c.notas }}</p>
    }
    <p class="ayuda">Cambiar el estado no crea la cita en la agenda ni envía un mensaje a la persona.</p>
  `,
})
export class DetalleCitaPendiente {
  readonly cita = input.required<CitaPendiente>();
  /** Se guardó el estado (o lo que se veía ya no era lo guardado): hay que volver a consultar. */
  readonly cambiada = output<void>();
  /** Mientras guarda, la pantalla no deja cambiar de solicitud. */
  readonly ocupado = signal(false);

  private readonly api = inject(AgendaApi);
  private readonly aviso = inject(MatSnackBar);
  private readonly destruccion = inject(DestroyRef);

  protected readonly valor = valorDe;
  protected readonly fecha = fechaHoraBogota;
  protected readonly etiqueta = ETIQUETA_SOLICITUD;
  protected readonly estados = (Object.keys(ETIQUETA_SOLICITUD) as EstadoSolicitud[]).map((valor) => ({ valor, texto: ETIQUETA_SOLICITUD[valor] }));

  protected readonly llamar = computed(() => enlaceLlamada(this.cita()));
  protected readonly whatsapp = computed(() => enlaceWhatsApp(this.cita()));
  protected readonly telefono = computed(() => telefonoParaLlamar(this.cita()));

  /** Aparte para que una recarga sin cambio de estado no borre lo elegido en la lista. */
  private readonly estadoGuardado = computed(() => this.cita().estado);
  protected readonly estado = linkedSignal(() => this.estadoGuardado());
  protected readonly error = signal<string | null>(null);

  protected elegir(estado: string): void {
    this.estado.set(estado as EstadoSolicitud);
  }

  protected async guardar(): Promise<void> {
    const { id, estado: actual } = this.cita();
    const nuevo = this.estado();
    if (this.ocupado() || nuevo === actual) return;
    this.ocupado.set(true);
    this.error.set(null);
    try {
      await this.api.cambiarEstadoCitaPendiente(id, actual, nuevo);
      this.terminar(`Estado actualizado a «${ETIQUETA_SOLICITUD[nuevo]}».`);
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
