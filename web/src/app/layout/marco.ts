import { BreakpointObserver } from '@angular/cdk/layout';
import { NgOptimizedImage } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { map } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { UrgenciasResumen } from '../core/urgencias-resumen.service';
import { SelectorTema } from '../shared/selector-tema';

interface EnlaceNav {
  ruta: string;
  texto: string;
  icono: string;
  /** Número rojo junto al enlace (urgencias sin atender). */
  contador?: number;
}

interface GrupoNav {
  /** Encabezado del grupo; sin él, los enlaces van sueltos. */
  titulo?: string;
  enlaces: EnlaceNav[];
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
  imports: [NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet, MatButtonModule, MatIconModule, MatSidenavModule, MatTooltipModule, SelectorTema],
  template: `
    <a class="saltar" href="#contenido">Saltar al contenido</a>
    <header class="barra">
      <button
        mat-icon-button
        type="button"
        class="menu-boton"
        (click)="alternarMenu()"
        [attr.aria-label]="
          movil() ? (sinAtender() ? 'Abrir menú (urgencias sin atender: ' + sinAtender() + ')' : 'Abrir menú') : contraido() ? 'Expandir menú' : 'Contraer menú'
        "
        [attr.aria-expanded]="movil() ? abiertoMovil() : !contraido()"
        aria-controls="menu-principal"
      >
        <mat-icon aria-hidden="true">menu</mat-icon>
        @if (movil() && sinAtender()) {
          <span class="insignia insignia--boton" aria-hidden="true">{{ sinAtender() }}</span>
        }
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
        <app-selector-tema />
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
          @for (g of grupos(); track $index) {
            @if (g.titulo) {
              <p class="grupo" [id]="'grupo-' + $index" [class.solo-lectores]="contraido() && !movil()">{{ g.titulo }}</p>
            }
            <ul [attr.aria-labelledby]="g.titulo ? 'grupo-' + $index : null" [class.separado]="g.titulo">
              @for (e of g.enlaces; track e.ruta) {
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
                    @if (e.contador) {
                      <span class="insignia" aria-hidden="true">{{ e.contador }}</span>
                      <span class="solo-lectores">, sin atender: {{ e.contador }}</span>
                    }
                  </a>
                </li>
              }
            </ul>
          }
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
      background: var(--app-superficie);
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
      background: var(--app-superficie);
      border-bottom: 1px solid var(--app-borde-suave);
      border-top: 4px solid var(--app-acento);
      box-shadow: 0 2px 10px light-dark(rgba(16, 42, 84, 0.07), rgba(0, 0, 0, 0.4));
      z-index: 5;
    }
    .menu-boton {
      flex: none;
      position: relative;
      overflow: visible;
    }
    .insignia {
      margin-left: auto;
      min-width: 22px;
      padding: 0 6px;
      border-radius: 999px;
      background: var(--app-peligro);
      color: #fff;
      font-size: 0.8rem;
      font-weight: 800;
      line-height: 22px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .insignia--boton {
      position: absolute;
      top: 2px;
      right: 0;
      min-width: 18px;
      line-height: 18px;
      font-size: 0.7rem;
    }
    .lateral--contraido nav a {
      position: relative;
    }
    .lateral--contraido .insignia {
      position: absolute;
      top: 2px;
      right: 4px;
      min-width: 18px;
      padding: 0 4px;
      line-height: 18px;
      font-size: 0.7rem;
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
      background: linear-gradient(180deg, var(--app-fondo-tinte) 0, var(--app-fondo) 280px);
    }
    .lateral {
      width: 232px;
      background: var(--app-superficie);
      border-right: 0;
      box-shadow: 2px 0 14px light-dark(rgba(16, 42, 84, 0.07), rgba(0, 0, 0, 0.4));
      transition: width 150ms ease;
    }
    .lateral--contraido {
      width: 72px;
    }
    nav {
      padding: 12px 8px;
    }
    .grupo {
      margin: 14px 0 4px;
      padding: 0 16px;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--app-suave);
    }
    .lateral--contraido ul.separado {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--app-borde-suave);
    }
    nav ul {
      list-style: none;
      margin: 0;
      padding: 0;
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
      background: linear-gradient(90deg, var(--app-activo), var(--app-activo-fin));
      color: var(--app-primario-suave-texto);
      box-shadow:
        inset 4px 0 0 var(--app-primario),
        0 1px 3px light-dark(rgba(16, 42, 84, 0.1), rgba(0, 0, 0, 0.35));
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

  private readonly urgencias = inject(UrgenciasResumen);
  protected readonly sinAtender = computed(() => this.urgencias.resumen()?.sin_atender ?? 0);

  constructor() {
    // Solo el administrador consulta las urgencias; al cambiar de sesión o cerrar el marco se detiene.
    effect((alLimpiar) => {
      if (this.auth.rol() !== 'admin') return;
      const detener = untracked(() => this.urgencias.vigilar());
      alLimpiar(detener);
    });
  }

  protected readonly grupos = computed<GrupoNav[]>(() =>
    this.auth.rol() === 'admin'
      ? [
          { enlaces: [{ ruta: '/admin/inicio', texto: 'Inicio', icono: 'home' }] },
          {
            titulo: 'Atención',
            enlaces: [
              { ruta: '/admin/urgencias', texto: 'Urgencias', icono: 'emergency', contador: this.sinAtender() },
              { ruta: '/admin/agenda', texto: 'Agenda', icono: 'event_note' },
              { ruta: '/admin/agenda-pendiente', texto: 'Agenda pendiente', icono: 'pending_actions' },
            ],
          },
          {
            titulo: 'Solicitudes',
            enlaces: [
              { ruta: '/admin/cursos', texto: 'Cursos', icono: 'school' },
              { ruta: '/admin/asesorias', texto: 'Asesorías', icono: 'gavel' },
            ],
          },
          {
            titulo: 'Configuración',
            enlaces: [
              { ruta: '/admin/especialistas', texto: 'Especialistas', icono: 'groups' },
              { ruta: '/admin/horarios', texto: 'Horarios', icono: 'schedule' },
            ],
          },
        ]
      : [
          {
            enlaces: [
              { ruta: '/mi-panel', texto: 'Dashboard', icono: 'dashboard' },
              { ruta: '/mi-agenda', texto: 'Mi agenda', icono: 'calendar_month' },
            ],
          },
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
