import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../core/auth/auth.service';

interface EnlaceNav {
  ruta: string;
  texto: string;
  icono: string;
}

/** Marco de la aplicación autenticada: barra superior, navegación según rol y contenido. */
@Component({
  selector: 'app-marco',
  imports: [NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet, MatButtonModule, MatIconModule],
  template: `
    <a class="saltar" href="#contenido">Saltar al contenido</a>
    <header class="barra">
      <div class="barra-in">
        <a class="marca" [routerLink]="auth.rutaInicio()">
          <img ngSrc="logo-fundacion.jpg" width="44" height="44" alt="" priority />
          <span class="marca-texto">
            <strong>Agenda de citas</strong>
            <small>Fundación Social Opciones</small>
          </span>
        </a>
        <div class="usuario">
          <span class="usuario-nombre">{{ auth.perfil()?.full_name }}</span>
          <button mat-stroked-button type="button" (click)="salir()">
            <mat-icon aria-hidden="true">logout</mat-icon>
            Salir
          </button>
        </div>
      </div>
      <nav class="nav" aria-label="Principal">
        @for (e of enlaces(); track e.ruta) {
          <a [routerLink]="e.ruta" routerLinkActive="activo" ariaCurrentWhenActive="page">
            <mat-icon aria-hidden="true">{{ e.icono }}</mat-icon>
            {{ e.texto }}
          </a>
        }
      </nav>
    </header>
    <main id="contenido" tabindex="-1">
      <router-outlet />
    </main>
  `,
  styles: `
    .saltar {
      position: absolute;
      left: -9999px;
      background: #fff;
      padding: 8px 12px;
      z-index: 10;
    }
    .saltar:focus {
      left: 8px;
      top: 8px;
    }
    .barra {
      background: #fff;
      border-bottom: 1px solid var(--app-borde);
      border-top: 4px solid var(--app-acento);
      position: sticky;
      top: 0;
      z-index: 5;
    }
    .barra-in {
      max-width: 1100px;
      margin: 0 auto;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .marca {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--app-texto);
    }
    .marca img {
      border-radius: 8px;
      height: auto;
    }
    .marca-texto {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    .marca-texto small {
      color: var(--app-suave);
    }
    .usuario {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .usuario-nombre {
      font-weight: 600;
    }
    .nav {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 16px;
      display: flex;
      gap: 4px;
      overflow-x: auto;
    }
    .nav a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 14px;
      min-height: 44px;
      text-decoration: none;
      color: var(--app-suave);
      font-weight: 700;
      border-bottom: 3px solid transparent;
      white-space: nowrap;
    }
    .nav a:hover {
      color: var(--app-texto);
    }
    .nav a.activo {
      color: #0f3a70;
      border-bottom-color: #1f5aa6;
    }
    main:focus {
      outline: none;
    }
    @media (max-width: 600px) {
      .usuario-nombre,
      .marca-texto small {
        display: none;
      }
    }
  `,
})
export class Marco {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly enlaces = computed<EnlaceNav[]>(() =>
    this.auth.rol() === 'admin'
      ? [
          { ruta: '/admin/agenda', texto: 'Agenda', icono: 'event_note' },
          { ruta: '/admin/especialistas', texto: 'Especialistas', icono: 'groups' },
          { ruta: '/admin/horarios', texto: 'Horarios', icono: 'schedule' },
        ]
      : [{ ruta: '/mi-agenda', texto: 'Mi agenda', icono: 'calendar_month' }],
  );

  protected async salir(): Promise<void> {
    await this.auth.cerrarSesion();
    await this.router.navigateByUrl('/ingresar');
  }
}
