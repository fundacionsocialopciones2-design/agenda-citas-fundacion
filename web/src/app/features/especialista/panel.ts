import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AgendaApi } from '../../core/agenda.api';
import { AuthService } from '../../core/auth/auth.service';
import { mensajeDeError } from '../../core/errores';
import { CitaEspecialista, COLOR_ESTADO, ETIQUETA_ESTADO, EstadoCita, ResumenEspecialista } from '../../core/models';
import { diaMesBogota, fechaLargaBogota, horaBogota, horaDelDiaBogota } from '../../core/tiempo';
import { Estado } from '../../shared/estado';
import { aDetalle, DetalleCita } from './detalle-cita';
import { comparar, Comparacion, cuantoFalta, diaSemanaCorto, diaSemanaLargo, porcentaje, saludoDe } from './resumen';

type Tono = 'azul' | 'verde' | 'violeta' | 'rojo' | 'ambar';

interface Tarjeta {
  titulo: string;
  valor: string;
  icono: string;
  tono: Tono;
  comparacion: Comparacion | null;
  nota: string;
}

const ORDEN_ESTADOS: EstadoCita[] = ['confirmada', 'asistida', 'no_asistio', 'cancelada'];

/** Dashboard del especialista: resumen de SUS citas. Las cifras llegan calculadas desde my_dashboard. */
@Component({
  selector: 'app-panel',
  imports: [MatButtonModule, MatIconModule, RouterLink, Estado],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Dashboard</h1>
          <p class="saludo">
            {{ saludo() }}, <strong>{{ auth.perfil()?.full_name }}</strong>
            @if (r(); as r) {
              · {{ diaLargo(r.hoy) }}
            }
          </p>
          <p class="ayuda">Horas de Colombia; la semana va de lunes a domingo.</p>
        </div>
        <button mat-stroked-button type="button" (click)="cargar()" [disabled]="estado() === 'cargando'">
          <mat-icon aria-hidden="true">refresh</mat-icon>
          Actualizar
        </button>
      </div>

      @switch (estado()) {
        @case ('cargando') {
          <app-estado tipo="cargando" titulo="Cargando tu resumen…" />
        }
        @case ('error') {
          <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="cargar()" />
        }
        @default {
          @if (r(); as r) {
            <section class="tarjetas" aria-label="Cifras principales">
              @for (t of tarjetas(); track t.titulo) {
                <article [class]="'tarjeta cifra cifra--' + t.tono">
                  <span class="cifra__icono" aria-hidden="true"><mat-icon>{{ t.icono }}</mat-icon></span>
                  <h2 class="cifra__titulo">{{ t.titulo }}</h2>
                  <p class="cifra__valor">{{ t.valor }}</p>
                  @if (t.comparacion; as c) {
                    <p class="cifra__nota pastilla">
                      <mat-icon aria-hidden="true">{{ c.icono }}</mat-icon>
                      <span aria-hidden="true">{{ c.corto }}</span>
                      <span class="solo-lectores">{{ c.texto }}</span>
                    </p>
                  } @else {
                    <p class="cifra__nota pastilla">{{ t.nota }}</p>
                  }
                </article>
              }
            </section>

            <section class="tarjeta hero" aria-labelledby="t-proxima">
              <mat-icon class="hero__fondo" aria-hidden="true">schedule</mat-icon>
              @if (r.proxima; as p) {
                <div class="hero__cuando">
                  <h2 id="t-proxima">Próxima cita</h2>
                  <p class="hero__hora">{{ hora(p.starts_at) }} – {{ hora(p.ends_at) }}</p>
                  <p class="hero__fecha">{{ fechaLarga(p.starts_at) }}</p>
                  @if (falta(p); as f) {
                    <span class="hero__falta">{{ f }}</span>
                  }
                </div>
                <div class="hero__paciente">
                  <p class="hero__nombre">{{ p.patient_first_names }} {{ p.patient_last_names }}</p>
                  <p class="hero__detalle">{{ p.specialty_name }}</p>
                  <div class="acciones">
                    @if (p.patient_phone) {
                      <a class="btn-hero" [href]="'tel:' + p.patient_phone" [attr.aria-label]="'Llamar al ' + p.patient_phone">
                        <mat-icon aria-hidden="true">call</mat-icon>
                        {{ p.patient_phone }}
                      </a>
                    }
                    <button class="btn-hero btn-hero--lleno" type="button" (click)="ver(p)">Ver detalle</button>
                  </div>
                </div>
              } @else {
                <div class="hero__vacio">
                  <h2 id="t-proxima">Próxima cita</h2>
                  <p class="hero__nombre">No tienes citas próximas</p>
                  <p class="hero__detalle">Cuando la administración agende una, aparecerá aquí.</p>
                </div>
              }
            </section>

            <div class="rejilla">
              <section class="tarjeta tarjeta--accion" aria-labelledby="t-cerrar">
                <h2 id="t-cerrar">Citas por cerrar <span class="contador">{{ r.por_cerrar }}</span></h2>
                <p class="ayuda">Citas que ya pasaron y aún no tienen «Asistió» o «No asistió».</p>
                @if (r.por_cerrar === 0) {
                  <div class="vacio vacio--bien">
                    <span class="vacio__icono" aria-hidden="true"><mat-icon>task_alt</mat-icon></span>
                    <p>Todo al día.</p>
                  </div>
                } @else {
                  <ul class="citas">
                    @for (c of r.por_cerrar_lista; track c.id) {
                      <li>
                        <span class="citas__hora">{{ fechaCorta(c.starts_at) }} · {{ hora(c.starts_at) }}</span>
                        <span class="citas__nombre">{{ c.patient_first_names }} {{ c.patient_last_names }}</span>
                        <button mat-stroked-button type="button" (click)="ver(c)" [attr.aria-label]="'Registrar asistencia de ' + c.patient_first_names + ' ' + c.patient_last_names">Registrar</button>
                      </li>
                    }
                  </ul>
                  @if (r.por_cerrar > r.por_cerrar_lista.length) {
                    <p class="ayuda">Se muestran las {{ r.por_cerrar_lista.length }} más recientes. Las demás están en <a routerLink="/mi-agenda">Mi agenda</a>.</p>
                  }
                }
              </section>

              <section class="tarjeta tarjeta--accion" aria-labelledby="t-hoy">
                <h2 id="t-hoy">Hoy <span class="contador">{{ r.citas_de_hoy.length }}</span></h2>
                @if (r.citas_de_hoy.length === 0) {
                  <div class="vacio">
                    <span class="vacio__icono" aria-hidden="true"><mat-icon>event_available</mat-icon></span>
                    <p>No tienes citas hoy.</p>
                  </div>
                } @else {
                  <ul class="citas">
                    @for (c of r.citas_de_hoy; track c.id) {
                      <li>
                        <span class="citas__hora">{{ hora(c.starts_at) }}</span>
                        <span class="citas__nombre">
                          {{ c.patient_first_names }} {{ c.patient_last_names }}
                          <span class="chip" [class]="'chip chip--' + c.status">{{ etiqueta[c.status] }}</span>
                        </span>
                        <button mat-stroked-button type="button" (click)="ver(c)" [attr.aria-label]="'Ver detalle de la cita de ' + c.patient_first_names + ' ' + c.patient_last_names">Ver</button>
                      </li>
                    }
                  </ul>
                }
              </section>
            </div>

            <div class="rejilla rejilla--graficos">
              <section class="tarjeta" aria-labelledby="t-semana">
                <h2 id="t-semana">Citas por día de esta semana</h2>
                <div class="barras" aria-hidden="true">
                  @for (d of semana(); track d.fecha) {
                    <div class="barras__col" [class.barras__col--hoy]="d.esHoy">
                      <span class="barras__valor">{{ d.total }}</span>
                      <div class="barras__pista">
                        <div class="barras__barra" [style.height.%]="d.alto"></div>
                      </div>
                      <span class="barras__dia">{{ d.etiqueta }}</span>
                    </div>
                  }
                </div>
                <table class="solo-lectores">
                  <caption>Citas por día de esta semana, sin canceladas</caption>
                  <tbody>
                    @for (d of semana(); track d.fecha) {
                      <tr><th scope="row">{{ d.largo }}{{ d.esHoy ? ' (hoy)' : '' }}</th><td>{{ d.total }}</td></tr>
                    }
                  </tbody>
                </table>
              </section>

              <section class="tarjeta" aria-labelledby="t-estados">
                <h2 id="t-estados">Estado de las citas del mes</h2>
                @if (totalMes() === 0) {
                  <div class="vacio">
                    <span class="vacio__icono" aria-hidden="true"><mat-icon>insights</mat-icon></span>
                    <p>No tienes citas este mes.</p>
                  </div>
                } @else {
                  <ul class="estados">
                    @for (e of estados(); track e.estado) {
                      <li>
                        <span class="estados__nombre"><span class="punto" [style.background]="e.color" aria-hidden="true"></span>{{ e.etiqueta }}</span>
                        <span class="estados__cifra">{{ e.total }} <span class="estados__pct">({{ e.porcentaje }})</span></span>
                        <span class="estados__pista" aria-hidden="true"><span class="estados__barra" [style.width.%]="e.ancho" [style.background]="e.color"></span></span>
                      </li>
                    }
                  </ul>
                }
              </section>
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    h2 {
      font-size: 1.1rem;
      margin: 0 0 12px;
    }
    p {
      margin: 0 0 4px;
    }
    .saludo {
      margin-top: 4px;
      font-size: 1.1rem;
    }

    /* ---------- Tarjetas de cifras ---------- */
    .tarjetas {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
    }
    .cifra {
      --tono: #1f5aa6;
      --tono-fondo: #e4edf9;
      --tono-texto: #0f3a70;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 24px;
    }
    .cifra::before {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: 5px;
      background: var(--tono);
    }
    .cifra--verde {
      --tono: #0b8070;
      --tono-fondo: #ddf3ef;
      --tono-texto: #075a4f;
    }
    .cifra--violeta {
      --tono: #6a4bbd;
      --tono-fondo: #ede8fa;
      --tono-texto: #43298a;
    }
    .cifra--rojo {
      --tono: #b8392b;
      --tono-fondo: #fbe5e2;
      --tono-texto: #8f2419;
    }
    .cifra--ambar {
      --tono: #f2b01e;
      --tono-fondo: #fff1cc;
      --tono-texto: #6b4a00;
    }
    .cifra__icono {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      margin-bottom: 4px;
      border-radius: 50%;
      background: var(--tono-fondo);
      color: var(--tono-texto);
      box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.06);
    }
    .cifra__titulo {
      margin: 0;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--app-suave);
    }
    .cifra__valor {
      margin: 0;
      font-size: 2.75rem;
      font-weight: 800;
      line-height: 1.05;
      font-variant-numeric: tabular-nums;
      color: var(--app-texto);
    }
    .pastilla {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      align-self: flex-start;
      margin: 6px 0 0;
      padding: 3px 10px 3px 6px;
      border-radius: 999px;
      background: var(--tono-fondo);
      color: var(--tono-texto);
      font-size: 0.85rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .pastilla mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .cifra__nota:not(:has(mat-icon)) {
      padding-left: 10px;
    }

    /* ---------- Próxima cita (protagonista) ---------- */
    .hero {
      position: relative;
      overflow: hidden;
      display: flex;
      flex-wrap: wrap;
      gap: 16px 40px;
      padding: 28px;
      color: #fff;
      border: 0;
      background: linear-gradient(135deg, #2a6cc0 0%, #1f5aa6 45%, #0f3a70 100%);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.22),
        0 4px 8px rgba(15, 58, 112, 0.18),
        0 18px 36px rgba(15, 58, 112, 0.28);
    }
    .hero__fondo {
      position: absolute;
      right: -24px;
      bottom: -40px;
      width: 220px;
      height: 220px;
      font-size: 220px;
      color: rgba(255, 255, 255, 0.08);
      pointer-events: none;
    }
    .hero h2 {
      margin: 0 0 4px;
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #dbe7f7;
    }
    .hero__cuando,
    .hero__paciente,
    .hero__vacio {
      position: relative;
      z-index: 1;
    }
    .hero__hora {
      margin: 0;
      font-size: clamp(2rem, 5vw, 2.8rem);
      font-weight: 800;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .hero__fecha,
    .hero__detalle {
      color: #e4edf9;
    }
    .hero__falta {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 14px;
      border-radius: 999px;
      background: var(--app-acento);
      color: #1b2a41;
      font-weight: 800;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    }
    .hero__paciente {
      flex: 1 1 260px;
      align-self: center;
    }
    .hero__nombre {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 800;
      line-height: 1.2;
    }
    .hero .acciones {
      margin-top: 14px;
    }
    .btn-hero {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 0 20px;
      border: 2px solid rgba(255, 255, 255, 0.85);
      border-radius: 999px;
      background: transparent;
      color: #fff;
      font: inherit;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    .btn-hero:hover {
      background: rgba(255, 255, 255, 0.14);
    }
    .btn-hero--lleno {
      background: var(--app-acento);
      border-color: var(--app-acento);
      color: #1b2a41;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    }
    .btn-hero--lleno:hover {
      background: #ffc23d;
    }
    .btn-hero:focus-visible {
      outline: 3px solid #fff;
      outline-offset: 3px;
    }

    /* ---------- Rejillas y listas ---------- */
    .rejilla {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      align-items: start;
    }
    .rejilla--graficos {
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    }
    .contador {
      display: inline-block;
      min-width: 30px;
      padding: 0 10px;
      margin-left: 6px;
      border-radius: 999px;
      background: #e4edf9;
      color: #0f3a70;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .vacio {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 16px 0 8px;
      color: var(--app-suave);
      font-weight: 600;
    }
    .vacio p {
      margin: 0;
    }
    .vacio__icono {
      display: grid;
      place-items: center;
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: #e4edf9;
      color: #1f5aa6;
      box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.05);
    }
    .vacio__icono mat-icon {
      width: 40px;
      height: 40px;
      font-size: 40px;
    }
    .vacio--bien {
      color: #14603f;
    }
    .vacio--bien .vacio__icono {
      background: #ddf3e6;
      color: #14603f;
    }
    .citas {
      list-style: none;
      margin: 8px 0 0;
      padding: 0;
    }
    .citas li {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-top: 1px solid var(--app-borde-suave);
    }
    .citas__hora {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .citas__nombre {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .citas__nombre .chip {
      margin-left: 6px;
    }

    /* ---------- Barras por día (una serie; extremo redondeado de 4 px anclado a la base) ---------- */
    .barras {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
      align-items: end;
      height: 210px;
      padding-top: 8px;
    }
    .barras__col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      height: 100%;
    }
    .barras__pista {
      flex: 1;
      width: 100%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      border-bottom: 1px solid var(--app-borde);
    }
    .barras__barra {
      width: min(38px, 70%);
      min-height: 3px;
      background: linear-gradient(180deg, #4c8ad8 0%, #1f5aa6 100%);
      border-radius: 6px 6px 0 0;
      box-shadow: 0 3px 8px rgba(31, 90, 166, 0.28);
    }
    .barras__col--hoy .barras__barra {
      background: linear-gradient(180deg, #ffcb5c 0%, #e8a413 100%);
      box-shadow:
        inset 0 0 0 1px #a86f00,
        0 3px 8px rgba(168, 111, 0, 0.3);
    }
    .barras__valor {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--app-texto);
    }
    .barras__dia {
      font-size: 0.85rem;
      color: var(--app-suave);
    }
    .barras__col--hoy .barras__dia {
      font-weight: 800;
      color: var(--app-texto);
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    /* ---------- Estados del mes (cada fila lleva nombre y cifra: el color nunca es la única pista) ---------- */
    .estados {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .estados li {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px 12px;
    }
    .estados__nombre {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }
    .estados__cifra {
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .estados__pct {
      font-weight: 600;
      color: var(--app-suave);
    }
    .estados__pista {
      grid-column: 1 / -1;
      height: 14px;
      background: #eef2f8;
      border-radius: 999px;
      overflow: hidden;
      box-shadow: inset 0 1px 3px rgba(16, 42, 84, 0.12);
    }
    .estados__barra {
      display: block;
      height: 100%;
      border-radius: 999px;
      box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.12);
    }
    .punto {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex: none;
    }
  `,
})
export class Panel {
  private readonly api = inject(AgendaApi);
  private readonly dialog = inject(MatDialog);
  protected readonly auth = inject(AuthService);

  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly mensajeError = signal('');
  protected readonly r = signal<ResumenEspecialista | null>(null);
  private readonly ahora = signal(new Date());

  protected readonly etiqueta = ETIQUETA_ESTADO;
  protected readonly hora = horaBogota;
  protected readonly fechaLarga = fechaLargaBogota;
  protected readonly fechaCorta = diaMesBogota;

  protected readonly saludo = computed(() => saludoDe(horaDelDiaBogota(this.ahora())));

  /** «jueves, 29 de octubre» → «Jueves, 29 de octubre». */
  protected diaLargo(fecha: string): string {
    const t = diaSemanaLargo(fecha);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  protected readonly tarjetas = computed<Tarjeta[]>(() => {
    const r = this.r();
    if (!r) return [];
    return [
      { titulo: 'Citas hoy', valor: `${r.citas_hoy}`, icono: 'today', tono: 'azul', comparacion: comparar(r.citas_hoy, r.citas_ayer, 'ayer'), nota: '' },
      {
        titulo: 'Citas esta semana',
        valor: `${r.citas_semana}`,
        icono: 'date_range',
        tono: 'verde',
        comparacion: comparar(r.citas_semana, r.citas_semana_anterior, 'la semana anterior', 'sem. anterior'),
        nota: '',
      },
      {
        titulo: 'Citas este mes',
        valor: `${r.citas_mes}`,
        icono: 'calendar_month',
        tono: 'violeta',
        comparacion: comparar(r.citas_mes, r.citas_mes_anterior, 'el mes anterior', 'mes anterior'),
        nota: '',
      },
      {
        titulo: 'Canceladas este mes',
        valor: `${r.canceladas_mes}`,
        icono: 'event_busy',
        tono: 'rojo',
        comparacion: comparar(r.canceladas_mes, r.canceladas_mes_anterior, 'el mes anterior', 'mes anterior'),
        nota: '',
      },
      {
        titulo: 'Inasistencia del mes',
        valor: porcentaje(r.inasistencia_mes),
        icono: 'person_off',
        tono: 'ambar',
        comparacion: null,
        nota: r.inasistencia_mes === null ? 'Aún no hay citas atendidas este mes' : `Mes anterior: ${r.inasistencia_mes_anterior === null ? 'sin datos' : porcentaje(r.inasistencia_mes_anterior)}`,
      },
    ];
  });

  protected readonly semana = computed(() => {
    const r = this.r();
    if (!r) return [];
    const max = Math.max(1, ...r.por_dia_semana.map((d) => d.total));
    return r.por_dia_semana.map((d) => ({
      fecha: d.fecha,
      total: d.total,
      alto: (d.total / max) * 100,
      etiqueta: diaSemanaCorto(d.fecha),
      largo: diaSemanaLargo(d.fecha),
      esHoy: d.fecha === r.hoy,
    }));
  });

  protected readonly totalMes = computed(() => {
    const e = this.r()?.estados_mes;
    return e ? ORDEN_ESTADOS.reduce((s, k) => s + e[k], 0) : 0;
  });

  protected readonly estados = computed(() => {
    const e = this.r()?.estados_mes;
    const total = this.totalMes();
    if (!e || total === 0) return [];
    return ORDEN_ESTADOS.map((k) => ({
      estado: k,
      etiqueta: ETIQUETA_ESTADO[k],
      total: e[k],
      porcentaje: porcentaje(e[k] / total),
      ancho: (e[k] / total) * 100,
      color: COLOR_ESTADO[k],
    }));
  });

  constructor() {
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.estado.set('cargando');
    try {
      this.r.set(await this.api.miDashboard());
      this.ahora.set(new Date());
      this.estado.set('listo');
    } catch (e) {
      this.mensajeError.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }

  protected falta(c: CitaEspecialista): string | null {
    return cuantoFalta(c.starts_at, this.ahora());
  }

  protected async ver(c: CitaEspecialista): Promise<void> {
    const resultado = await firstValueFrom(this.dialog.open(DetalleCita, { data: aDetalle(c), width: '420px' }).afterClosed());
    if (resultado === 'actualizada') await this.cargar(); // la cita cambió: las cifras se vuelven a pedir al servidor
  }
}
