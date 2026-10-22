import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { CitaEspecialista, ETIQUETA_ESTADO, EstadoCita } from '../../core/models';
import { fechaBogota, horaBogota } from '../../core/tiempo';

export interface DatosDetalle {
  paciente: string;
  documento: string;
  especialidad: string;
  fecha: string;
  hora: string;
  estado: EstadoCita;
}

export function aDetalle(c: CitaEspecialista): DatosDetalle {
  return {
    paciente: `${c.patient_first_names} ${c.patient_last_names}`,
    documento: `${c.patient_document_type} ${c.patient_document_number}`,
    especialidad: c.specialty_name,
    fecha: fechaBogota(c.starts_at),
    hora: `${horaBogota(c.starts_at)} – ${horaBogota(c.ends_at)}`,
    estado: c.status,
  };
}

/** Detalle de una cita: solo los datos mínimos del paciente (nombre y documento). */
@Component({
  selector: 'app-detalle-cita',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Detalle de la cita</h2>
    <mat-dialog-content>
      <dl class="detalle">
        <dt>Paciente</dt>
        <dd>{{ d.paciente }}</dd>
        <dt>Documento</dt>
        <dd>{{ d.documento }}</dd>
        <dt>Especialidad</dt>
        <dd>{{ d.especialidad }}</dd>
        <dt>Fecha</dt>
        <dd>{{ d.fecha }}</dd>
        <dt>Hora</dt>
        <dd>{{ d.hora }}</dd>
        <dt>Estado</dt>
        <dd>
          <span class="chip" [class]="'chip chip--' + d.estado">{{ etiqueta[d.estado] }}</span>
        </dd>
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
    }
  `,
})
export class DetalleCita {
  protected readonly d = inject<DatosDetalle>(MAT_DIALOG_DATA);
  protected readonly etiqueta = ETIQUETA_ESTADO;
}
