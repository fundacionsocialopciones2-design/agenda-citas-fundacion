import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { valorDe } from '../../shared/eventos-formulario';
import type { DatosDetalle } from './detalle-cita';

/** El especialista cancela una de SUS citas futuras. Se cierra con true si la cancelación se realizó. */
@Component({
  selector: 'app-cancelar-cita-propia',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Cancelar cita</h2>
    <mat-dialog-content>
      <p style="margin-top: 0">
        {{ d.paciente }} · {{ d.especialidad }}<br />
        {{ d.fecha }}, {{ d.hora }}
      </p>
      <div class="aviso" role="note">
        El paciente <strong>no recibe un aviso automático</strong>. Comunícate con él para informarle de la cancelación.
      </div>
      @if (error()) {
        <div class="aviso aviso--error" role="alert" style="margin-top: 12px">{{ error() }}</div>
      }
      <div class="campo" style="margin-top: 16px">
        <label for="motivo">Motivo (opcional)</label>
        <input id="motivo" type="text" maxlength="200" [value]="motivo()" (input)="motivo.set(valor($event))" aria-describedby="motivo-ayuda" />
        <span id="motivo-ayuda" class="ayuda">La cita se conserva en el historial como cancelada y el cupo queda libre. No escribas datos de salud.</span>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false" [disabled]="guardando()" cdkFocusInitial>Volver</button>
      <button mat-flat-button type="button" (click)="cancelarCita()" [disabled]="guardando()">{{ guardando() ? 'Cancelando…' : 'Cancelar cita' }}</button>
    </mat-dialog-actions>
  `,
})
export class CancelarCitaPropia {
  protected readonly d = inject<DatosDetalle>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<CancelarCitaPropia, boolean>);
  private readonly api = inject(AgendaApi);

  protected readonly valor = valorDe;
  protected readonly motivo = signal('');
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async cancelarCita(): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.api.cancelarCitaPropia(this.d.id, this.motivo());
      this.ref.close(true);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
