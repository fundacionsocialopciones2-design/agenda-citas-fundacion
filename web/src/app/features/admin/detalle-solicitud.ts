import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { ETIQUETA_SOLICITUD, SolicitudAsesoria } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';

/** Toda la información de una solicitud de asesoría (solo lectura). El «detalle» del caso puede ser sensible. */
@Component({
  selector: 'app-detalle-solicitud',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ s.nombre_completo }}</h2>
    <mat-dialog-content>
      <dl class="detalle">
        <dt>Asesoría</dt>
        <dd>{{ s.servicio }}</dd>
        @if (s.categoria) {
          <dt>Categoría</dt>
          <dd>{{ s.categoria }}</dd>
        }
        <dt>Estado</dt>
        <dd><span class="chip" [class]="'chip chip--' + s.estado">{{ etiqueta[s.estado] }}</span></dd>
        <dt>Solicitud</dt>
        <dd>{{ fecha(s.creado) }}</dd>
        <dt>Documento</dt>
        <dd>{{ s.numero_documento ? s.tipo_documento + ' ' + s.numero_documento : 'No registrado' }}</dd>
        <dt>WhatsApp</dt>
        <dd><a [href]="'tel:+' + s.telefono" [attr.aria-label]="'Llamar al ' + s.telefono">{{ s.telefono }}</a></dd>
        <dt>Teléfono de contacto</dt>
        <dd>
          @if (s.telefono_contacto) {
            <a [href]="'tel:' + s.telefono_contacto" [attr.aria-label]="'Llamar al ' + s.telefono_contacto">{{ s.telefono_contacto }}</a>
          } @else {
            <span class="ayuda">El mismo de WhatsApp</span>
          }
        </dd>
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
        <dt>Preferencia</dt>
        <dd>{{ s.preferencia || 'Sin preferencia' }}</dd>
        <dt>Autorizó datos</dt>
        <dd>{{ fecha(s.autoriza_datos_at) }}</dd>
      </dl>

      <h3>Lo que contó la persona</h3>
      <p class="caso">{{ s.detalle || 'No escribió detalles del caso.' }}</p>
      @if (s.notas) {
        <h3>Notas</h3>
        <p class="caso">{{ s.notas }}</p>
      }
      <p class="ayuda">Información confidencial: no la compartas por fuera de la fundación.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button type="button" mat-dialog-close cdkFocusInitial>Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
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
export class DetalleSolicitud {
  protected readonly s = inject<SolicitudAsesoria>(MAT_DIALOG_DATA);
  protected readonly etiqueta = ETIQUETA_SOLICITUD;
  protected readonly fecha = fechaHoraBogota;
}
