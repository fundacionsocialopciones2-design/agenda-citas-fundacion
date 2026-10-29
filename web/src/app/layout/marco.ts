import { BreakpointObserver } from '@angular/cdk/layout';
import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';

interface EnlaceNav {
  ruta: string;
  texto: string;
  icono: string;
}

const CLAVE_CONTRAIDO = 'menu-contraido';

function leerContraido(): boolean {
  try {
    return localStorage.getItem(CLAVE_CONTRAIDO) === '1';
  } catch {
    return false; // almacenamiento bloqueado: se usa el menú expandido
  }
}

/**
 * Marco de la aplicación autenticada: barra superior, menú lateral según rol y contenido.
 * En pantallas anchas el menú queda fijo y se puede contraer a solo íconos; en angostas se abre con ☰ sobre el contenido.
 */
@Component({
  selector: 'app-marco',
  imports: [NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet, MatButtonModule, MatIconModule, MatSidenavModule, MatTooltipModule],
  template: `
    <a class="saltar" href="#contenido">Saltar al contenido</a>
    <header class="barra">
      <button
        mat-icon-button
        type="button"
        class="menu-boton"
        (click)="alternarMenu()"
        [attr.aria-label]="movil() ? 'Abrir menú' : contraido() ? 'Expandir menú' : 'Contraer menú'"
        [attr.aria-expanded]="movil() ? abiertoMovil() : !contraido()"
        aria-controls="menu-principal"
      >
        <mat-icon aria-hidden="true">menu</mat-icon>
      </button>
      <a class="marca" [routerLink]="auth.rutaInicio()">
        <img ngSrc="logo-fundacion.jpg" width="40" height="40" alt="" priority />
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
    </header>

    <mat-sidenav-container class="contenedor" autosize>
      <mat-sidenav
        id="menu-principal"
        class="lateral"
        [class.lateral--contraido]="contraido() && !movil()"
        [mode]="movil() ? 'over' : 'side'"
        [opened]="!movil() || abiertoMovil()"
        (closedStart)="abiertoMovil.set(false)"
      >
        <nav aria-label="Principal">
          <ul>
            @for (e of enlaces(); track e.ruta) {
              <li>
                <a
                  [routerLink]="e.ruta"
                  routerLinkActive="activo"
                  ariaCurrentWhenActive="page"
                  (click)="abiertoMovil.set(false)"
                  [matTooltip]="e.texto"
                  matTooltipPosition="right"
                  [matTooltipDisabled]="!contraido() || movil()"
                >
                  <mat-icon aria-hidden="true">{{ e.icono }}</mat-icon>
                  <span class="texto" [class.solo-lectores]="contraido() && !movil()">{{ e.texto }}</span>
                </a>
              </li>
            }
          </ul>
        </nav>
      </mat-sidenav>
      <mat-sidenav-content>
        <main id="contenido" tabindex="-1">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100dvh;
    }
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
      flex: none;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px 8px 8px;
      background: #fff;
      border-bottom: 1px solid var(--app-borde-suave);
      border-top: 4px solid var(--app-acento);
      box-shadow: 0 2px 10px rgba(16, 42, 84, 0.07);
      z-index: 5;
    }
    .menu-boton {
      flex: none;
    }
    .marca {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--app-texto);
      margin-right: auto;
      min-width: 0;
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
    .contenedor {
      flex: 1;
      min-height: 0;
      background: linear-gradient(180deg, #eaf1fb 0, var(--app-fondo) 280px);
    }
    .lateral {
      width: 232px;
      background: #fff;
      border-right: 0;
      box-shadow: 2px 0 14px rgba(16, 42, 84, 0.07);
      transition: width 150ms ease;
    }
    .lateral--contraido {
      width: 72px;
    }
    nav ul {
      list-style: none;
      margin: 0;
      padding: 12px 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    nav a {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 48px;
      padding: 0 16px;
      border-radius: 10px;
      text-decoration: none;
      color: var(--app-suave);
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
    }
    nav a:hover {
      background: var(--app-fondo);
      color: var(--app-texto);
    }
    nav a.activo {
      background: linear-gradient(90deg, #dce9fa, #eaf2fc);
      color: #0f3a70;
      box-shadow:
        inset 4px 0 0 #1f5aa6,
        0 1px 3px rgba(16, 42, 84, 0.1);
    }
    .lateral--contraido nav a {
      justify-content: center;
      padding: 0;
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
    @media (prefers-reduced-motion: reduce) {
      .lateral {
        transition: none;
      }
    }
  `,
})
export class Marco {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly movil = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 840px)')
      .pipe(map((r) => r.matches)),
    { initialValue: false },
  );
  protected readonly abiertoMovil = signal(false);
  protected readonly contraido = signal(leerContraido());

  protected readonly enlaces = computed<EnlaceNav[]>(() =>
    this.auth.rol() === 'admin'
      ? [
          { ruta: '/admin/agenda', texto: 'Agenda', icono: 'event_note' },
          { ruta: '/admin/especialistas', texto: 'Especialistas', icono: 'groups' },
          { ruta: '/admin/horarios', texto: 'Horarios', icono: 'schedule' },
        ]
      : [
          { ruta: '/mi-panel', texto: 'Dashboard', icono: 'dashboard' },
          { ruta: '/mi-agenda', texto: 'Mi agenda', icono: 'calendar_month' },
        ],
  );

  protected alternarMenu(): void {
    if (this.movil()) {
      this.abiertoMovil.update((v) => !v);
      return;
    }
    const nuevo = !this.contraido();
    this.contraido.set(nuevo);
    try {
      localStorage.setItem(CLAVE_CONTRAIDO, nuevo ? '1' : '0');
    } catch {
      // sin almacenamiento: la preferencia dura solo esta sesión
    }
  }

  protected async salir(): Promise<void> {
    await this.auth.cerrarSesion();
    await this.router.navigateByUrl('/ingresar');
  }
}
