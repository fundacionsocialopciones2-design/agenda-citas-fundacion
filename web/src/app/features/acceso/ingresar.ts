import { Component, computed, inject, input, signal } from '@angular/core';
import { email, form, FormField, FormRoot, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth/auth.service';
import { Acceso } from './acceso';

@Component({
  selector: 'app-ingresar',
  imports: [FormField, FormRoot, RouterLink, MatButtonModule, MatIconModule, Acceso],
  template: `
    <app-acceso titulo="Iniciar sesión" subtitulo="Acceso para administración y especialistas.">
      <form [formRoot]="formulario" (submit)="ingresar()">
        @if (avisoMotivo(); as aviso) {
          <div class="aviso" role="status">
            <mat-icon aria-hidden="true">lock_clock</mat-icon>
            <span>{{ aviso }}</span>
          </div>
        }
        @if (error()) {
          <div class="aviso aviso--error" role="alert">
            <mat-icon aria-hidden="true">error</mat-icon>
            <span>{{ error() }}</span>
          </div>
        }

        <div class="campo">
          <label for="correo">Correo electrónico</label>
          <input id="correo" type="email" autocomplete="username" [formField]="formulario.correo" />
          @if (formulario.correo().touched() && formulario.correo().invalid()) {
            <span class="error">{{ formulario.correo().errors()[0].message }}</span>
          }
        </div>

        <div class="campo">
          <label for="clave">Contraseña</label>
          <div class="acciones" style="flex-wrap: nowrap">
            <input id="clave" [type]="verClave() ? 'text' : 'password'" autocomplete="current-password" [formField]="formulario.clave" />
            <button
              mat-icon-button
              type="button"
              [attr.aria-label]="verClave() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              [attr.aria-pressed]="verClave()"
              (click)="verClave.set(!verClave())"
            >
              <mat-icon aria-hidden="true">{{ verClave() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
          </div>
          @if (formulario.clave().touched() && formulario.clave().invalid()) {
            <span class="error">{{ formulario.clave().errors()[0].message }}</span>
          }
        </div>

        <button mat-flat-button type="submit" style="width: 100%; height: 48px" [disabled]="cargando()">
          {{ cargando() ? 'Ingresando…' : 'Ingresar' }}
        </button>
        <p style="text-align: center; margin: 16px 0 0">
          <a routerLink="/recuperar">¿Olvidaste tu contraseña?</a>
        </p>
      </form>
    </app-acceso>
  `,
})
export class Ingresar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly modelo = signal({ correo: '', clave: '' });
  protected readonly formulario = form(this.modelo, (c) => {
    required(c.correo, { message: 'Escribe tu correo electrónico.' });
    email(c.correo, { message: 'El correo no tiene un formato válido.' });
    required(c.clave, { message: 'Escribe tu contraseña.' });
  });

  /** Llega por la URL (?motivo=inactividad|sesion) gracias a withComponentInputBinding. */
  readonly motivo = input<string>();
  protected readonly avisoMotivo = computed(() => {
    switch (this.motivo()) {
      case 'inactividad':
        return 'Tu sesión se cerró por inactividad. Inicia sesión de nuevo para continuar.';
      case 'sesion':
        return 'Tu sesión terminó. Inicia sesión de nuevo para continuar.';
      default:
        return null;
    }
  });

  protected readonly error = signal<string | null>(null);
  protected readonly cargando = signal(false);
  protected readonly verClave = signal(false);

  protected async ingresar(): Promise<void> {
    await submit(this.formulario, async () => {
      this.error.set(null);
      this.cargando.set(true);
      const { correo, clave } = this.modelo();
      const problema = await this.auth.iniciarSesion(correo, clave);
      this.cargando.set(false);
      if (problema) {
        this.error.set(problema);
        return;
      }
      await this.router.navigateByUrl(this.auth.rutaInicio());
    });
  }
}
