import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { CitaPendiente, ServicioCita } from '../../core/models';
import { AgendaPendiente } from './agenda-pendiente';
import { DetalleCitaPendiente } from './detalle-cita-pendiente';

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

async function renderizar(citas: CitaPendiente[] = [cita()], resultadoDetalle?: 'actualizada') {
  const api = { serviciosCita: vi.fn().mockResolvedValue(CATALOGO), citasPendientes: vi.fn().mockResolvedValue(citas) };
  const dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(resultadoDetalle) }) };
  TestBed.configureTestingModule({ providers: [{ provide: AgendaApi, useValue: api }, { provide: MatDialog, useValue: dialog }] });
  const fixture = TestBed.createComponent(AgendaPendiente);
  await fixture.whenStable();
  fixture.detectChanges();
  return { html: fixture.nativeElement as HTMLElement, api, dialog, fixture };
}

describe('AgendaPendiente (administrador)', () => {
  it('no muestra tarjetas de catálogo: solo filtros y tabla', async () => {
    const { html } = await renderizar();
    expect(html.querySelector('.catalogo')).toBeNull();
    expect(html.querySelector('form')).not.toBeNull();
    expect(html.querySelector('table')).not.toBeNull();
  });

  it('al entrar trae todas las citas pendientes', async () => {
    const { html, api } = await renderizar();
    expect(api.citasPendientes).toHaveBeenCalledWith({ servicioId: '', estado: '', busqueda: '' });
    expect(html.querySelector('#t-pendientes')?.textContent).toContain('Todas las solicitudes de cita');
    const fila = html.querySelector('tbody tr')!;
    expect(fila.textContent).toContain('Ana Prueba');
    expect(fila.querySelector('td[data-etiqueta="Día y hora que pidió"]')?.textContent?.trim()).toBe('martes en la mañana');
    expect(fila.querySelector('td[data-etiqueta="Servicio"]')?.textContent).toContain('Sin agenda en línea');
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

  it('sin preferencia muestra «Sin indicar»', async () => {
    const { html } = await renderizar([cita({ preferencia: null })]);
    expect(html.querySelector('td[data-etiqueta="Día y hora que pidió"]')?.textContent?.trim()).toBe('Sin indicar');
  });

  it('sin citas muestra un mensaje vacío', async () => {
    const { html } = await renderizar([]);
    expect(html.textContent).toContain('No hay solicitudes de cita con estos filtros');
  });

  it('recarga la lista si el estado cambió en el detalle', async () => {
    const { html, api } = await renderizar([cita()], 'actualizada');
    Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ver')!.click();
    await vi.waitFor(() => expect(api.citasPendientes).toHaveBeenCalledTimes(2));
  });

  it('no recarga si el detalle se cierra sin cambios', async () => {
    const { html, api, fixture } = await renderizar();
    Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ver')!.click();
    await fixture.whenStable();
    expect(api.citasPendientes).toHaveBeenCalledTimes(1);
  });

  it('«Ver» abre el detalle de la cita', async () => {
    const { html, dialog } = await renderizar();
    Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ver')!.click();
    expect(dialog.open).toHaveBeenCalledWith(DetalleCitaPendiente, expect.objectContaining({ data: expect.objectContaining({ nombre_completo: 'Ana Prueba' }) }));
  });
});
