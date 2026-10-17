import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/** Estados de pantalla: cargando, vacío y error (con reintento). */
@Component({
  selector: 'app-estado',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    @switch (tipo()) {
      @case ('cargando') {
        <div class="estado" role="status" aria-live="polite">
          <mat-spinner diameter="36" aria-label="Cargando" />
          <span>{{ titulo() || 'Cargando…' }}</span>
        </div>
      }
      @case ('error') {
        <div class="estado estado--error" role="alert">
          <mat-icon aria-hidden="true">error</mat-icon>
          <strong>{{ titulo() || 'No se pudo cargar la información' }}</strong>
          @if (mensaje()) {
            <span>{{ mensaje() }}</span>
          }
          <button mat-stroked-button type="button" (click)="reintentar.emit()">Reintentar</button>
        </div>
      }
      @default {
        <div class="estado">
          <mat-icon aria-hidden="true">{{ icono() }}</mat-icon>
          <strong>{{ titulo() }}</strong>
          @if (mensaje()) {
            <span>{{ mensaje() }}</span>
          }
          <ng-content />
        </div>
      }
    }
  `,
})
export class Estado {
  readonly tipo = input<'cargando' | 'vacio' | 'error'>('vacio');
  readonly titulo = input('');
  readonly mensaje = input('');
  readonly icono = input('inbox');
  readonly reintentar = output<void>();
}
