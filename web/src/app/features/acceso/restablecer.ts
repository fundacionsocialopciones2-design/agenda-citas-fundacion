import { Component, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, minLength, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { Acceso } from '../../shared/acceso';
import { Estado } from '../../shared/estado';

/** Destino de los enlaces de recuperación e invitación: la sesión temporal permite fijar la contraseña. */
@Component({
  selector: 'app-restablecer',
  imports: [FormField, FormRoot, RouterLink, MatButtonModule, MatIconModule, Acceso, Estado],
  template: `
    <app-acceso titulo="Crear contraseña" subtitulo="Elige una contraseña nueva para tu cuenta.">
      @if (!lista()) {
        <app-estado tipo="cargando" titulo="Verificando enlace…" />
      } @else if (!auth.sesion()) {
        <div class="aviso aviso--error" role="alert">
          <mat-icon aria-hidden="true">link_off</mat-icon>
          <span>El enlace no es válido o ya venció. Solicita uno nuevo para continuar.</span>
        </div>
        <a mat-flat-button routerLink="/recuperar">Solicitar enlace nuevo</a>
      } @else {
        <form [formRoot]="formulario" (submit)="guardar()">
          @if (error()) {
            <div class="aviso aviso--error" role="alert">
              <mat-icon aria-hidden="true">error</mat-icon>
              <span>{{ error() }}</span>
            </div>
          }
          <div class="campo">
            <label for="nueva">Contraseña nueva</label>
            <input id="nueva" type="password" autocomplete="new-password" [formField]="formulario.nueva" aria-describedby="nueva-ayuda" />
            <span id="nueva-ayuda" class="ayuda">Mínimo 8 caracteres.</span>
            @if (formulario.nueva().touched() && formulario.nueva().invalid()) {
              <span class="error">{{ formulario.nueva().errors()[0].message }}</span>
            }
          </div>
          <div class="campo">
            <label for="confirmar">Repite la contraseña</label>
            <input id="confirmar" type="password" autocomplete="new-password" [formField]="formulario.confirmar" />
            @if (formulario.confirmar().touched() && formulario.confirmar().invalid()) {
              <span class="error">{{ formulario.confirmar().errors()[0].message }}</span>
            }
          </div>
          <button mat-flat-button type="submit" style="width: 100%; height: 48px" [disabled]="cargando()">
            {{ cargando() ? 'Guardando…' : 'Guardar contraseña' }}
          </button>
        </form>
      }
    </app-acceso>
  `,
})
export class Restablecer {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly lista = signal(false);
  protected readonly modelo = signal({ nueva: '', confirmar: '' });
  protected readonly formulario = form(this.modelo, (c) => {
    required(c.nueva, { message: 'Escribe la contraseña nueva.' });
    minLength(c.nueva, 8, { message: 'La contraseña debe tener al menos 8 caracteres.' });
    required(c.confirmar, { message: 'Repite la contraseña.' });
  });
  protected readonly error = signal<string | null>(null);
  protected readonly cargando = signal(false);

  constructor() {
    void this.auth.whenReady().then(() => this.lista.set(true));
  }

  protected async guardar(): Promise<void> {
    await submit(this.formulario, async () => {
      this.error.set(null);
      const { nueva, confirmar } = this.modelo();
      if (nueva !== confirmar) {
        this.error.set('Las contraseñas no coinciden.');
        return;
      }
      this.cargando.set(true);
      const problema = await this.auth.cambiarClave(nueva);
      this.cargando.set(false);
      if (problema) {
        this.error.set(problema);
        return;
      }
      await this.router.navigateByUrl(this.auth.rutaInicio());
    });
  }
}
