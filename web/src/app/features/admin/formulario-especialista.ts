import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { Especialidad, Especialista } from '../../core/models';
import { marcadoDe, valorDe } from '../../shared/eventos-formulario';

export interface DatosFormularioEspecialista {
  especialidades: Especialidad[];
  especialista: Especialista | null;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Crea (con invitación por correo) o edita un especialista. */
@Component({
  selector: 'app-formulario-especialista',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ editando ? 'Editar especialista' : 'Nuevo especialista' }}</h2>
    <form (submit)="$event.preventDefault(); guardar()">
      <mat-dialog-content>
        @if (error()) {
          <div class="aviso aviso--error" role="alert">{{ error() }}</div>
        }
        <div class="campo">
          <label for="nombre">Nombre completo</label>
          <input id="nombre" type="text" autocomplete="off" [value]="nombre()" (input)="nombre.set(valor($event))" [attr.aria-invalid]="intentado() && !nombreValido()" />
          @if (intentado() && !nombreValido()) {
            <span class="error">Escribe el nombre del especialista.</span>
          }
        </div>
        <div class="campo">
          <label for="correo">Correo electrónico</label>
          <input id="correo" type="email" autocomplete="off" [value]="correo()" (input)="correo.set(valor($event))" aria-describedby="correo-ayuda" [attr.aria-invalid]="intentado() && !correoValido()" />
          <span id="correo-ayuda" class="ayuda">
            {{ editando ? 'Si lo cambias, la persona deberá usar el correo nuevo para ingresar.' : 'Se enviará una invitación para que cree su contraseña.' }}
          </span>
          @if (intentado() && !correoValido()) {
            <span class="error">Escribe un correo válido.</span>
          }
        </div>
        <fieldset class="campo" style="border: 0; padding: 0; margin: 0 0 14px">
          <legend class="etiqueta" style="padding: 0; margin-bottom: 6px">Especialidades que atiende</legend>
          @for (e of datos.especialidades; track e.id) {
            <div class="campo campo--check" style="margin-bottom: 4px">
              <input [id]="'esp-' + e.id" type="checkbox" [checked]="seleccion().has(e.id)" (change)="alternar(e.id, marcado($event))" />
              <label [for]="'esp-' + e.id">{{ e.name }}</label>
            </div>
          }
          @if (intentado() && seleccion().size === 0) {
            <span class="error">Selecciona al menos una especialidad.</span>
          }
        </fieldset>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="false" [disabled]="guardando()">Cancelar</button>
        <button mat-flat-button type="submit" [disabled]="guardando()">
          {{ guardando() ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear e invitar' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class FormularioEspecialista {
  protected readonly datos = inject<DatosFormularioEspecialista>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<FormularioEspecialista, boolean>);
  private readonly api = inject(AgendaApi);

  protected readonly editando = this.datos.especialista !== null;
  protected readonly nombre = signal(this.datos.especialista?.full_name ?? '');
  protected readonly correo = signal(this.datos.especialista?.profiles?.email ?? '');
  protected readonly seleccion = signal(new Set(this.datos.especialista?.specialist_specialties.map((s) => s.specialty_id) ?? []));

  protected readonly intentado = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly nombreValido = computed(() => this.nombre().trim().length > 1);
  protected readonly correoValido = computed(() => CORREO.test(this.correo().trim()));

  protected readonly valor = valorDe;
  protected readonly marcado = marcadoDe;

  protected alternar(id: string, marcado: boolean): void {
    this.seleccion.update((s) => {
      const nuevo = new Set(s);
      if (marcado) nuevo.add(id);
      else nuevo.delete(id);
      return nuevo;
    });
  }

  protected async guardar(): Promise<void> {
    this.intentado.set(true);
    this.error.set(null);
    if (!this.nombreValido() || !this.correoValido() || this.seleccion().size === 0) return;
    this.guardando.set(true);
    try {
      const ids = [...this.seleccion()];
      const e = this.datos.especialista;
      if (!e) {
        await this.api.crearEspecialista({ correo: this.correo().trim(), nombre: this.nombre().trim(), especialidadIds: ids });
      } else {
        await this.api.actualizarEspecialista(e.id, this.nombre(), ids);
        if (this.correo().trim().toLowerCase() !== (e.profiles?.email ?? '').toLowerCase()) {
          await this.api.cambiarCorreoEspecialista(e.id, this.correo().trim());
        }
      }
      this.ref.close(true);
    } catch (err) {
      this.error.set(mensajeDeError(err));
    } finally {
      this.guardando.set(false);
    }
  }
}
