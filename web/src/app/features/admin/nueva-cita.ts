import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AgendaApi, normalizarDocumento } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { Especialidad, Especialista, TIPOS_DOCUMENTO, TipoDocumento } from '../../core/models';
import { marcadoDe, valorDe } from '../../shared/eventos-formulario';
import { SelectorCupos } from './selector-cupos';

export interface DatosNuevaCita {
  especialidades: Especialidad[];
  especialistas: Especialista[];
}

@Component({
  selector: 'app-nueva-cita',
  imports: [MatDialogModule, MatButtonModule, SelectorCupos],
  template: `
    <h2 mat-dialog-title>Nueva cita</h2>
    <form (submit)="$event.preventDefault(); guardar()">
      <mat-dialog-content>
        @if (error()) {
          <div class="aviso aviso--error" role="alert">{{ error() }}</div>
        }

        <div class="fila">
          <div class="campo">
            <label for="especialidad">Especialidad</label>
            <select id="especialidad" (change)="elegirEspecialidad(valor($event))" [attr.aria-invalid]="intentado() && !especialidadId()">
              <option value="" [selected]="!especialidadId()">Selecciona…</option>
              @for (e of opcionesEspecialidad(); track e.id) {
                <option [value]="e.id" [selected]="e.id === especialidadId()">{{ e.name }}</option>
              }
            </select>
            @if (intentado() && !especialidadId()) {
              <span class="error">Selecciona la especialidad.</span>
            }
          </div>
          <div class="campo">
            <label for="especialista">Especialista</label>
            <select id="especialista" (change)="especialistaId.set(valor($event))" [disabled]="!especialidadId()" [attr.aria-invalid]="intentado() && !especialistaId()">
              <option value="" [selected]="!especialistaId()">Selecciona…</option>
              @for (e of opcionesEspecialista(); track e.id) {
                <option [value]="e.id" [selected]="e.id === especialistaId()">{{ e.full_name }}</option>
              }
            </select>
            @if (intentado() && !especialistaId()) {
              <span class="error">Selecciona el especialista.</span>
            }
          </div>
        </div>

        @if (especialistaId() && especialidadId()) {
          <app-selector-cupos [specialistId]="especialistaId()" [specialtyId]="especialidadId()" (cupoElegido)="cupo.set($event)" />
        }
        @if (intentado() && !cupo()) {
          <span class="error" role="alert">Elige un cupo disponible.</span>
        }

        <h3 style="margin: 16px 0 8px; font-size: 1rem">Paciente</h3>
        <div class="fila">
          <div class="campo" style="flex: 0 1 200px">
            <label for="tipoDoc">Tipo de documento</label>
            <select id="tipoDoc" (change)="cambiarTipo(valor($event))">
              @for (t of tipos; track t.valor) {
                <option [value]="t.valor" [selected]="t.valor === tipoDoc()">{{ t.valor }} · {{ t.nombre }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="numDoc">Número de documento</label>
            <input id="numDoc" type="text" inputmode="text" autocomplete="off" [value]="numero()" (input)="numero.set(valor($event))" (blur)="buscar()" [attr.aria-invalid]="intentado() && !numeroValido()" />
            @if (intentado() && !numeroValido()) {
              <span class="error">Escribe un documento válido (4 a 20 letras o números).</span>
            }
          </div>
        </div>
        @if (existente()) {
          <div class="aviso" role="status">Paciente registrado: <strong>{{ existente() }}</strong>. Se conservan sus datos actuales.</div>
        } @else {
          <div class="fila">
            <div class="campo">
              <label for="nombres">Nombres</label>
              <input id="nombres" type="text" autocomplete="off" [value]="nombres()" (input)="nombres.set(valor($event))" [attr.aria-invalid]="intentado() && !nombres().trim()" />
              @if (intentado() && !nombres().trim()) {
                <span class="error">Escribe los nombres.</span>
              }
            </div>
            <div class="campo">
              <label for="apellidos">Apellidos</label>
              <input id="apellidos" type="text" autocomplete="off" [value]="apellidos()" (input)="apellidos.set(valor($event))" [attr.aria-invalid]="intentado() && !apellidos().trim()" />
              @if (intentado() && !apellidos().trim()) {
                <span class="error">Escribe los apellidos.</span>
              }
            </div>
          </div>
        }
        <div class="campo">
          <label for="telefono">Teléfono de contacto (opcional)</label>
          <input id="telefono" type="tel" autocomplete="off" [value]="telefono()" (input)="telefono.set(valor($event))" aria-describedby="tel-ayuda" [attr.aria-invalid]="intentado() && !telefonoValido()" />
          <span id="tel-ayuda" class="ayuda">Solo para contactar al paciente (por ejemplo, si hay que reprogramar). No lo identifica.</span>
          @if (intentado() && !telefonoValido()) {
            <span class="error">Escribe solo números (7 a 15 dígitos).</span>
          }
        </div>
        <div class="campo campo--check">
          <input id="autoriza" type="checkbox" [checked]="autoriza()" (change)="autoriza.set(marcado($event))" [attr.aria-invalid]="intentado() && !autoriza()" />
          <label for="autoriza">Confirmo que el paciente fue informado y autorizó el tratamiento de sus datos personales para gestionar su cita.</label>
        </div>
        @if (intentado() && !autoriza()) {
          <span class="error">Debes confirmar la autorización para continuar.</span>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false" [disabled]="guardando()">Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="guardando()">{{ guardando() ? 'Reservando…' : 'Reservar cita' }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class NuevaCita {
  protected readonly datos = inject<DatosNuevaCita>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<NuevaCita, boolean>);
  private readonly api = inject(AgendaApi);

  protected readonly tipos = TIPOS_DOCUMENTO;
  protected readonly valor = valorDe;
  protected readonly marcado = marcadoDe;

  protected readonly especialidadId = signal('');
  protected readonly especialistaId = signal('');
  protected readonly cupo = signal<string | null>(null);

  protected readonly tipoDoc = signal<TipoDocumento>('CC');
  protected readonly numero = signal('');
  protected readonly nombres = signal('');
  protected readonly apellidos = signal('');
  protected readonly telefono = signal('');
  protected readonly autoriza = signal(false);
  protected readonly existente = signal('');

  protected readonly intentado = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly opcionesEspecialista = computed(() =>
    this.datos.especialistas.filter((e) => e.active && e.specialist_specialties.some((s) => s.specialty_id === this.especialidadId())),
  );
  protected readonly opcionesEspecialidad = computed(() =>
    this.datos.especialidades.filter((e) => e.active && this.datos.especialistas.some((s) => s.active && s.specialist_specialties.some((x) => x.specialty_id === e.id))),
  );

  protected readonly numeroValido = computed(() => /^[0-9A-Z]{4,20}$/.test(normalizarDocumento(this.numero())));
  protected readonly telefonoValido = computed(() => !this.telefono().trim() || /^\+?[0-9]{7,15}$/.test(this.telefono().trim()));

  protected elegirEspecialidad(id: string): void {
    this.especialidadId.set(id);
    const opciones = this.opcionesEspecialista();
    this.especialistaId.set(opciones.length === 1 ? opciones[0].id : ''); // con un solo especialista se asigna automáticamente
  }

  protected cambiarTipo(tipo: string): void {
    this.tipoDoc.set(tipo as TipoDocumento);
    void this.buscar();
  }

  protected async buscar(): Promise<void> {
    this.existente.set('');
    if (!this.numeroValido()) return;
    try {
      const p = await this.api.buscarPaciente(this.tipoDoc(), this.numero());
      if (p) this.existente.set(`${p.first_names} ${p.last_names}`);
    } catch {
      // Si la búsqueda falla, se permite continuar capturando los datos.
    }
  }

  protected async guardar(): Promise<void> {
    this.intentado.set(true);
    this.error.set(null);
    const nuevoPaciente = !this.existente();
    const completo =
      !!this.especialidadId() && !!this.especialistaId() && !!this.cupo() && this.numeroValido() && this.telefonoValido() && this.autoriza() &&
      (!nuevoPaciente || (!!this.nombres().trim() && !!this.apellidos().trim()));
    if (!completo) return;
    this.guardando.set(true);
    try {
      await this.api.reservarCita({
        tipoDocumento: this.tipoDoc(),
        numeroDocumento: normalizarDocumento(this.numero()),
        nombres: this.nombres().trim() || 'registrado',
        apellidos: this.apellidos().trim() || 'registrado',
        telefono: this.telefono(),
        autorizacion: this.autoriza(),
        specialistId: this.especialistaId(),
        specialtyId: this.especialidadId(),
        inicio: this.cupo()!,
      });
      this.ref.close(true);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.guardando.set(false);
    }
  }
}
