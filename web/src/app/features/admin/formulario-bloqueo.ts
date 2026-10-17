import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AgendaApi } from '../../core/agenda.api';
import { ErrorConflicto, mensajeDeError } from '../../core/errores';
import { Bloqueo, ETIQUETA_BLOQUEO, TipoBloqueo } from '../../core/models';
import { bogotaAIso, diaBogota, horaBogota, hoyBogota, sumarDias } from '../../core/tiempo';
import { mostrarConflictos } from '../../shared/conflictos';
import { marcadoDe, valorDe } from '../../shared/util';

export interface DatosFormularioBloqueo {
  specialistId: string;
  bloqueo: Bloqueo | null;
}

/** Bloqueos de agenda: descansos, vacaciones, ausencias u otros. */
@Component({
  selector: 'app-formulario-bloqueo',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ datos.bloqueo ? 'Editar bloqueo' : 'Nuevo bloqueo' }}</h2>
    <form (submit)="$event.preventDefault(); guardar()">
      <mat-dialog-content>
        @if (error()) {
          <div class="aviso aviso--error" role="alert">{{ error() }}</div>
        }
        <div class="campo">
          <label for="tipo">Tipo</label>
          <select id="tipo" [value]="tipo()" (change)="tipo.set(valorTipo($event))">
            @for (t of tipos; track t.valor) {
              <option [value]="t.valor" [selected]="t.valor === tipo()">{{ t.texto }}</option>
            }
          </select>
        </div>
        <div class="campo campo--check">
          <input id="dia" type="checkbox" [checked]="todoElDia()" (change)="todoElDia.set(marcado($event))" />
          <label for="dia">Todo el día (uno o varios días completos)</label>
        </div>
        <div class="fila">
          <div class="campo">
            <label for="fi">{{ todoElDia() ? 'Desde el día' : 'Fecha de inicio' }}</label>
            <input id="fi" type="date" [value]="fechaIni()" (input)="fechaIni.set(valor($event))" />
          </div>
          @if (!todoElDia()) {
            <div class="campo">
              <label for="hi">Hora de inicio</label>
              <input id="hi" type="time" [value]="horaIni()" (input)="horaIni.set(valor($event))" />
            </div>
          }
        </div>
        <div class="fila">
          <div class="campo">
            <label for="ff">{{ todoElDia() ? 'Hasta el día (incluido)' : 'Fecha de fin' }}</label>
            <input id="ff" type="date" [value]="fechaFin()" (input)="fechaFin.set(valor($event))" />
          </div>
          @if (!todoElDia()) {
            <div class="campo">
              <label for="hf">Hora de fin</label>
              <input id="hf" type="time" [value]="horaFin()" (input)="horaFin.set(valor($event))" />
            </div>
          }
        </div>
        @if (intentado() && !rangoValido()) {
          <span class="error" role="alert">La fecha y hora de fin deben ser posteriores al inicio.</span>
        }
        <div class="campo">
          <label for="nota">Nota (opcional)</label>
          <input id="nota" type="text" maxlength="200" [value]="nota()" (input)="nota.set(valor($event))" aria-describedby="nota-ayuda" />
          <span id="nota-ayuda" class="ayuda">No escribas datos de salud ni información sensible.</span>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false" [disabled]="guardando()">Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar bloqueo' }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class FormularioBloqueo {
  protected readonly datos = inject<DatosFormularioBloqueo>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<FormularioBloqueo, boolean>);
  private readonly api = inject(AgendaApi);
  private readonly dialog = inject(MatDialog);

  protected readonly tipos = (Object.keys(ETIQUETA_BLOQUEO) as TipoBloqueo[]).map((v) => ({ valor: v, texto: ETIQUETA_BLOQUEO[v] }));

  private readonly b = this.datos.bloqueo;
  private readonly esDiaCompleto = this.b !== null && horaBogota(this.b.starts_at) === '00:00' && horaBogota(this.b.ends_at) === '00:00';

  protected readonly tipo = signal<TipoBloqueo>(this.b?.kind ?? 'vacaciones');
  protected readonly todoElDia = signal(this.b ? this.esDiaCompleto : true);
  protected readonly fechaIni = signal(this.b ? diaBogota(this.b.starts_at) : hoyBogota());
  protected readonly horaIni = signal(this.b ? horaBogota(this.b.starts_at) : '09:00');
  protected readonly fechaFin = signal(this.b ? diaBogota(this.esDiaCompleto ? new Date(new Date(this.b.ends_at).getTime() - 60_000) : this.b.ends_at) : hoyBogota());
  protected readonly horaFin = signal(this.b ? horaBogota(this.b.ends_at) : '10:00');
  protected readonly nota = signal(this.b?.note ?? '');

  protected readonly intentado = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly inicioIso = computed(() => (this.fechaIni() ? bogotaAIso(this.fechaIni(), this.todoElDia() ? '00:00' : this.horaIni() || '00:00') : ''));
  private readonly finIso = computed(() =>
    this.fechaFin() ? (this.todoElDia() ? bogotaAIso(sumarDias(this.fechaFin(), 1), '00:00') : bogotaAIso(this.fechaFin(), this.horaFin() || '00:00')) : '',
  );
  protected readonly rangoValido = computed(() => !!this.inicioIso() && !!this.finIso() && this.finIso() > this.inicioIso());

  protected readonly valor = valorDe;
  protected readonly marcado = marcadoDe;
  protected valorTipo = (e: Event): TipoBloqueo => valorDe(e) as TipoBloqueo;

  protected async guardar(): Promise<void> {
    this.intentado.set(true);
    this.error.set(null);
    if (!this.rangoValido()) return;
    this.guardando.set(true);
    try {
      await this.api.guardarBloqueo({
        id: this.b?.id ?? null,
        specialistId: this.datos.specialistId,
        tipo: this.tipo(),
        inicio: this.inicioIso(),
        fin: this.finIso(),
        nota: this.nota(),
      });
      this.ref.close(true);
    } catch (e) {
      if (e instanceof ErrorConflicto) {
        await mostrarConflictos(this.dialog, this.api, e, 'Este bloqueo se cruza con citas futuras confirmadas.');
      } else {
        this.error.set(mensajeDeError(e));
      }
    } finally {
      this.guardando.set(false);
    }
  }
}
