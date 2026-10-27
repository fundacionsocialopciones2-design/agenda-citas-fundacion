import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { Cita } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';
import { SelectorCupos } from './selector-cupos';

@Component({
  selector: 'app-reprogramar-cita',
  imports: [MatDialogModule, MatButtonModule, SelectorCupos],
  template: `
    <h2 mat-dialog-title>Reprogramar cita</h2>
    <mat-dialog-content>
      <p style="margin-top: 0">
        <strong>{{ cita.patients.first_names }} {{ cita.patients.last_names }}</strong> · {{ cita.specialties.name }} con {{ cita.specialists.full_name }}<br />
        Cita actual: {{ fecha(cita.starts_at) }}
      </p>
      @if (error()) {
        <div class="aviso aviso--error" role="alert">{{ error() }}</div>
      }
      <app-selector-cupos [specialistId]="cita.specialist_id" [specialtyId]="cita.specialty_id" (cupoElegido)="cupo.set($event)" />
      <p class="ayuda">Si el nuevo horario falla, la cita actual se conserva sin cambios.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false" [disabled]="guardando()">Cancelar</button>
      <button mat-flat-button type="button" (click)="guardar()" [disabled]="!cupo() || guardando()">{{ guardando() ? 'Reprogramando…' : 'Reprogramar' }}</button>
    </mat-dialog-actions>
  `,
})
export class ReprogramarCita {
  protected readonly cita = inject<Cita>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ReprogramarCita, boolean>);
  private readonly api = inject(AgendaApi);

  protected readonly fecha = fechaHoraBogota;
  protected readonly cupo = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async guardar(): Promise<void> {
    const nuevo = this.cupo();
    if (!nuevo) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.api.reprogramarCita(this.cita.id, nuevo);
      this.ref.close(true);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
