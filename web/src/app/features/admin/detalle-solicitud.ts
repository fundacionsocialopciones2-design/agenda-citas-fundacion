import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ETIQUETA_SOLICITUD, SolicitudAsesoria } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';
import { enlaceLlamada, enlaceWhatsApp, telefonoParaLlamar } from './contacto';

/** Panel con toda la información de una solicitud de asesoría (solo lectura). El «detalle» del caso puede ser sensible. */
@Component({
  selector: 'app-detalle-solicitud',
  imports: [MatButtonModule, MatIconModule],
  host: { class: 'detalle-panel' },
  template: `
    @let s = solicitud();
    <div class="detalle-cabecera">
      <h2 tabindex="-1">{{ s.nombre_completo }}</h2>
      <span class="chip" [class]="'chip chip--' + s.estado">{{ etiqueta[s.estado] }}</span>
    </div>
    <p class="destacado">
      <span class="destacado__etiqueta">Lo que contó la persona</span>
      <span class="destacado__texto caso">{{ s.detalle || 'No escribió detalles del caso.' }}</span>
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
      <dt>Asesoría</dt>
      <dd>{{ s.servicio }}</dd>
      @if (s.categoria) {
        <dt>Categoría</dt>
        <dd>{{ s.categoria }}</dd>
      }
      <dt>Preferencia</dt>
      <dd>{{ s.preferencia || 'Sin preferencia' }}</dd>
      <dt>Solicitud</dt>
      <dd>{{ fecha(s.creado) }}</dd>
      <dt>Documento</dt>
      <dd>{{ s.numero_documento ? s.tipo_documento + ' ' + s.numero_documento : 'No registrado' }}</dd>
      <dt>WhatsApp</dt>
      <dd>{{ s.telefono }}</dd>
      <dt>Teléfono de contacto</dt>
      <dd>{{ s.telefono_contacto || 'El mismo de WhatsApp' }}</dd>
      <dt>Correo</dt>
      <dd>
        @if (s.correo) {
          <a [href]="'mailto:' + s.correo">{{ s.correo }}</a>
        } @else {
          <span class="ayuda">No registrado</span>
        }
      </dd>
      <dt>Modalidad</dt>
      <dd>{{ s.modalidad || 'No indicada' }}</dd>
      @if (s.direccion) {
        <dt>Dirección</dt>
        <dd>{{ s.direccion }}</dd>
      }
      <dt>Autorizó datos</dt>
      <dd>{{ fecha(s.autoriza_datos_at) }}</dd>
    </dl>
    @if (s.notas) {
      <h3>Notas</h3>
      <p class="destacado destacado__texto">{{ s.notas }}</p>
    }
    <p class="ayuda">Información confidencial: no la compartas por fuera de la fundación.</p>
  `,
})
export class DetalleSolicitud {
  readonly solicitud = input.required<SolicitudAsesoria>();
  protected readonly etiqueta = ETIQUETA_SOLICITUD;
  protected readonly fecha = fechaHoraBogota;
  protected readonly llamar = computed(() => enlaceLlamada(this.solicitud()));
  protected readonly whatsapp = computed(() => enlaceWhatsApp(this.solicitud()));
  protected readonly telefono = computed(() => telefonoParaLlamar(this.solicitud()));
}
