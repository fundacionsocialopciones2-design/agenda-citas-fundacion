import { Component, effect, inject, input, output, signal, untracked, computed } from '@angular/core';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { Cupo } from '../../core/models';
import { diaBogota, fechaBogota, horaBogota, hoyBogota, sumarDias } from '../../core/tiempo';
import { Estado } from '../../shared/estado';
import { valorDe } from '../../shared/eventos-formulario';

const DIAS_VENTANA = 14;

/** Muestra los cupos libres reales (calculados por el servidor) de un especialista en una ventana de 14 días. */
@Component({
  selector: 'app-selector-cupos',
  imports: [Estado],
  template: `
    <div class="campo">
      <label for="desde">Buscar cupos desde</label>
      <input id="desde" type="date" [min]="hoy" [value]="desde()" (input)="desde.set(valor($event))" />
    </div>

    @if (cargando()) {
      <app-estado tipo="cargando" titulo="Buscando cupos…" />
    } @else if (error()) {
      <app-estado tipo="error" [mensaje]="error()" (reintentar)="recargar()" />
    } @else if (grupos().length === 0) {
      <app-estado icono="event_busy" titulo="Sin cupos en estas fechas" [mensaje]="'No hay cupos entre ' + desde() + ' y ' + hasta() + '. Prueba con otra fecha de inicio.'" />
    } @else {
      <fieldset class="cupos">
        <legend class="solo-lectores">Cupos disponibles</legend>
        @for (g of grupos(); track g.dia) {
          <div class="grupo">
            <span class="grupo-dia">{{ g.etiqueta }}</span>
            <div class="chips">
              @for (c of g.cupos; track c.starts_at) {
                <label class="cupo">
                  <input type="radio" name="cupo" [value]="c.starts_at" [checked]="c.starts_at === elegido()" (change)="elegir(c.starts_at)" />
                  <span>{{ hora(c.starts_at) }}</span>
                </label>
              }
            </div>
          </div>
        }
      </fieldset>
    }
  `,
  styles: `
    .cupos {
      border: 0;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: 300px;
      overflow-y: auto;
    }
    .grupo-dia {
      display: block;
      font-weight: 700;
      margin-bottom: 6px;
      text-transform: capitalize;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .cupo {
      position: relative;
    }
    .cupo input {
      position: absolute;
      opacity: 0;
      inset: 0;
      cursor: pointer;
    }
    .cupo span {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 0 16px;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 999px;
      background: #fff;
    }
    .cupo input:checked + span {
      background: #1f5aa6;
      border-color: #1f5aa6;
      color: #fff;
    }
    .cupo input:focus-visible + span {
      outline: 3px solid #1f5aa6;
      outline-offset: 2px;
    }
  `,
})
export class SelectorCupos {
  private readonly api = inject(AgendaApi);

  readonly specialistId = input.required<string>();
  readonly specialtyId = input.required<string>();
  readonly cupoElegido = output<string | null>();

  protected readonly hoy = hoyBogota();
  protected readonly desde = signal(hoyBogota());
  protected readonly hasta = computed(() => sumarDias(this.desde(), DIAS_VENTANA - 1));
  protected readonly cupos = signal<Cupo[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly elegido = signal<string | null>(null);

  protected readonly hora = horaBogota;
  protected readonly valor = valorDe;

  protected readonly grupos = computed(() => {
    const mapa = new Map<string, Cupo[]>();
    for (const c of this.cupos()) {
      const dia = diaBogota(c.starts_at);
      mapa.set(dia, [...(mapa.get(dia) ?? []), c]);
    }
    return [...mapa].map(([dia, cupos]) => ({ dia, etiqueta: fechaBogota(cupos[0].starts_at), cupos }));
  });

  private secuencia = 0;

  constructor() {
    effect(() => {
      const sp = this.specialistId();
      const sy = this.specialtyId();
      const d = this.desde();
      untracked(() => void this.cargar(sp, sy, d));
    });
  }

  protected recargar(): void {
    void this.cargar(this.specialistId(), this.specialtyId(), this.desde());
  }

  private async cargar(sp: string, sy: string, desde: string): Promise<void> {
    this.elegir(null);
    if (!sp || !sy || !desde) {
      this.cupos.set([]);
      return;
    }
    const mia = ++this.secuencia;
    this.cargando.set(true);
    this.error.set('');
    try {
      const cupos = await this.api.cuposLibres(sp, sy, desde, sumarDias(desde, DIAS_VENTANA - 1));
      if (mia === this.secuencia) this.cupos.set(cupos);
    } catch (e) {
      if (mia === this.secuencia) this.error.set(mensajeDeError(e));
    } finally {
      if (mia === this.secuencia) this.cargando.set(false);
    }
  }

  protected elegir(iso: string | null): void {
    this.elegido.set(iso);
    this.cupoElegido.emit(iso);
  }
}
