import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface DatosConfirmar {
  titulo: string;
  mensaje: string;
  confirmar: string;
  cancelar?: string;
}

/** Diálogo de confirmación. Se cierra con true si la persona confirma. */
@Component({
  selector: 'app-confirmar',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ datos.titulo }}</h2>
    <mat-dialog-content>{{ datos.mensaje }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">{{ datos.cancelar ?? 'Volver' }}</button>
      <button mat-flat-button type="button" [mat-dialog-close]="true" cdkFocusInitial>{{ datos.confirmar }}</button>
    </mat-dialog-actions>
  `,
})
export class Confirmar {
  protected readonly datos = inject<DatosConfirmar>(MAT_DIALOG_DATA);
}
