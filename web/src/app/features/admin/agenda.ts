import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgendaApi } from '../../core/agenda.api';
import { mensajeDeError } from '../../core/errores';
import { Cita, Especialidad, Especialista, ETIQUETA_ESTADO, EstadoCita, FiltrosCitas } from '../../core/models';
import { fechaBogota, hoyBogota, horaBogota, sumarDias } from '../../core/tiempo';
import { Estado } from '../../shared/estado';
import { valorDe } from '../../shared/eventos-formulario';
import { CancelarCita } from './cancelar-cita';
import { NuevaCita } from './nueva-cita';
import { ReprogramarCita } from './reprogramar-cita';

@Component({
  selector: 'app-agenda-admin',
  imports: [MatButtonModule, MatIconModule, Estado],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Agenda</h1>
          <p>Consulta las citas, crea nuevas, cancela o reprograma. Horas de Colombia.</p>
        </div>
        <button mat-flat-button type="button" (click)="nueva()" [disabled]="!catalogosListos()">
          <mat-icon aria-hidden="true">add</mat-icon>
          Nueva cita
        </button>
      </div>

      <form class="tarjeta" (submit)="$event.preventDefault(); buscar()" aria-label="Filtros de la agenda">
        <div class="fila">
          <div class="campo" style="margin: 0">
            <label for="f-desde">Desde</label>
            <input id="f-desde" type="date" [value]="filtros().desde" (input)="cambiar('desde', valor($event))" />
          </div>
          <div class="campo" style="margin: 0">
            <label for="f-hasta">Hasta</label>
            <input id="f-hasta" type="date" [value]="filtros().hasta" (input)="cambiar('hasta', valor($event))" />
          </div>
          <div class="campo" style="margin: 0">
            <label for="f-esp">Especialista</label>
            <select id="f-esp" (change)="cambiar('specialistId', valor($event))">
              <option value="">Todos</option>
              @for (e of especialistas(); track e.id) {
                <option [value]="e.id">{{ e.full_name }}</option>
              }
            </select>
          </div>
          <div class="campo" style="margin: 0">
            <label for="f-sp">Especialidad</label>
            <select id="f-sp" (change)="cambiar('specialtyId', valor($event))">
              <option value="">Todas</option>
              @for (e of especialidades(); track e.id) {
                <option [value]="e.id">{{ e.name }}</option>
              }
            </select>
          </div>
          <div class="campo" style="margin: 0">
            <label for="f-est">Estado</label>
            <select id="f-est" (change)="cambiar('estado', valor($event))">
              <option value="">Todos</option>
              @for (e of estados; track e.valor) {
                <option [value]="e.valor">{{ e.texto }}</option>
              }
            </select>
          </div>
          <div class="campo" style="margin: 0">
            <label for="f-doc">Documento del paciente</label>
            <input id="f-doc" type="text" autocomplete="off" [value]="filtros().documento" (input)="cambiar('documento', valor($event))" />
          </div>
        </div>
        <div class="acciones" style="margin-top: 12px">
          <button mat-flat-button type="submit" [disabled]="estado() === 'cargando'">Buscar</button>
          <button mat-button type="button" (click)="limpiar()">Limpiar filtros</button>
        </div>
      </form>

      @switch (estado()) {
        @case ('cargando') {
          <app-estado tipo="cargando" titulo="Cargando citas…" />
        }
        @case ('error') {
          <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="buscar()" />
        }
        @default {
          @if (citas().length === 0) {
            <app-estado icono="event_available" titulo="No hay citas con estos filtros" mensaje="Cambia las fechas o los filtros, o crea una cita nueva." />
          } @else {
            <table class="tabla">
              <caption>{{ citas().length }} cita(s) encontradas{{ citas().length === 500 ? ' (se muestran las primeras 500; afina los filtros)' : '' }}</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha y hora</th>
                  <th scope="col">Paciente</th>
                  <th scope="col">Especialidad</th>
                  <th scope="col">Especialista</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (c of citas(); track c.id) {
                  <tr>
                    <td data-etiqueta="Fecha y hora">
                      <strong>{{ dia(c.starts_at) }}</strong><br />{{ hora(c.starts_at) }} – {{ hora(c.ends_at) }}
                    </td>
                    <td data-etiqueta="Paciente">
                      {{ c.patients.first_names }} {{ c.patients.last_names }}<br />
                      <small class="ayuda">{{ c.patients.document_type }} {{ c.patients.document_number }}@if (c.patients.phone) { · {{ c.patients.phone }} }</small>
                    </td>
                    <td data-etiqueta="Especialidad">{{ c.specialties.name }}</td>
                    <td data-etiqueta="Especialista">{{ c.specialists.full_name }}</td>
                    <td data-etiqueta="Estado">
                      <span class="chip" [class]="'chip chip--' + c.status">{{ etiqueta[c.status] }}</span>
                      @if (c.rescheduled_from) {
                        <br /><small class="ayuda">Reprogramada</small>
                      }
                    </td>
                    <td data-etiqueta="Acciones">
                      <div class="acciones">
                        @if (c.status === 'confirmada') {
                          @if (esFutura(c)) {
                            <button mat-stroked-button type="button" (click)="reprogramar(c)">Reprogramar</button>
                            <button mat-button type="button" (click)="cancelar(c)">Cancelar</button>
                          } @else {
                            <button mat-stroked-button type="button" (click)="asistencia(c, 'asistida')">Asistió</button>
                            <button mat-button type="button" (click)="asistencia(c, 'no_asistio')">No asistió</button>
                          }
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        }
      }
    </div>
  `,
})
export class AgendaAdmin {
  private readonly api = inject(AgendaApi);
  private readonly dialog = inject(MatDialog);
  private readonly aviso = inject(MatSnackBar);

  protected readonly valor = valorDe;
  protected readonly etiqueta = ETIQUETA_ESTADO;
  protected readonly estados = (Object.keys(ETIQUETA_ESTADO) as EstadoCita[]).map((v) => ({ valor: v, texto: ETIQUETA_ESTADO[v] }));
  protected readonly dia = fechaBogota;
  protected readonly hora = horaBogota;

  protected readonly filtros = signal<FiltrosCitas>({
    desde: hoyBogota(),
    hasta: sumarDias(hoyBogota(), 6),
    specialistId: '',
    specialtyId: '',
    estado: '',
    documento: '',
  });
  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly mensajeError = signal('');
  protected readonly citas = signal<Cita[]>([]);
  protected readonly especialistas = signal<Especialista[]>([]);
  protected readonly especialidades = signal<Especialidad[]>([]);
  protected readonly catalogosListos = signal(false);

  constructor() {
    void this.cargarCatalogos();
    void this.buscar();
  }

  private async cargarCatalogos(): Promise<void> {
    try {
      const [esp, sp] = await Promise.all([this.api.especialistas(), this.api.especialidades()]);
      this.especialistas.set(esp);
      this.especialidades.set(sp);
      this.catalogosListos.set(true);
    } catch {
      // Los filtros quedan sin opciones; la lista de citas muestra su propio estado de error.
    }
  }

  protected cambiar<K extends keyof FiltrosCitas>(campo: K, valor: string): void {
    this.filtros.update((f) => ({ ...f, [campo]: valor }));
  }

  protected limpiar(): void {
    this.filtros.set({ desde: hoyBogota(), hasta: sumarDias(hoyBogota(), 6), specialistId: '', specialtyId: '', estado: '', documento: '' });
    void this.buscar();
  }

  protected esFutura(c: Cita): boolean {
    return new Date(c.starts_at).getTime() > Date.now();
  }

  protected async buscar(): Promise<void> {
    const f = this.filtros();
    if (!f.desde || !f.hasta || f.hasta < f.desde) {
      this.mensajeError.set('Revisa las fechas: «Hasta» no puede ser anterior a «Desde».');
      this.estado.set('error');
      return;
    }
    this.estado.set('cargando');
    try {
      this.citas.set(await this.api.citas(f));
      this.estado.set('listo');
    } catch (e) {
      this.mensajeError.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }

  private alCerrar(mensaje: string) {
    return (ok: boolean | undefined) => {
      if (ok) {
        this.aviso.open(mensaje, 'Cerrar', { duration: 5000 });
        void this.buscar();
      }
    };
  }

  protected nueva(): void {
    this.dialog
      .open(NuevaCita, { width: '640px', data: { especialidades: this.especialidades(), especialistas: this.especialistas() } })
      .afterClosed()
      .subscribe(this.alCerrar('Cita reservada.'));
  }

  protected reprogramar(c: Cita): void {
    this.dialog.open(ReprogramarCita, { width: '560px', data: c }).afterClosed().subscribe(this.alCerrar('Cita reprogramada.'));
  }

  protected cancelar(c: Cita): void {
    this.dialog.open(CancelarCita, { width: '480px', data: c }).afterClosed().subscribe(this.alCerrar('Cita cancelada. El cupo quedó libre.'));
  }

  protected async asistencia(c: Cita, estado: 'asistida' | 'no_asistio'): Promise<void> {
    try {
      await this.api.registrarAsistencia(c.id, estado);
      this.aviso.open('Asistencia registrada.', 'Cerrar', { duration: 4000 });
      await this.buscar();
    } catch (e) {
      this.aviso.open(mensajeDeError(e), 'Cerrar', { duration: 8000 });
    }
  }
}
