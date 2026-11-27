import { Component, computed, inject, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AgendaApi } from '../../core/agenda.api';
import { ETIQUETA_SOLICITUD, EstadoSolicitud, SolicitudAsesoria } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';
import { enlaceLlamada, enlaceWhatsApp, telefonoParaLlamar } from './contacto';
import { GestionEstado } from './gestion-estado';
import { destinoAsesoria } from './pestanas-gestion';

/** Panel con la información de una solicitud de asesoría y el cambio de su estado. El «detalle» del caso puede ser sensible. */
@Component({
  selector: 'app-detalle-solicitud',
  imports: [MatButtonModule, MatIconModule, GestionEstado],
  host: { class: 'detalle-panel' },
  template: `
    @let s = solicitud();
    <div class="detalle-cabecera">
      <h2 tabindex="-1">{{ s.nombre_completo }}</h2>
      <span class="chip" [class]="'chip chip--' + s.estado">{{ etiqueta[s.estado] }}</span>
    </div>
    <p class="destacado">
      <span class="destacado__etiqueta">Lo que contó la persona</span>
      <span class="destacado__texto caso">{{ s.detalle || 'No escribió detalles del caso.' }}</span>
    </p>
    <div class="acciones">
      <a mat-flat-button [href]="llamar()">
        <mat-icon aria-hidden="true">call</mat-icon>
        Llamar al {{ telefono() }}
      </a>
      <a mat-stroked-button [href]="whatsapp()" target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp (se abre en otra pestaña)">
        <mat-icon aria-hidden="true">chat</mat-icon>
        WhatsApp
      </a>
    </div>
    <app-gestion-estado
      [estado]="s.estado"
      [etiquetas]="etiqueta"
      [destino]="destino"
      [guardar]="guardar"
      (cambiada)="cambiada.emit()"
    />
    <dl class="datos">
      <div><dt>Asesoría</dt>
      <dd>{{ s.servicio }}</dd></div>
      @if (s.categoria) {
        <div><dt>Categoría</dt>
        <dd>{{ s.categoria }}</dd></div>
      }
      <div><dt>Preferencia</dt>
      <dd>{{ s.preferencia || 'Sin preferencia' }}</dd></div>
      <div><dt>Solicitud</dt>
      <dd>{{ fecha(s.creado) }}</dd></div>
      <div><dt>Documento</dt>
      <dd>{{ s.numero_documento ? s.tipo_documento + ' ' + s.numero_documento : 'No registrado' }}</dd></div>
      <div><dt>WhatsApp</dt>
      <dd>{{ s.telefono }}</dd></div>
      <div><dt>Teléfono de contacto</dt>
      <dd>{{ s.telefono_contacto || 'El mismo de WhatsApp' }}</dd></div>
      <div><dt>Correo</dt>
      <dd>
        @if (s.correo) {
          <a [href]="'mailto:' + s.correo">{{ s.correo }}</a>
        } @else {
          <span class="ayuda">No registrado</span>
        }
      </dd></div>
      <div><dt>Modalidad</dt>
      <dd>{{ s.modalidad || 'No indicada' }}</dd></div>
      @if (s.direccion) {
        <div><dt>Dirección</dt>
        <dd>{{ s.direccion }}</dd></div>
      }
      <div><dt>Autorizó datos</dt>
      <dd>{{ fecha(s.autoriza_datos_at) }}</dd></div>
    </dl>
    @if (s.notas) {
      <h3>Notas</h3>
      <p class="destacado destacado__texto">{{ s.notas }}</p>
    }
    <p class="ayuda">Información confidencial: no la compartas por fuera de la fundación.</p>
  `,
})
export class DetalleSolicitud {
  readonly solicitud = input.required<SolicitudAsesoria>();
  protected readonly etiqueta = ETIQUETA_SOLICITUD;
  protected readonly fecha = fechaHoraBogota;
  protected readonly destino = destinoAsesoria;

  /** Se guardó el estado (o lo que se veía ya no era lo guardado): hay que volver a consultar. */
  readonly cambiada = output<void>();
  private readonly api = inject(AgendaApi);
  private readonly gestion = viewChild(GestionEstado);
  /** Mientras guarda, la pantalla no deja cambiar de registro. */
  readonly ocupado = computed(() => this.gestion()?.ocupado() ?? false);

  protected readonly guardar = (actual: EstadoSolicitud, nuevo: EstadoSolicitud) => this.api.cambiarEstadoAsesoria(this.solicitud().id, actual, nuevo);
  protected readonly llamar = computed(() => enlaceLlamada(this.solicitud()));
  protected readonly whatsapp = computed(() => enlaceWhatsApp(this.solicitud()));
  protected readonly telefono = computed(() => telefonoParaLlamar(this.solicitud()));
}
