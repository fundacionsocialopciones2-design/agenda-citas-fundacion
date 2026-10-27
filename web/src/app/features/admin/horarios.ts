import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgendaApi } from '../../core/agenda.api';
import { ErrorConflicto, mensajeDeError } from '../../core/errores';
import { Bloqueo, DIAS_SEMANA, ETIQUETA_BLOQUEO, Especialista, HorarioSemanal } from '../../core/models';
import { fechaHoraBogota, horaCorta } from '../../core/tiempo';
import { Confirmar } from '../../shared/confirmar';
import { mostrarConflictos } from './conflictos';
import { Estado } from '../../shared/estado';
import { valorDe } from '../../shared/eventos-formulario';
import { FormularioBloqueo } from './formulario-bloqueo';

interface Rango {
  inicio: string;
  fin: string;
}
type Semana = Record<number, Rango[]>;

const semanaVacia = (): Semana => Object.fromEntries(DIAS_SEMANA.map((d) => [d.valor, [] as Rango[]]));

@Component({
  selector: 'app-horarios',
  imports: [MatButtonModule, MatIconModule, Estado],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Horarios y bloqueos</h1>
          <p>Define el horario semanal de cada especialista y bloquea descansos, vacaciones o ausencias. Las horas son de Colombia.</p>
        </div>
      </div>

      @if (cargandoLista()) {
        <app-estado tipo="cargando" titulo="Cargando especialistas…" />
      } @else if (errorLista()) {
        <app-estado tipo="error" [mensaje]="errorLista()" (reintentar)="cargarLista()" />
      } @else {
        <div class="campo" style="max-width: 380px; margin: 0">
          <label for="especialista">Especialista</label>
          <select id="especialista" (change)="elegir($event)">
            <option value="" [selected]="!elegido()">Selecciona un especialista…</option>
            @for (e of especialistas(); track e.id) {
              <option [value]="e.id" [selected]="e.id === elegido()">{{ e.full_name }}{{ e.active ? '' : ' (inactivo)' }}</option>
            }
          </select>
        </div>

        @if (!elegido()) {
          <app-estado icono="schedule" titulo="Selecciona un especialista" mensaje="Verás y podrás editar su horario semanal y sus bloqueos." />
        } @else if (cargando()) {
          <app-estado tipo="cargando" titulo="Cargando horario…" />
        } @else if (error()) {
          <app-estado tipo="error" [mensaje]="error()" (reintentar)="cargarDatos()" />
        } @else {
          <section class="tarjeta" aria-labelledby="h-semanal">
            <h2 id="h-semanal">Horario semanal</h2>
            <p class="ayuda" style="margin: 4px 0 12px">
              Los cupos se generan en bloques de 60 minutos dentro de cada franja. Un día sin franjas es un día sin atención.
            </p>

            @for (d of dias; track d.valor) {
              <div class="dia" role="group" [attr.aria-label]="d.nombre">
                <strong class="dia-nombre">{{ d.nombre }}</strong>
                <div class="dia-franjas">
                  @for (r of rangos()[d.valor]; track $index) {
                    <div class="franja">
                      <input type="time" [value]="r.inicio" (input)="cambiar(d.valor, $index, 'inicio', valor($event))" [attr.aria-label]="'Inicio, ' + d.nombre + ', franja ' + ($index + 1)" />
                      <span aria-hidden="true">a</span>
                      <input type="time" [value]="r.fin" (input)="cambiar(d.valor, $index, 'fin', valor($event))" [attr.aria-label]="'Fin, ' + d.nombre + ', franja ' + ($index + 1)" />
                      <button mat-icon-button type="button" (click)="quitar(d.valor, $index)" [attr.aria-label]="'Quitar franja ' + ($index + 1) + ' del ' + d.nombre">
                        <mat-icon aria-hidden="true">delete</mat-icon>
                      </button>
                    </div>
                  } @empty {
                    <span class="ayuda">Sin atención</span>
                  }
                  <button mat-button type="button" (click)="agregar(d.valor)">
                    <mat-icon aria-hidden="true">add</mat-icon>
                    Agregar franja
                  </button>
                </div>
              </div>
            }

            @if (problemas().length) {
              <div class="aviso aviso--error" role="alert" style="margin-top: 12px">
                <div>
                  <strong>Revisa el horario:</strong>
                  <ul>
                    @for (p of problemas(); track p) {
                      <li>{{ p }}</li>
                    }
                  </ul>
                </div>
              </div>
            }
            <div class="acciones" style="margin-top: 16px">
              <button mat-flat-button type="button" (click)="guardarHorario()" [disabled]="!hayCambios() || problemas().length > 0 || guardando()">
                {{ guardando() ? 'Guardando…' : 'Guardar horario' }}
              </button>
              @if (hayCambios()) {
                <button mat-button type="button" (click)="descartar()" [disabled]="guardando()">Descartar cambios</button>
              }
            </div>
          </section>

          <section class="tarjeta" aria-labelledby="h-bloqueos">
            <div class="pagina-cabecera" style="margin-bottom: 12px">
              <div>
                <h2 id="h-bloqueos">Bloqueos</h2>
                <p class="ayuda" style="margin: 4px 0 0">Descansos, vacaciones y ausencias. Se muestran los de los últimos 30 días en adelante.</p>
              </div>
              <button mat-stroked-button type="button" (click)="nuevoBloqueo()">
                <mat-icon aria-hidden="true">event_busy</mat-icon>
                Nuevo bloqueo
              </button>
            </div>
            @if (bloqueos().length === 0) {
              <app-estado icono="event_available" titulo="Sin bloqueos" mensaje="Este especialista no tiene bloqueos próximos." />
            } @else {
              <table class="tabla">
                <caption class="solo-lectores">Bloqueos del especialista</caption>
                <thead>
                  <tr>
                    <th scope="col">Tipo</th>
                    <th scope="col">Desde</th>
                    <th scope="col">Hasta</th>
                    <th scope="col">Nota</th>
                    <th scope="col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  @for (b of bloqueos(); track b.id) {
                    <tr>
                      <td data-etiqueta="Tipo">{{ etiqueta[b.kind] }}</td>
                      <td data-etiqueta="Desde">{{ fecha(b.starts_at) }}</td>
                      <td data-etiqueta="Hasta">{{ fecha(b.ends_at) }}</td>
                      <td data-etiqueta="Nota">{{ b.note || '—' }}</td>
                      <td data-etiqueta="Acciones">
                        <div class="acciones">
                          <button mat-stroked-button type="button" (click)="editarBloqueo(b)">Editar</button>
                          <button mat-button type="button" (click)="eliminarBloqueo(b)">Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </section>
        }
      }
    </div>
  `,
  styles: `
    .dia {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 16px;
      padding: 10px 0;
      border-bottom: 1px solid var(--app-borde);
    }
    .dia:last-of-type {
      border-bottom: 0;
    }
    .dia-nombre {
      flex: 0 0 110px;
      padding-top: 10px;
    }
    .dia-franjas {
      flex: 1 1 320px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
    .franja {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .franja input {
      min-height: 44px;
      padding: 6px 10px;
      font: inherit;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 10px;
    }
  `,
})
export class Horarios {
  private readonly api = inject(AgendaApi);
  private readonly dialog = inject(MatDialog);
  private readonly aviso = inject(MatSnackBar);

  protected readonly dias = DIAS_SEMANA;
  protected readonly etiqueta = ETIQUETA_BLOQUEO;
  protected readonly fecha = fechaHoraBogota;
  protected readonly valor = valorDe;

  protected readonly cargandoLista = signal(true);
  protected readonly errorLista = signal('');
  protected readonly especialistas = signal<Especialista[]>([]);
  protected readonly elegido = signal('');

  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly guardando = signal(false);
  protected readonly rangos = signal<Semana>(semanaVacia());
  private readonly original = signal('');
  protected readonly bloqueos = signal<Bloqueo[]>([]);

  protected readonly hayCambios = computed(() => JSON.stringify(this.rangos()) !== this.original());

  protected readonly problemas = computed<string[]>(() => {
    const res: string[] = [];
    for (const d of DIAS_SEMANA) {
      const lista = this.rangos()[d.valor];
      lista.forEach((r, i) => {
        if (!r.inicio || !r.fin) res.push(`${d.nombre}, franja ${i + 1}: completa la hora de inicio y de fin.`);
        else if (r.fin <= r.inicio) res.push(`${d.nombre}, franja ${i + 1}: la hora de fin debe ser posterior al inicio.`);
      });
      const validas = lista.filter((r) => r.inicio && r.fin && r.fin > r.inicio).sort((a, b) => a.inicio.localeCompare(b.inicio));
      for (let i = 1; i < validas.length; i++) {
        if (validas[i].inicio < validas[i - 1].fin) res.push(`${d.nombre}: hay franjas que se cruzan.`);
      }
    }
    return [...new Set(res)];
  });

  constructor() {
    void this.cargarLista();
  }

  protected async cargarLista(): Promise<void> {
    this.cargandoLista.set(true);
    this.errorLista.set('');
    try {
      this.especialistas.set(await this.api.especialistas());
    } catch (e) {
      this.errorLista.set(mensajeDeError(e));
    } finally {
      this.cargandoLista.set(false);
    }
  }

  protected elegir(ev: Event): void {
    const selector = ev.target as HTMLSelectElement;
    if (this.hayCambios() && !confirm('Tienes cambios sin guardar en el horario. ¿Descartarlos?')) {
      selector.value = this.elegido();
      return;
    }
    const id = selector.value;
    this.elegido.set(id);
    if (id) void this.cargarDatos();
  }

  protected async cargarDatos(): Promise<void> {
    const id = this.elegido();
    this.cargando.set(true);
    this.error.set('');
    try {
      const [horarios, bloqueos] = await Promise.all([this.api.horarios(id), this.api.bloqueos(id)]);
      const semana = semanaVacia();
      for (const h of horarios) semana[h.weekday].push({ inicio: horaCorta(h.start_time), fin: horaCorta(h.end_time) });
      this.rangos.set(semana);
      this.original.set(JSON.stringify(semana));
      this.bloqueos.set(bloqueos);
    } catch (e) {
      this.error.set(mensajeDeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected agregar(dia: number): void {
    this.rangos.update((s) => ({ ...s, [dia]: [...s[dia], { inicio: '09:00', fin: '12:00' }] }));
  }

  protected quitar(dia: number, i: number): void {
    this.rangos.update((s) => ({ ...s, [dia]: s[dia].filter((_, idx) => idx !== i) }));
  }

  protected cambiar(dia: number, i: number, campo: keyof Rango, valor: string): void {
    this.rangos.update((s) => ({ ...s, [dia]: s[dia].map((r, idx) => (idx === i ? { ...r, [campo]: valor } : r)) }));
  }

  protected descartar(): void {
    this.rangos.set(JSON.parse(this.original()) as Semana);
  }

  protected async guardarHorario(): Promise<void> {
    const filas: HorarioSemanal[] = DIAS_SEMANA.flatMap((d) => this.rangos()[d.valor].map((r) => ({ weekday: d.valor, start_time: r.inicio, end_time: r.fin })));
    this.guardando.set(true);
    try {
      await this.api.guardarHorarios(this.elegido(), filas);
      this.aviso.open('Horario guardado.', 'Cerrar', { duration: 5000 });
      await this.cargarDatos();
    } catch (e) {
      if (e instanceof ErrorConflicto) {
        await mostrarConflictos(this.dialog, this.api, e, 'El nuevo horario dejaría estas citas fuera de atención.');
      } else {
        this.aviso.open(mensajeDeError(e), 'Cerrar', { duration: 8000 });
      }
    } finally {
      this.guardando.set(false);
    }
  }

  private abrirBloqueo(bloqueo: Bloqueo | null): void {
    this.dialog
      .open(FormularioBloqueo, { width: '520px', data: { specialistId: this.elegido(), bloqueo } })
      .afterClosed()
      .subscribe((guardado) => {
        if (guardado) {
          this.aviso.open('Bloqueo guardado.', 'Cerrar', { duration: 5000 });
          void this.cargarDatos();
        }
      });
  }

  protected nuevoBloqueo(): void {
    this.abrirBloqueo(null);
  }

  protected editarBloqueo(b: Bloqueo): void {
    this.abrirBloqueo(b);
  }

  protected eliminarBloqueo(b: Bloqueo): void {
    this.dialog
      .open(Confirmar, { data: { titulo: '¿Eliminar este bloqueo?', mensaje: 'Los cupos de ese periodo volverán a estar disponibles.', confirmar: 'Eliminar' } })
      .afterClosed()
      .subscribe(async (ok) => {
        if (!ok) return;
        try {
          await this.api.eliminarBloqueo(b.id);
          this.aviso.open('Bloqueo eliminado.', 'Cerrar', { duration: 5000 });
          await this.cargarDatos();
        } catch (e) {
          this.aviso.open(mensajeDeError(e), 'Cerrar', { duration: 8000 });
        }
      });
  }
}
