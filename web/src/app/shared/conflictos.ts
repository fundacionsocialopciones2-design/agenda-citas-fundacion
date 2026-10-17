import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { AgendaApi } from '../core/agenda.api';
import { ErrorConflicto } from '../core/errores';
import { Cita } from '../core/models';
import { fechaHoraBogota } from '../core/tiempo';

export interface DatosConflictos {
  contexto: string;
  citas: Cita[];
}

/** Lista las citas futuras que impiden aplicar un cambio. Nunca se cancelan solas: hay que resolverlas. */
@Component({
  selector: 'app-conflictos',
  imports: [MatDialogModule, MatButtonModule, RouterLink],
  template: `
    <h2 mat-dialog-title>Hay citas que resolver primero</h2>
    <mat-dialog-content>
      <p>{{ datos.contexto }} Reprograma o cancela estas citas y vuelve a intentarlo.</p>
      @if (datos.citas.length) {
        <table class="tabla">
          <caption class="solo-lectores">Citas en conflicto</caption>
          <thead>
            <tr>
              <th scope="col">Fecha y hora</th>
              <th scope="col">Paciente</th>
              <th scope="col">Especialidad</th>
            </tr>
          </thead>
          <tbody>
            @for (c of datos.citas; track c.id) {
              <tr>
                <td data-etiqueta="Fecha y hora">{{ fecha(c.starts_at) }}</td>
                <td data-etiqueta="Paciente">{{ c.patients.first_names }} {{ c.patients.last_names }}</td>
                <td data-etiqueta="Especialidad">{{ c.specialties.name }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Entendido</button>
      <a mat-flat-button routerLink="/admin/agenda" mat-dialog-close>Ir a la agenda</a>
    </mat-dialog-actions>
  `,
})
export class Conflictos {
  protected readonly datos = inject<DatosConflictos>(MAT_DIALOG_DATA);
  protected readonly fecha = fechaHoraBogota;
}

export async function mostrarConflictos(dialog: MatDialog, api: AgendaApi, e: ErrorConflicto, contexto: string): Promise<void> {
  let citas: Cita[] = [];
  try {
    citas = await api.citasPorIds(e.citaIds);
  } catch {
    // Si no se pueden detallar, igual se informa del conflicto.
  }
  dialog.open(Conflictos, { data: { contexto, citas } satisfies DatosConflictos, width: '720px' });
}
