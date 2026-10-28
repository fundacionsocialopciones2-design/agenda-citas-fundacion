import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { CitaEspecialista, ETIQUETA_ESTADO, EstadoCita } from '../../core/models';
import { fechaBogota, horaBogota } from '../../core/tiempo';
import { Confirmar, DatosConfirmar } from '../../shared/confirmar';
import { CancelarCitaPropia } from './cancelar-cita-propia';

export interface DatosDetalle {
  id: string;
  paciente: string;
  documento: string;
  telefono: string | null;
  especialidad: string;
  fecha: string;
  hora: string;
  inicio: string; // instante ISO (UTC)
  estado: EstadoCita;
}

/** Valor con el que se cierra el detalle cuando la cita cambió (quien lo abrió debe recargar). */
export type ResultadoDetalle = 'actualizada';

export function aDetalle(c: CitaEspecialista): DatosDetalle {
  return {
    id: c.id,
    paciente: `${c.patient_first_names} ${c.patient_last_names}`,
    documento: `${c.patient_document_type} ${c.patient_document_number}`,
    telefono: c.patient_phone ?? null,
    especialidad: c.specialty_name,
    fecha: fechaBogota(c.starts_at),
    hora: `${horaBogota(c.starts_at)} – ${horaBogota(c.ends_at)}`,
    inicio: c.starts_at,
    estado: c.status,
  };
}

/**
 * Detalle de una cita del especialista: datos mínimos del paciente y, solo sobre SUS citas confirmadas,
 * las acciones permitidas: registrar asistencia (cuando la hora ya empezó) o cancelar (si aún no empieza).
 * La base de datos vuelve a exigir que la cita sea del propio especialista; aquí solo se presenta.
 */
@Component({
  selector: 'app-detalle-cita',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Detalle de la cita</h2>
    <mat-dialog-content>
      @if (error()) {
        <div class="aviso aviso--error" role="alert">{{ error() }}</div>
      }
      <dl class="detalle">
        <dt>Paciente</dt>
        <dd>{{ d.paciente }}</dd>
        <dt>Documento</dt>
        <dd>{{ d.documento }}</dd>
        <dt>Teléfono</dt>
        <dd>
          @if (d.telefono) {
            <a [href]="'tel:' + d.telefono" [attr.aria-label]="'Llamar al ' + d.telefono">{{ d.telefono }}</a>
          } @else {
            <span class="ayuda">No registrado</span>
          }
        </dd>
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
      <button mat-button type="button" mat-dialog-close cdkFocusInitial [disabled]="ocupado()">Cerrar</button>
      @if (puedeCancelar) {
        <button mat-stroked-button type="button" (click)="cancelar()" [disabled]="ocupado()">Cancelar cita</button>
      }
      @if (puedeRegistrarAsistencia) {
        <button mat-stroked-button type="button" (click)="registrarAsistencia('no_asistio')" [disabled]="ocupado()">No asistió</button>
        <button mat-flat-button type="button" (click)="registrarAsistencia('asistida')" [disabled]="ocupado()">Asistió</button>
      }
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
  private readonly ref = inject(MatDialogRef<DetalleCita, ResultadoDetalle>);
  private readonly api = inject(AgendaApi);
  private readonly dialog = inject(MatDialog);
  private readonly aviso = inject(MatSnackBar);

  protected readonly etiqueta = ETIQUETA_ESTADO;
  protected readonly ocupado = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly yaEmpezo = Date.parse(this.d.inicio) <= Date.now();
  protected readonly puedeRegistrarAsistencia = this.d.estado === 'confirmada' && this.yaEmpezo;
  protected readonly puedeCancelar = this.d.estado === 'confirmada' && !this.yaEmpezo;

  protected async registrarAsistencia(estado: 'asistida' | 'no_asistio'): Promise<void> {
    const asistio = estado === 'asistida';
    const datos: DatosConfirmar = {
      titulo: asistio ? '¿Registrar que el paciente asistió?' : '¿Registrar que el paciente no asistió?',
      mensaje: `${this.d.paciente} · ${this.d.fecha}, ${this.d.hora}. Este cambio no se puede deshacer.`,
      confirmar: asistio ? 'Sí, asistió' : 'Sí, no asistió',
    };
    if (!(await firstValueFrom(this.dialog.open(Confirmar, { data: datos }).afterClosed()))) return;

    this.ocupado.set(true);
    this.error.set(null);
    try {
      await this.api.registrarAsistenciaPropia(this.d.id, estado);
      this.terminar(asistio ? 'Asistencia registrada.' : 'Inasistencia registrada.');
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async cancelar(): Promise<void> {
    const cancelada = await firstValueFrom(this.dialog.open(CancelarCitaPropia, { width: '480px', data: this.d }).afterClosed());
    if (cancelada) this.terminar('Cita cancelada. El cupo quedó libre.');
  }

  private terminar(mensaje: string): void {
    this.aviso.open(mensaje, 'Cerrar', { duration: 5000 });
    this.ref.close('actualizada');
  }
}
