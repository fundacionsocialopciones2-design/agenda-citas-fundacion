import { Component, inject, OnInit, signal } from '@angular/core';
import { email, form, FormField, FormRoot, maxLength, minLength, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AgendaApi } from '../../core/agenda.api';
import { AuthService } from '../../core/auth/auth.service';
import { ErrorApi, mensajeDeError } from '../../core/errores';
import { Estado } from '../../shared/estado';
import { Acceso } from './acceso';

type Paso = 'verificando' | 'sesion_abierta' | 'invalido' | 'error' | 'formulario' | 'creada';

/**
 * Página pública del enlace de invitación (/invitacion#token): el especialista escribe su correo y contraseña y
 * queda con acceso. Toda la validación del enlace ocurre en el servidor (Edge Function y base de datos).
 */
@Component({
  selector: 'app-invitacion',
  imports: [FormField, FormRoot, RouterLink, MatButtonModule, MatIconModule, Acceso, Estado],
  template: `
    <app-acceso titulo="Crear tu acceso" subtitulo="Agenda de citas para especialistas.">
      @switch (paso()) {
        @case ('verificando') {
          <app-estado tipo="cargando" titulo="Verificando el enlace…" />
        }
        @case ('sesion_abierta') {
          <div class="aviso" role="status">
            Hay una sesión abierta en este navegador. Para crear la cuenta nueva primero hay que cerrarla.
          </div>
          <button mat-flat-button type="button" (click)="cerrarYContinuar()">Cerrar sesión y continuar</button>
        }
        @case ('invalido') {
          <div class="aviso aviso--error" role="alert">
            <mat-icon aria-hidden="true">link_off</mat-icon>
            <span>Este enlace no es válido o ya venció. Pide uno nuevo a la administración.</span>
          </div>
          <a mat-stroked-button routerLink="/ingresar">Ya tengo cuenta: iniciar sesión</a>
        }
        @case ('error') {
          <app-estado tipo="error" [mensaje]="error() ?? ''" (reintentar)="verificar()" />
        }
        @case ('creada') {
          <div class="aviso" role="status">Tu cuenta quedó creada. Inicia sesión con tu correo y tu contraseña.</div>
          <a mat-flat-button routerLink="/ingresar">Iniciar sesión</a>
        }
        @default {
          <p>Hola, <strong>{{ nombre() }}</strong>. Escribe el correo con el que vas a ingresar y crea tu contraseña.</p>
          <form [formRoot]="formulario" (submit)="crear()">
            @if (error()) {
              <div class="aviso aviso--error" role="alert">
                <mat-icon aria-hidden="true">error</mat-icon>
                <span>{{ error() }}</span>
              </div>
            }
            <div class="campo">
              <label for="correo">Correo electrónico</label>
              <input id="correo" type="email" autocomplete="email" [formField]="formulario.correo" aria-describedby="correo-ayuda" />
              <span id="correo-ayuda" class="ayuda">Revísalo bien: ahí te llegará el enlace si olvidas la contraseña.</span>
              @if (formulario.correo().touched() && formulario.correo().invalid()) {
                <span class="error">{{ formulario.correo().errors()[0].message }}</span>
              }
            </div>
            <div class="campo">
              <label for="clave">Contraseña</label>
              <input id="clave" type="password" autocomplete="new-password" [formField]="formulario.clave" aria-describedby="clave-ayuda" />
              <span id="clave-ayuda" class="ayuda">Mínimo 8 caracteres.</span>
              @if (formulario.clave().touched() && formulario.clave().invalid()) {
                <span class="error">{{ formulario.clave().errors()[0].message }}</span>
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
              {{ cargando() ? 'Creando tu cuenta…' : 'Crear mi cuenta' }}
            </button>
          </form>
        }
      }
    </app-acceso>
  `,
})
export class Invitacion implements OnInit {
  private readonly api = inject(AgendaApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly token = inject(ActivatedRoute).snapshot.fragment ?? '';

  protected readonly paso = signal<Paso>('verificando');
  protected readonly nombre = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly cargando = signal(false);
  protected readonly modelo = signal({ correo: '', clave: '', confirmar: '' });
  protected readonly formulario = form(this.modelo, (c) => {
    required(c.correo, { message: 'Escribe tu correo.' });
    email(c.correo, { message: 'Escribe un correo válido.' });
    required(c.clave, { message: 'Crea una contraseña.' });
    minLength(c.clave, 8, { message: 'La contraseña debe tener al menos 8 caracteres.' });
    maxLength(c.clave, 72, { message: 'La contraseña puede tener máximo 72 caracteres.' });
    required(c.confirmar, { message: 'Repite la contraseña.' });
  });

  async ngOnInit(): Promise<void> {
    await this.auth.whenReady();
    if (this.auth.sesion()) {
      this.paso.set('sesion_abierta');
      return;
    }
    await this.verificar();
  }

  protected async cerrarYContinuar(): Promise<void> {
    await this.auth.cerrarSesion();
    await this.verificar();
  }

  protected async verificar(): Promise<void> {
    if (!this.token) {
      this.paso.set('invalido');
      return;
    }
    this.paso.set('verificando');
    this.error.set(null);
    try {
      this.nombre.set(await this.api.consultarInvitacion(this.token));
      this.paso.set('formulario');
    } catch (e) {
      this.error.set(mensajeDeError(e));
      this.paso.set(e instanceof ErrorApi && e.codigo === 'invitation_invalid' ? 'invalido' : 'error');
    }
  }

  protected async crear(): Promise<void> {
    await submit(this.formulario, async () => {
      this.error.set(null);
      const { correo, clave, confirmar } = this.modelo();
      if (clave !== confirmar) {
        this.error.set('Las contraseñas no coinciden.');
        return;
      }
      this.cargando.set(true);
      try {
        await this.api.aceptarInvitacion(this.token, correo, clave);
      } catch (e) {
        this.cargando.set(false);
        if (e instanceof ErrorApi && e.codigo === 'invitation_invalid') this.paso.set('invalido');
        else this.error.set(mensajeDeError(e));
        return;
      }
      // La cuenta ya existe: se entra de una vez; si falla, se envía a la pantalla de ingreso.
      const problema = await this.auth.iniciarSesion(correo, clave);
      this.cargando.set(false);
      if (problema) {
        this.paso.set('creada');
        return;
      }
      await this.router.navigateByUrl(this.auth.rutaInicio());
    });
  }
}
