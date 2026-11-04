import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { ETIQUETA_INSCRIPCION, Inscripcion } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';

/** Toda la información de una persona inscrita a un curso (solo lectura). */
@Component({
  selector: 'app-detalle-inscripcion',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ i.nombre_completo }}</h2>
    <mat-dialog-content>
      <dl class="detalle">
        <dt>Curso</dt>
        <dd>{{ i.curso }}</dd>
        @if (i.categoria) {
          <dt>Categoría</dt>
          <dd>{{ i.categoria }}</dd>
        }
        <dt>Modalidad</dt>
        <dd>{{ i.modalidad || 'No indicada' }}</dd>
        <dt>Estado</dt>
        <dd><span class="chip" [class]="'chip chip--' + i.estado">{{ etiqueta[i.estado] }}</span></dd>
        <dt>Inscripción</dt>
        <dd>{{ fecha(i.creado) }}</dd>
        <dt>Documento</dt>
        <dd>{{ i.tipo_documento }} {{ i.numero_documento }}</dd>
        <dt>WhatsApp</dt>
        <dd><a [href]="'tel:+' + i.telefono" [attr.aria-label]="'Llamar al ' + i.telefono">{{ i.telefono }}</a></dd>
        <dt>Teléfono de contacto</dt>
        <dd>
          @if (i.telefono_contacto) {
            <a [href]="'tel:' + i.telefono_contacto" [attr.aria-label]="'Llamar al ' + i.telefono_contacto">{{ i.telefono_contacto }}</a>
          } @else {
            <span class="ayuda">El mismo de WhatsApp</span>
          }
        </dd>
        <dt>Correo</dt>
        <dd><a [href]="'mailto:' + i.correo">{{ i.correo }}</a></dd>
        <dt>Ciudad</dt>
        <dd>{{ i.ciudad }}</dd>
        <dt>Dirección</dt>
        <dd>{{ i.direccion || 'No registrada' }}</dd>
        <dt>Autorizó datos</dt>
        <dd>{{ fecha(i.autoriza_datos_at) }}</dd>
      </dl>
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
  `,
})
export class DetalleInscripcion {
  protected readonly i = inject<Inscripcion>(MAT_DIALOG_DATA);
  protected readonly etiqueta = ETIQUETA_INSCRIPCION;
  protected readonly fecha = fechaHoraBogota;
}
