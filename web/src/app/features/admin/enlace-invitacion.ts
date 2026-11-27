import { Component, DOCUMENT, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { fechaHoraBogota } from '../../core/tiempo';

export interface DatosEnlace {
  nombre: string;
  enlace: string;
  /** Instante ISO en que deja de servir. */
  vence: string;
}

/** Muestra una sola vez el enlace de invitación recién generado, para copiarlo o enviarlo por WhatsApp. */
@Component({
  selector: 'app-enlace-invitacion',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Enlace de acceso para {{ d.nombre }}</h2>
    <mat-dialog-content>
      <p>Envíaselo <strong>solo a esa persona</strong>: quien abra el enlace podrá crear la cuenta.</p>
      <div class="campo">
        <label for="enlace">Enlace de invitación</label>
        <input #campo id="enlace" type="text" readonly [value]="d.enlace" (focus)="campo.select()" />
      </div>
      <div class="acciones">
        <button mat-flat-button type="button" (click)="copiar()" cdkFocusInitial>
          <mat-icon aria-hidden="true">content_copy</mat-icon>
          Copiar enlace
        </button>
        <a mat-stroked-button [href]="whatsapp" target="_blank" rel="noopener noreferrer" aria-label="Enviar por WhatsApp (se abre en otra pestaña)">
          <mat-icon aria-hidden="true">chat</mat-icon>
          Enviar por WhatsApp
        </a>
      </div>
      <p class="ayuda" role="status">{{ copiado() }}</p>
      <ul class="notas">
        <li>Sirve una sola vez y vence el {{ vence }}.</li>
        <li>No se vuelve a mostrar. Si lo pierdes, genera uno nuevo (el anterior deja de funcionar).</li>
      </ul>
      @if (soloLocal) {
        <div class="aviso aviso--error" role="alert">
          El sistema aún no está publicado: este enlace solo abre en este computador.
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .notas {
      margin: 0 0 8px;
      padding-left: 20px;
    }
  `,
})
export class EnlaceInvitacion {
  protected readonly d = inject<DatosEnlace>(MAT_DIALOG_DATA);
  private readonly documento = inject(DOCUMENT);
  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  protected readonly vence = fechaHoraBogota(this.d.vence);
  protected readonly soloLocal = /\/\/(localhost|127\.0\.0\.1)[:/]/.test(this.d.enlace);
  protected readonly whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `Hola. Este es tu enlace para crear tu acceso a la agenda de la Fundación Social Opciones. Sirve una sola vez y vence el ${this.vence}: ${this.d.enlace}`,
  )}`;
  protected readonly copiado = signal('');

  protected async copiar(): Promise<void> {
    try {
      await this.documento.defaultView!.navigator.clipboard.writeText(this.d.enlace);
      this.copiado.set('Enlace copiado.');
    } catch {
      this.campo()?.nativeElement.select();
      this.copiado.set('No se pudo copiar automáticamente: el enlace quedó seleccionado, cópialo con Ctrl + C.');
    }
  }
}
