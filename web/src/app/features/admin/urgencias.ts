import { Component, computed, DestroyRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { AtencionUrgencia, ETIQUETA_SOLICITUD, FiltrosUrgencias, ResumenUrgencias, Urgencia, VistaUrgencias } from '../../core/models';
import { haceCuanto } from '../../core/tiempo';
import { UrgenciasResumen } from '../../core/urgencias-resumen.service';
import { Estado } from '../../shared/estado';
import { valorDe } from '../../shared/eventos-formulario';
import { DetalleUrgencia } from './detalle-urgencia';
import { FilaLista, ListaDetalle } from './lista-detalle';

const VACIO: Record<VistaUrgencias, { icono: string; titulo: string; mensaje: string }> = {
  sin_atender: { icono: 'task_alt', titulo: 'No hay urgencias sin atender', mensaje: 'Cuando alguien reporte una urgencia por WhatsApp, aparecerá aquí.' },
  en_gestion: { icono: 'pending_actions', titulo: 'No hay urgencias en gestión', mensaje: 'Aquí quedan las contactadas o agendadas.' },
  historial: { icono: 'history', titulo: 'No hay urgencias en el historial', mensaje: 'Aquí quedan las atendidas o canceladas.' },
};

/**
 * Urgencias de salud reportadas por WhatsApp: pestañas por estado, lista compacta y el detalle al lado (en
 * pantallas angostas el detalle reemplaza la lista). El orden y los filtros los resuelve la base de datos.
 * La lista se recarga sola cuando cambian las cifras del contador.
 */
@Component({
  selector: 'app-urgencias',
  imports: [MatButtonModule, MatIconModule, Estado, ListaDetalle, DetalleUrgencia],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Urgencias</h1>
          <p>Personas que reportaron una urgencia de salud por WhatsApp. Información confidencial.</p>
        </div>
        <button mat-stroked-button type="button" (click)="actualizar()">
          <mat-icon aria-hidden="true">refresh</mat-icon>
          Actualizar
        </button>
      </div>

      <div class="acciones" role="group" aria-label="Urgencias por estado">
        @for (p of pestanas(); track p.vista) {
          <button
            type="button"
            [matButton]="vista() === p.vista ? 'filled' : 'outlined'"
            [attr.aria-pressed]="vista() === p.vista"
            [disabled]="bloqueado()"
            (click)="cambiarVista(p.vista)"
          >
            {{ p.texto }}
            @if (p.cantidad !== null) {
              <span class="cantidad" [class.cantidad--alerta]="p.vista === 'sin_atender' && p.cantidad > 0">{{ p.cantidad }}</span>
            }
          </button>
        }
      </div>

      <form class="filtros" (submit)="$event.preventDefault(); cargar()" aria-label="Filtros de urgencias">
        <div class="campo filtros__buscar">
          <label for="u-buscar">Nombre o documento</label>
          <input id="u-buscar" type="search" autocomplete="off" [value]="busqueda()" (input)="busqueda.set(valor($event))" />
        </div>
        <div class="campo filtros__atencion">
          <label for="u-atencion">Atención</label>
          <select id="u-atencion" [disabled]="bloqueado()" (change)="cambiarAtencion(valor($event))">
            <option value="" [selected]="!atencion()">Todas</option>
            <option value="sede" [selected]="atencion() === 'sede'">En la sede</option>
            <option value="domicilio" [selected]="atencion() === 'domicilio'">A domicilio</option>
          </select>
        </div>
        <button mat-flat-button type="submit" [disabled]="bloqueado()">Buscar</button>
      </form>

      @switch (estado()) {
        @case ('cargando') {
          <app-estado tipo="cargando" titulo="Cargando urgencias…" />
        }
        @case ('error') {
          <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="actualizar()" />
        }
        @default {
          @if (urgencias().length === 0) {
            @if (filtrada()) {
              <app-estado icono="search_off" titulo="No hay urgencias con estos filtros" mensaje="Cambia la búsqueda o el tipo de atención." />
            } @else {
              <app-estado [icono]="vacio().icono" [titulo]="vacio().titulo" [mensaje]="vacio().mensaje" />
            }
          } @else {
            <app-lista-detalle etiqueta="Lista de urgencias" [filas]="filas()" [bloqueada]="bloqueado()" [(seleccion)]="seleccion">
              <ng-template let-id>
                @if (porId().get(id); as u) {
                  <app-detalle-urgencia [urgencia]="u" [nota]="borrador(u.id)" (notaChange)="guardarBorrador(u.id, $event)" (cambiada)="alCambiar()" />
                }
              </ng-template>
            </app-lista-detalle>
          }
        }
      }
    </div>
  `,
  styles: `
    .cantidad {
      display: inline-block;
      min-width: 22px;
      margin-left: 8px;
      padding: 0 6px;
      border-radius: 999px;
      background: var(--app-primario-suave);
      color: var(--app-primario-suave-texto);
      font-size: 0.8rem;
      font-weight: 800;
      line-height: 22px;
    }
    .cantidad--alerta {
      background: var(--app-peligro);
      color: #fff;
    }
    .filtros {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 12px;
    }
    .filtros .campo {
      margin: 0;
    }
    .filtros__buscar {
      flex: 1 1 240px;
    }
    .filtros__atencion {
      flex: 0 1 200px;
    }
  `,
})
export class Urgencias {
  private readonly api = inject(AgendaApi);
  private readonly cifras = inject(UrgenciasResumen);
  private readonly detalle = viewChild(DetalleUrgencia);

  protected readonly valor = valorDe;

  protected readonly vista = signal<VistaUrgencias>('sin_atender');
  protected readonly busqueda = signal('');
  protected readonly atencion = signal<AtencionUrgencia>('');
  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly mensajeError = signal('');
  protected readonly urgencias = signal<Urgencia[]>([]);
  /** Filtros con los que se obtuvo lo que se está viendo. */
  private readonly aplicados = signal<FiltrosUrgencias>({ vista: 'sin_atender', busqueda: '', atencion: '' });
  protected readonly seleccion = signal<number | null>(null);
  /** Reloj para el «hace cuánto»: avanza cada minuto. */
  private readonly ahora = signal(Date.now());

  protected readonly porId = computed(() => new Map(this.urgencias().map((u) => [u.id, u])));
  protected readonly filas = computed<FilaLista[]>(() =>
    this.urgencias().map((u) => ({
      id: u.id,
      titulo: u.nombre_completo,
      fecha: haceCuanto(u.creado, this.ahora()),
      resumen: u.detalle || 'Sin descripción',
      chip: u.estado === 'pendiente' ? undefined : { clave: u.estado, texto: ETIQUETA_SOLICITUD[u.estado] },
      destacada: u.estado === 'pendiente',
      domicilio: /domicilio/i.test(u.modalidad ?? ''),
    })),
  );
  protected readonly bloqueado = computed(() => this.detalle()?.ocupado() ?? false);
  protected readonly filtrada = computed(() => !!this.aplicados().busqueda.trim() || !!this.aplicados().atencion);
  protected readonly vacio = computed(() => VACIO[this.vista()]);
  protected readonly pestanas = computed(() => {
    const r = this.cifras.resumen();
    return [
      { vista: 'sin_atender' as const, texto: 'Sin atender', cantidad: r?.sin_atender ?? null },
      { vista: 'en_gestion' as const, texto: 'En gestión', cantidad: r?.en_gestion ?? null },
      { vista: 'historial' as const, texto: 'Historial', cantidad: null },
    ];
  });

  private readonly borradores = new Map<number, string>();
  private peticion = 0;
  private cifrasVistas: ResumenUrgencias | null = null;

  constructor() {
    const reloj = setInterval(() => this.ahora.set(Date.now()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));

    // Si cambian las cifras (llegó o se cerró una urgencia), se recarga la lista sin parpadeo.
    effect(() => {
      const r = this.cifras.resumen();
      if (!r) return;
      const cambio = this.cifrasVistas !== null && this.cifrasVistas !== r;
      this.cifrasVistas = r;
      if (cambio) untracked(() => void this.cargar(true));
    });

    this.actualizar();
  }

  protected actualizar(): void {
    void this.cargar();
    void this.cifras.actualizar();
  }

  /** `silencioso`: conserva lo que se ve mientras llega la respuesta y si la consulta falla. */
  protected async cargar(silencioso = false): Promise<void> {
    const peticion = ++this.peticion;
    // Una recarga automática repite los filtros aplicados, no lo que se esté escribiendo.
    const filtros: FiltrosUrgencias = silencioso
      ? { ...this.aplicados(), vista: this.vista() }
      : { vista: this.vista(), busqueda: this.busqueda(), atencion: this.atencion() };
    if (!silencioso) this.estado.set('cargando');
    try {
      const urgencias = await this.api.urgencias(filtros);
      if (peticion !== this.peticion) return; // ya se pidió otra cosa
      this.urgencias.set(urgencias);
      this.aplicados.set(filtros);
      this.ahora.set(Date.now());
      this.estado.set('listo');
    } catch (e) {
      // Una recarga silenciosa no tapa lo que ya se está viendo; si aún no había nada, se muestra el error.
      if (peticion !== this.peticion || (silencioso && this.estado() === 'listo')) return;
      this.mensajeError.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }

  protected cambiarVista(vista: VistaUrgencias): void {
    if (vista === this.vista()) return;
    this.vista.set(vista);
    this.urgencias.set([]);
    this.seleccion.set(null);
    void this.cargar();
  }

  protected cambiarAtencion(atencion: string): void {
    this.atencion.set(atencion as AtencionUrgencia);
    void this.cargar();
  }

  protected alCambiar(): void {
    void this.cargar(true);
    void this.cifras.actualizar();
  }

  protected borrador(id: number): string {
    return this.borradores.get(id) ?? '';
  }

  protected guardarBorrador(id: number, texto: string): void {
    this.borradores.set(id, texto);
  }
}
