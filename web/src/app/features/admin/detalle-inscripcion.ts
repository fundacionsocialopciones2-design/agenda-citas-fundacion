import { Component, computed, inject, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AgendaApi } from '../../core/agenda.api';
import { ETIQUETA_INSCRIPCION, EstadoInscripcion, Inscripcion } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';
import { enlaceLlamada, enlaceWhatsApp, telefonoParaLlamar } from './contacto';
import { GestionEstado } from './gestion-estado';
import { destinoInscripcion } from './pestanas-gestion';

/** Panel con toda la información de una persona inscrita a un curso y el cambio de su estado. */
@Component({
  selector: 'app-detalle-inscripcion',
  imports: [MatButtonModule, MatIconModule, GestionEstado],
  host: { class: 'detalle-panel' },
  template: `
    @let i = inscripcion();
    <div class="detalle-cabecera">
      <h2 tabindex="-1">{{ i.nombre_completo }}</h2>
      <span class="chip" [class]="'chip chip--' + i.estado">{{ etiqueta[i.estado] }}</span>
    </div>
    <p class="destacado">
      <span class="destacado__etiqueta">Curso</span>
      <strong>{{ i.curso }}</strong>
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
    <app-gestion-estado
      [estado]="i.estado"
      [etiquetas]="etiqueta"
      [destino]="destino"
      [guardar]="guardar"
      (cambiada)="cambiada.emit()"
    />
    <dl class="datos">
      @if (i.categoria) {
        <div><dt>Categoría</dt>
        <dd>{{ i.categoria }}</dd></div>
      }
      <div><dt>Modalidad</dt>
      <dd>{{ i.modalidad || 'No indicada' }}</dd></div>
      <div><dt>Inscripción</dt>
      <dd>{{ fecha(i.creado) }}</dd></div>
      <div><dt>Documento</dt>
      <dd>{{ i.tipo_documento }} {{ i.numero_documento }}</dd></div>
      <div><dt>WhatsApp</dt>
      <dd>{{ i.telefono }}</dd></div>
      <div><dt>Teléfono de contacto</dt>
      <dd>{{ i.telefono_contacto || 'El mismo de WhatsApp' }}</dd></div>
      <div><dt>Correo</dt>
      <dd><a [href]="'mailto:' + i.correo">{{ i.correo }}</a></dd></div>
      <div><dt>Ciudad</dt>
      <dd>{{ i.ciudad }}</dd></div>
      <div><dt>Dirección</dt>
      <dd>{{ i.direccion || 'No registrada' }}</dd></div>
      <div><dt>Autorizó datos</dt>
      <dd>{{ fecha(i.autoriza_datos_at) }}</dd></div>
    </dl>
  `,
})
export class DetalleInscripcion {
  readonly inscripcion = input.required<Inscripcion>();
  protected readonly etiqueta = ETIQUETA_INSCRIPCION;
  protected readonly fecha = fechaHoraBogota;
  protected readonly destino = destinoInscripcion;

  /** Se guardó el estado (o lo que se veía ya no era lo guardado): hay que volver a consultar. */
  readonly cambiada = output<void>();
  private readonly api = inject(AgendaApi);
  private readonly gestion = viewChild(GestionEstado);
  /** Mientras guarda, la pantalla no deja cambiar de registro. */
  readonly ocupado = computed(() => this.gestion()?.ocupado() ?? false);

  protected readonly guardar = (actual: EstadoInscripcion, nuevo: EstadoInscripcion) => this.api.cambiarEstadoInscripcion(this.inscripcion().id, actual, nuevo);
  protected readonly llamar = computed(() => enlaceLlamada(this.inscripcion()));
  protected readonly whatsapp = computed(() => enlaceWhatsApp(this.inscripcion()));
  protected readonly telefono = computed(() => telefonoParaLlamar(this.inscripcion()));
}
