import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { Cita } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';
import { valorDe } from '../../shared/eventos-formulario';

@Component({
  selector: 'app-cancelar-cita',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Cancelar cita</h2>
    <mat-dialog-content>
      <p style="margin-top: 0">
        {{ cita.patients.first_names }} {{ cita.patients.last_names }} · {{ cita.specialties.name }}<br />
        {{ fecha(cita.starts_at) }}
      </p>
      @if (error()) {
        <div class="aviso aviso--error" role="alert">{{ error() }}</div>
      }
      <div class="campo">
        <label for="motivo">Motivo (opcional)</label>
        <input id="motivo" type="text" maxlength="200" [value]="motivo()" (input)="motivo.set(valor($event))" aria-describedby="motivo-ayuda" />
        <span id="motivo-ayuda" class="ayuda">La cita se conserva en el historial como cancelada y el cupo queda libre.</span>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false" [disabled]="guardando()">Volver</button>
      <button mat-flat-button type="button" (click)="guardar()" [disabled]="guardando()">{{ guardando() ? 'Cancelando…' : 'Cancelar cita' }}</button>
    </mat-dialog-actions>
  `,
})
export class CancelarCita {
  protected readonly cita = inject<Cita>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<CancelarCita, boolean>);
  private readonly api = inject(AgendaApi);

  protected readonly fecha = fechaHoraBogota;
  protected readonly valor = valorDe;
  protected readonly motivo = signal('');
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async guardar(): Promise<void> {
    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.api.cancelarCita(this.cita.id, this.motivo());
      this.ref.close(true);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
