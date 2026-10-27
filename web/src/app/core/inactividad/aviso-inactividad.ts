import { Component, inject, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface DatosAvisoInactividad {
  /** Segundos que faltan para cerrar la sesión (los actualiza el servicio de inactividad). */
  segundos: Signal<number | null>;
}

export type RespuestaAvisoInactividad = 'continuar' | 'salir';

/**
 * Aviso previo al cierre por inactividad. Se anuncia a los lectores de pantalla al abrirse (role="alertdialog");
 * la cuenta regresiva no es "live" para no interrumpir con un anuncio cada segundo.
 */
@Component({
  selector: 'app-aviso-inactividad',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>¿Sigues ahí?</h2>
    <mat-dialog-content>
      <p style="margin-top: 0">
        Por seguridad, tu sesión se cerrará por inactividad en
        <strong>{{ datos.segundos() ?? 0 }} segundos</strong>.
      </p>
      <p class="ayuda" style="margin-bottom: 0">Si continúas, seguirás trabajando sin volver a iniciar sesión.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="'salir'">Cerrar sesión</button>
      <button mat-flat-button type="button" [mat-dialog-close]="'continuar'" cdkFocusInitial>Continuar sesión</button>
    </mat-dialog-actions>
  `,
})
export class AvisoInactividad {
  protected readonly datos = inject<DatosAvisoInactividad>(MAT_DIALOG_DATA);
}
