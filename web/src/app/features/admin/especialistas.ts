import { Component, computed, DOCUMENT, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AgendaApi } from '../../core/agenda.api';
import { AuthService } from '../../core/auth/auth.service';
import { ErrorConflicto, mensajeDeError } from '../../core/errores';
import { Especialidad, Especialista } from '../../core/models';
import { fechaHoraBogota } from '../../core/tiempo';
import { Confirmar, DatosConfirmar } from '../../shared/confirmar';
import { mostrarConflictos } from './conflictos';
import { DatosEnlace, EnlaceInvitacion } from './enlace-invitacion';
import { Estado } from '../../shared/estado';
import { FormularioEspecialista } from './formulario-especialista';

@Component({
  selector: 'app-especialistas',
  imports: [MatButtonModule, MatIconModule, Estado],
  template: `
    <div class="pagina">
      <div class="pagina-cabecera">
        <div>
          <h1>Especialistas</h1>
          <p>Crea especialistas, gestiona su acceso y desactívalos conservando su historial. A quien no tiene acceso puedes enviarle un enlace para que cree su usuario.</p>
        </div>
        <button mat-flat-button type="button" (click)="nuevo()" [disabled]="estado() !== 'listo'">
          <mat-icon aria-hidden="true">person_add</mat-icon>
          Nuevo especialista
        </button>
      </div>

      @switch (estado()) {
        @case ('cargando') {
          <app-estado tipo="cargando" titulo="Cargando especialistas…" />
        }
        @case ('error') {
          <app-estado tipo="error" [mensaje]="mensajeError()" (reintentar)="cargar()" />
        }
        @default {
          @if (lista().length === 0) {
            <app-estado icono="groups" titulo="Aún no hay especialistas" mensaje="Crea el primero con el botón «Nuevo especialista»." />
          } @else {
            <table class="tabla">
              <caption>{{ lista().length }} especialista(s) registrados</caption>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Correo de acceso</th>
                  <th scope="col">Especialidades</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (e of lista(); track e.id) {
                  <tr [class.inactivo]="!e.active">
                    <td data-etiqueta="Nombre"><strong>{{ e.full_name }}</strong></td>
                    <td data-etiqueta="Correo">
                      {{ e.profiles?.email || (e.profile_id ? 'Con acceso' : 'Sin acceso') }}
                      @if (!e.profile_id && invitacionDe(e); as vence) {
                        <br /><small class="ayuda">Enlace vigente hasta {{ fecha(vence) }}</small>
                      }
                    </td>
                    <td data-etiqueta="Especialidades">{{ especialidadesDe(e) }}</td>
                    <td data-etiqueta="Estado">
                      <span class="chip" [class.chip--activo]="e.active" [class.chip--inactivo]="!e.active">{{ e.active ? 'Activo' : 'Inactivo' }}</span>
                    </td>
                    <td data-etiqueta="Acciones">
                      <div class="acciones">
                        <button mat-stroked-button type="button" (click)="editar(e)" [attr.aria-label]="'Editar a ' + e.full_name">Editar</button>
                        @if (!e.profile_id && e.active) {
                          <button mat-flat-button type="button" [disabled]="generando() !== null" (click)="invitar(e)" [attr.aria-label]="'Generar enlace de acceso para ' + e.full_name">
                            {{ invitacionDe(e) ? 'Nuevo enlace' : 'Generar enlace de acceso' }}
                          </button>
                          @if (invitacionDe(e)) {
                            <button mat-button type="button" (click)="anular(e)" [attr.aria-label]="'Anular el enlace de ' + e.full_name">Anular enlace</button>
                          }
                        }
                        @if (e.profiles?.email && e.active) {
                          <button mat-button type="button" (click)="enviarEnlace(e)" [attr.aria-label]="'Enviar enlace de contraseña a ' + e.full_name">Enviar enlace</button>
                        }
                        <button mat-button type="button" (click)="alternar(e)" [attr.aria-label]="(e.active ? 'Desactivar a ' : 'Activar a ') + e.full_name">
                          {{ e.active ? 'Desactivar' : 'Activar' }}
                        </button>
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
export class Especialistas {
  private readonly api = inject(AgendaApi);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly aviso = inject(MatSnackBar);
  private readonly documento = inject(DOCUMENT);

  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly mensajeError = signal('');
  protected readonly lista = signal<Especialista[]>([]);
  private readonly especialidades = signal<Especialidad[]>([]);
  /** Fecha de vencimiento del enlace vigente de cada especialista. */
  private readonly invitaciones = signal(new Map<string, string>());
  /** Especialista cuyo enlace se está generando (evita crear dos con doble clic). */
  protected readonly generando = signal<string | null>(null);
  protected readonly fecha = fechaHoraBogota;
  private readonly nombres = computed(() => new Map(this.especialidades().map((e) => [e.id, e.name])));

  constructor() {
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.estado.set('cargando');
    try {
      const [lista, especialidades, invitaciones] = await Promise.all([this.api.especialistas(), this.api.especialidades(), this.api.invitaciones()]);
      this.invitaciones.set(new Map(invitaciones.map((i) => [i.specialist_id, i.expires_at])));
      this.lista.set(lista);
      this.especialidades.set(especialidades);
      this.estado.set('listo');
    } catch (e) {
      this.mensajeError.set(mensajeDeError(e));
      this.estado.set('error');
    }
  }

  protected especialidadesDe(e: Especialista): string {
    return e.specialist_specialties.map((s) => this.nombres().get(s.specialty_id) ?? '—').join(', ') || '—';
  }

  protected invitacionDe(e: Especialista): string | undefined {
    return this.invitaciones().get(e.id);
  }

  protected async invitar(e: Especialista): Promise<void> {
    if (this.generando()) return;
    this.generando.set(e.id);
    try {
      const { token, expires_at } = await this.api.crearInvitacion(e.id);
      // El token va después de «#»: el navegador no lo envía al servidor que sirve la página.
      const data: DatosEnlace = { nombre: e.full_name, enlace: `${this.documento.location.origin}/invitacion#${token}`, vence: expires_at };
      this.invitaciones.update((m) => new Map(m).set(e.id, expires_at));
      this.dialog.open(EnlaceInvitacion, { width: '560px', data });
    } catch (err) {
      this.aviso.open(mensajeDeError(err), 'Cerrar', { duration: 8000 });
      await this.cargar();
    } finally {
      this.generando.set(null);
    }
  }

  protected anular(e: Especialista): void {
    const datos: DatosConfirmar = {
      titulo: `¿Anular el enlace de ${e.full_name}?`,
      mensaje: 'El enlace que enviaste dejará de funcionar. Podrás generar otro cuando quieras.',
      confirmar: 'Anular enlace',
    };
    this.dialog
      .open(Confirmar, { data: datos })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) void this.aplicarAnulacion(e);
      });
  }

  private async aplicarAnulacion(e: Especialista): Promise<void> {
    try {
      await this.api.anularInvitacion(e.id);
      this.aviso.open('Enlace anulado.', 'Cerrar', { duration: 5000 });
    } catch (err) {
      this.aviso.open(mensajeDeError(err), 'Cerrar', { duration: 8000 });
    }
    await this.cargar();
  }

  private abrirFormulario(especialista: Especialista | null): void {
    this.dialog
      .open(FormularioEspecialista, { width: '520px', data: { especialidades: this.especialidades().filter((x) => x.active), especialista } })
      .afterClosed()
      .subscribe((guardado) => {
        if (guardado) {
          this.aviso.open(especialista ? 'Cambios guardados.' : 'Especialista creado. Se envió la invitación por correo.', 'Cerrar', { duration: 6000 });
          void this.cargar();
        }
      });
  }

  protected nuevo(): void {
    this.abrirFormulario(null);
  }

  protected editar(e: Especialista): void {
    this.abrirFormulario(e);
  }

  protected async enviarEnlace(e: Especialista): Promise<void> {
    const correo = e.profiles?.email;
    if (!correo) return;
    await this.auth.enviarRecuperacion(correo);
    this.aviso.open(`Se envió un enlace para crear una contraseña a ${correo}.`, 'Cerrar', { duration: 6000 });
  }

  protected alternar(e: Especialista): void {
    const desactivar = e.active;
    const datos: DatosConfirmar = desactivar
      ? {
          titulo: `¿Desactivar a ${e.full_name}?`,
          mensaje: 'Dejará de ofrecer cupos y no podrá iniciar sesión. Su historial de citas se conserva. Si tiene citas futuras, deberás resolverlas antes.',
          confirmar: 'Desactivar',
        }
      : { titulo: `¿Activar a ${e.full_name}?`, mensaje: 'Volverá a ofrecer cupos según su horario semanal y podrá iniciar sesión.', confirmar: 'Activar' };
    this.dialog
      .open(Confirmar, { data: datos })
      .afterClosed()
      .subscribe((ok) => {
        if (ok) void this.aplicarEstado(e, !desactivar);
      });
  }

  private async aplicarEstado(e: Especialista, activo: boolean): Promise<void> {
    try {
      await this.api.cambiarEstadoEspecialista(e.id, activo);
      this.aviso.open(activo ? 'Especialista activado.' : 'Especialista desactivado.', 'Cerrar', { duration: 5000 });
      await this.cargar();
    } catch (err) {
      if (err instanceof ErrorConflicto) {
        await mostrarConflictos(this.dialog, this.api, err, `${e.full_name} tiene citas futuras confirmadas.`);
      } else {
        this.aviso.open(mensajeDeError(err), 'Cerrar', { duration: 8000 });
      }
    }
  }
}
