import { Component, inject, signal } from '@angular/core';
import { email, form, FormField, FormRoot, required, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { Acceso } from '../../shared/acceso';

@Component({
  selector: 'app-recuperar',
  imports: [FormField, FormRoot, RouterLink, MatButtonModule, MatIconModule, Acceso],
  template: `
    <app-acceso titulo="Recuperar contraseña" subtitulo="Te enviaremos un enlace para crear una contraseña nueva.">
      @if (enviado()) {
        <div class="aviso" role="status">
          <mat-icon aria-hidden="true">mark_email_read</mat-icon>
          <span>Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.</span>
        </div>
      } @else {
        <form [formRoot]="formulario" (submit)="enviar()">
          <div class="campo">
            <label for="correo">Correo electrónico</label>
            <input id="correo" type="email" autocomplete="username" [formField]="formulario.correo" />
            @if (formulario.correo().touched() && formulario.correo().invalid()) {
              <span class="error">{{ formulario.correo().errors()[0].message }}</span>
            }
          </div>
          <button mat-flat-button type="submit" style="width: 100%; height: 48px" [disabled]="cargando()">
            {{ cargando() ? 'Enviando…' : 'Enviar enlace' }}
          </button>
        </form>
      }
      <p style="text-align: center; margin: 0"><a routerLink="/ingresar">Volver a iniciar sesión</a></p>
    </app-acceso>
  `,
})
export class Recuperar {
  private readonly auth = inject(AuthService);

  protected readonly modelo = signal({ correo: '' });
  protected readonly formulario = form(this.modelo, (c) => {
    required(c.correo, { message: 'Escribe tu correo electrónico.' });
    email(c.correo, { message: 'El correo no tiene un formato válido.' });
  });
  protected readonly cargando = signal(false);
  protected readonly enviado = signal(false);

  protected async enviar(): Promise<void> {
    await submit(this.formulario, async () => {
      this.cargando.set(true);
      await this.auth.enviarRecuperacion(this.modelo().correo);
      this.cargando.set(false);
      this.enviado.set(true); // misma respuesta exista o no el correo
    });
  }
}
