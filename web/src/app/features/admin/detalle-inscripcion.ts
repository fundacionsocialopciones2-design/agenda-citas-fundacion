import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ETIQUETA_INSCRIPCION, Inscripcion } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';
import { enlaceLlamada, enlaceWhatsApp, telefonoParaLlamar } from './contacto';

/** Panel con toda la información de una persona inscrita a un curso (solo lectura). */
@Component({
  selector: 'app-detalle-inscripcion',
  imports: [MatButtonModule, MatIconModule],
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
    <dl class="datos">
      @if (i.categoria) {
        <dt>Categoría</dt>
        <dd>{{ i.categoria }}</dd>
      }
      <dt>Modalidad</dt>
      <dd>{{ i.modalidad || 'No indicada' }}</dd>
      <dt>Inscripción</dt>
      <dd>{{ fecha(i.creado) }}</dd>
      <dt>Documento</dt>
      <dd>{{ i.tipo_documento }} {{ i.numero_documento }}</dd>
      <dt>WhatsApp</dt>
      <dd>{{ i.telefono }}</dd>
      <dt>Teléfono de contacto</dt>
      <dd>{{ i.telefono_contacto || 'El mismo de WhatsApp' }}</dd>
      <dt>Correo</dt>
      <dd><a [href]="'mailto:' + i.correo">{{ i.correo }}</a></dd>
      <dt>Ciudad</dt>
      <dd>{{ i.ciudad }}</dd>
      <dt>Dirección</dt>
      <dd>{{ i.direccion || 'No registrada' }}</dd>
      <dt>Autorizó datos</dt>
      <dd>{{ fecha(i.autoriza_datos_at) }}</dd>
    </dl>
  `,
})
export class DetalleInscripcion {
  readonly inscripcion = input.required<Inscripcion>();
  protected readonly etiqueta = ETIQUETA_INSCRIPCION;
  protected readonly fecha = fechaHoraBogota;
  protected readonly llamar = computed(() => enlaceLlamada(this.inscripcion()));
  protected readonly whatsapp = computed(() => enlaceWhatsApp(this.inscripcion()));
  protected readonly telefono = computed(() => telefonoParaLlamar(this.inscripcion()));
}
