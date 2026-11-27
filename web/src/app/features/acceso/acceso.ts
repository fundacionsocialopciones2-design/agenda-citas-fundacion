import { NgOptimizedImage } from '@angular/common';
import { Component, input } from '@angular/core';
import { SelectorTema } from '../../shared/selector-tema';

/** Marco común de las pantallas de acceso: logo, título y contenido proyectado. */
@Component({
  selector: 'app-acceso',
  imports: [NgOptimizedImage, SelectorTema],
  template: `
    <main class="acceso">
      <app-selector-tema class="acceso-tema" />
      <section class="acceso-tarjeta" [attr.aria-labelledby]="'acceso-titulo'">
        <img ngSrc="logo-fundacion.jpg" width="96" height="96" alt="Logo de la Fundación Social Opciones" priority />
        <div class="acceso-cabecera">
          <h1 id="acceso-titulo">{{ titulo() }}</h1>
          @if (subtitulo()) {
            <p>{{ subtitulo() }}</p>
          }
        </div>
        <ng-content />
      </section>
    </main>
  `,
  styles: `
    .acceso {
      position: relative;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px 16px;
      background: linear-gradient(180deg, var(--app-fondo-tinte) 0, var(--app-fondo) 280px);
    }
    .acceso-tarjeta {
      width: 100%;
      max-width: 420px;
      background: var(--app-superficie);
      border: 1px solid var(--app-borde);
      border-top: 4px solid var(--app-acento);
      border-radius: 16px;
      padding: 28px 28px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .acceso-tema {
      position: absolute;
      top: 12px;
      right: 12px;
    }
    img {
      align-self: center;
      border-radius: 12px;
      height: auto;
    }
    .acceso-cabecera {
      text-align: center;
    }
    .acceso-cabecera p {
      margin: 6px 0 0;
      color: var(--app-suave);
    }
  `,
})
export class Acceso {
  readonly titulo = input.required<string>();
  readonly subtitulo = input('');
}
