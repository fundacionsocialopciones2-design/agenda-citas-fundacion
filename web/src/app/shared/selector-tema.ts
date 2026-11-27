import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PreferenciaTema, TemaService } from '../core/tema.service';

const OPCIONES: { valor: PreferenciaTema; texto: string; icono: string }[] = [
  { valor: 'claro', texto: 'Claro', icono: 'light_mode' },
  { valor: 'oscuro', texto: 'Oscuro', icono: 'dark_mode' },
  { valor: 'sistema', texto: 'Según el equipo', icono: 'computer' },
];

/** Botón de apariencia: claro, oscuro o la configuración del equipo. */
@Component({
  selector: 'app-selector-tema',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule],
  template: `
    <button mat-icon-button type="button" [matMenuTriggerFor]="menu" matTooltip="Apariencia" [attr.aria-label]="'Apariencia: ' + actual().texto">
      <mat-icon aria-hidden="true">{{ tema.oscuro() ? 'dark_mode' : 'light_mode' }}</mat-icon>
    </button>
    <mat-menu #menu="matMenu">
      @for (o of opciones; track o.valor) {
        <button mat-menu-item type="button" role="menuitemradio" [attr.aria-checked]="tema.preferencia() === o.valor" (click)="tema.elegir(o.valor)">
          <mat-icon aria-hidden="true">{{ o.icono }}</mat-icon>
          <span class="opcion">
            {{ o.texto }}
            @if (tema.preferencia() === o.valor) {
              <mat-icon class="marca" aria-hidden="true">check</mat-icon>
            }
          </span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .opcion {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .marca {
      margin: 0;
    }
  `,
})
export class SelectorTema {
  protected readonly tema = inject(TemaService);
  protected readonly opciones = OPCIONES;
  protected readonly actual = computed(() => OPCIONES.find((o) => o.valor === this.tema.preferencia()) ?? OPCIONES[0]);
}
