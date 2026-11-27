import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { CitaPendiente, ServicioCita } from '../../core/models';
import { AgendaPendiente } from './agenda-pendiente';

const servicio = (extra: Partial<ServicioCita>): ServicioCita => ({
  servicio_id: 'sal_fono',
  titulo: 'Fonoaudiología',
  grupo: null,
  activo: true,
  agenda_en_linea: false,
  solicitudes: 0,
  pendientes: 0,
  ...extra,
});

// Ordenado como lo devuelve la base de datos: primero sin agenda en línea.
const CATALOGO: ServicioCita[] = [
  servicio({ servicio_id: 'sal_fisio', titulo: 'Fisioterapia y rehabilitación', solicitudes: 1, pendientes: 0 }),
  servicio({ solicitudes: 2, pendientes: 2 }),
  servicio({ servicio_id: 'sal_optometria', titulo: 'Optometría y examen visual', solicitudes: 1, pendientes: 1 }),
  servicio({ servicio_id: '__sin_servicio', titulo: 'Sin servicio del menú', activo: false, solicitudes: 1, pendientes: 1 }),
  servicio({ servicio_id: 'sal_mental', titulo: 'Salud mental y psicología', agenda_en_linea: true }),
  servicio({ servicio_id: 'odo_periodoncia', titulo: 'Periodoncia', grupo: 'Odontología', agenda_en_linea: true }),
];

const cita = (extra: Partial<CitaPendiente> = {}): CitaPendiente => ({
  id: 1,
  creado: '2026-11-25T15:00:00Z',
  servicio_id: 'sal_fono',
  servicio: 'Fonoaudiología',
  grupo: null,
  nombre_completo: 'Ana Prueba',
  tipo_documento: 'CC',
  numero_documento: '1000000001',
  telefono: '573001112233',
  telefono_contacto: null,
  correo: null,
  modalidad: 'En sede',
  direccion: null,
  detalle: null,
  preferencia: 'martes en la mañana',
  motivo: 'Sin agenda en línea',
  estado: 'pendiente',
  notas: null,
  autoriza_datos_at: '2026-11-25T15:00:00Z',
  ...extra,
});

async function renderizar(citas: CitaPendiente[] = [cita()], estadoInicial?: string) {
  const api = {
    serviciosCita: vi.fn().mockResolvedValue(CATALOGO),
    citasPendientes: vi.fn().mockResolvedValue(citas),
    cambiarEstadoCitaPendiente: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({ providers: [{ provide: AgendaApi, useValue: api }, { provide: MatSnackBar, useValue: { open: vi.fn() } }] });
  const fixture = TestBed.createComponent(AgendaPendiente);
  if (estadoInicial) fixture.componentRef.setInput('estado', estadoInicial);
  await fixture.whenStable();
  fixture.detectChanges();
  return { html: fixture.nativeElement as HTMLElement, api, fixture };
}

describe('AgendaPendiente (administrador)', () => {
  it('no muestra tarjetas de catálogo: solo filtros y lista', async () => {
    const { html } = await renderizar();
    expect(html.querySelector('.catalogo')).toBeNull();
    expect(html.querySelector('form')).not.toBeNull();
    expect(html.querySelector('table')).toBeNull();
    expect(html.querySelector('app-lista-detalle')).not.toBeNull();
  });

  it('al entrar trae todas las citas pendientes', async () => {
    const { html, api } = await renderizar();
    expect(api.citasPendientes).toHaveBeenCalledWith({ servicioId: '', estado: '', busqueda: '' });
    expect(html.querySelector('#t-pendientes')?.textContent).toContain('Todas las solicitudes de cita');
    const fila = html.querySelector('.fila-lista')!;
    expect(fila.textContent).toContain('Ana Prueba');
    expect(fila.textContent).toContain('Pide: martes en la mañana');
    const panel = html.querySelector('app-detalle-cita-pendiente')!;
    expect(panel.textContent).toContain('Sin agenda en línea');
  });

  it('al elegir un servicio en el filtro y buscar, filtra por él', async () => {
    const { html, api, fixture } = await renderizar();
    const select = html.querySelector<HTMLSelectElement>('#f-servicio')!;
    select.value = 'sal_fono';
    select.dispatchEvent(new Event('change'));
    html.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(api.citasPendientes).toHaveBeenLastCalledWith({ servicioId: 'sal_fono', estado: '', busqueda: '' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(html.querySelector('#t-pendientes')?.textContent).toContain('Solicitudes de cita de Fonoaudiología');
  });

  it('sin preferencia muestra «sin indicar»', async () => {
    const { html } = await renderizar([cita({ preferencia: null })]);
    expect(html.querySelector('.fila-lista')?.textContent).toContain('Pide: sin indicar');
  });

  it('sin citas muestra un mensaje vacío', async () => {
    const { html } = await renderizar([]);
    expect(html.textContent).toContain('No hay solicitudes de cita con estos filtros');
  });

  it('desde «Inicio» llega filtrada por el estado pedido', async () => {
    const { api } = await renderizar([cita()], 'pendiente');
    expect(api.citasPendientes).toHaveBeenCalledWith({ servicioId: '', estado: 'pendiente', busqueda: '' });
  });

  it('al guardar un estado en el panel vuelve a consultar sin quitar la lista', async () => {
    const { html, api, fixture } = await renderizar();
    const select = html.querySelector<HTMLSelectElement>('#d-estado')!;
    select.value = 'contactado';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    html.querySelector<HTMLFormElement>('app-detalle-cita-pendiente form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(api.citasPendientes).toHaveBeenCalledTimes(2));
    expect(api.cambiarEstadoCitaPendiente).toHaveBeenCalledWith(1, 'pendiente', 'contactado');
    expect(html.querySelector('app-lista-detalle')).not.toBeNull();
  });

});
