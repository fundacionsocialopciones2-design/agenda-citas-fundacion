import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { SolicitudAsesoria, TipoAsesoria } from '../../core/models';
import { Asesorias } from './asesorias';
import { MatSnackBar } from '@angular/material/snack-bar';

const tipo = (extra: Partial<TipoAsesoria>): TipoAsesoria => ({
  servicio_id: 'jur_peticion',
  titulo: 'Derechos de petición',
  categoria_id: 'juridica',
  categoria: 'Asesoría jurídica',
  grupo: null,
  activo: true,
  solicitudes: 0,
  ...extra,
});

const CATALOGO: TipoAsesoria[] = [
  tipo({ servicio_id: 'as_contable', titulo: 'Asesorías contables', categoria_id: 'asesorias', categoria: 'Asesorías generales' }),
  tipo({ servicio_id: 'emp_estres', titulo: 'Manejo del estrés', categoria_id: 'asesorias', categoria: 'Asesorías generales', grupo: 'Simposios y bienestar empresarial', solicitudes: 1 }),
  tipo({ servicio_id: 'jur_consultoria', titulo: 'Consultoría legal general' }),
  tipo({ solicitudes: 2 }),
];

const solicitud = (extra: Partial<SolicitudAsesoria> = {}): SolicitudAsesoria => ({
  id: 1,
  creado: '2026-10-29T15:00:00Z',
  servicio_id: 'jur_peticion',
  servicio: 'Derechos de petición',
  categoria: 'Asesoría jurídica',
  nombre_completo: 'Ana Prueba',
  tipo_documento: 'CC',
  numero_documento: '1000000001',
  telefono: '573001112233',
  telefono_contacto: null,
  correo: null,
  modalidad: null,
  direccion: null,
  detalle: 'Necesito pedir mi historia laboral',
  preferencia: null,
  estado: 'pendiente',
  notas: null,
  autoriza_datos_at: '2026-10-29T15:00:00Z',
  ...extra,
});

async function renderizar(solicitudes: SolicitudAsesoria[] = [solicitud()]) {
  const api = {
    asesorias: vi.fn().mockResolvedValue(CATALOGO),
    solicitudesAsesoria: vi.fn().mockResolvedValue(solicitudes),
    conteoGestion: vi.fn().mockResolvedValue({ inscripciones: { por_confirmar: 3, confirmados: 2, cancelados: 1 }, asesorias: { por_confirmar: 4, confirmados: 5, cancelados: 0 } }),
    cambiarEstadoAsesoria: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({ providers: [{ provide: AgendaApi, useValue: api }, { provide: MatSnackBar, useValue: { open: vi.fn() } }] });
  const fixture = TestBed.createComponent(Asesorias);
  await fixture.whenStable();
  fixture.detectChanges();
  return { html: fixture.nativeElement as HTMLElement, api, fixture };
}

describe('Asesorias (administrador)', () => {
  it('no muestra tarjetas de catálogo: solo filtros y lista', async () => {
    const { html } = await renderizar();
    expect(html.querySelector('.catalogo')).toBeNull();
    expect(html.querySelector('form')).not.toBeNull();
    expect(html.querySelector('app-lista-detalle')).not.toBeNull();
  });

  it('al entrar trae todas las solicitudes', async () => {
    const { html, api } = await renderizar();
    expect(api.solicitudesAsesoria).toHaveBeenCalledWith({ vista: 'por_confirmar', servicioId: '', categoriaId: '', estado: '', busqueda: '' });
    expect(html.querySelector('#t-solicitudes')?.textContent).toContain('Solicitudes por confirmar');
    expect(html.querySelector('.fila-lista')?.textContent).toContain('Ana Prueba');
  });

  it('al elegir en el filtro y buscar, filtra por esa opción', async () => {
    const { html, api, fixture } = await renderizar();
    const select = html.querySelector<HTMLSelectElement>('#f-tipo')!;
    select.value = 'jur_peticion';
    select.dispatchEvent(new Event('change'));
    html.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await vi.waitFor(() => expect(api.solicitudesAsesoria).toHaveBeenLastCalledWith({ vista: 'por_confirmar', servicioId: 'jur_peticion', categoriaId: '', estado: '', busqueda: '' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(html.querySelector('#t-solicitudes')?.textContent).toContain('Solicitudes de Derechos de petición');
  });

  it('cada pestaña ofrece solo sus estados', async () => {
    const { html, api, fixture } = await renderizar();
    const opciones = () => Array.from(html.querySelectorAll<HTMLOptionElement>('#f-est option')).map((o) => o.textContent?.trim());
    expect(opciones()).toEqual(['Todos', 'Pendiente', 'Contactado']);
    html.querySelectorAll<HTMLButtonElement>('app-pestanas-gestion button')[1].click();
    await vi.waitFor(() => expect(api.solicitudesAsesoria).toHaveBeenLastCalledWith({ vista: 'confirmados', servicioId: '', categoriaId: '', estado: '', busqueda: '' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(opciones()).toEqual(['Todos', 'Agendada', 'Atendida']);
  });

  it('cambia el estado desde el panel', async () => {
    const { html, api, fixture } = await renderizar();
    const select = html.querySelector<HTMLSelectElement>('#g-estado')!;
    select.value = 'agendada';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    html.querySelector<HTMLFormElement>('app-gestion-estado form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(api.solicitudesAsesoria).toHaveBeenCalledTimes(2));
    expect(api.cambiarEstadoAsesoria).toHaveBeenCalledWith(1, 'pendiente', 'agendada');
  });

  it('una solicitud sin documento no muestra un documento vacío', async () => {
    const { html } = await renderizar([solicitud({ tipo_documento: null, numero_documento: null })]);
    const panel = html.querySelector('app-detalle-solicitud')!;
    expect(panel.querySelector('h2')?.textContent?.trim()).toBe('Ana Prueba');
    expect(panel.textContent).toContain('No registrado');
    expect(panel.textContent).not.toContain('null');
  });

  it('sin solicitudes muestra un mensaje vacío', async () => {
    const { html } = await renderizar([]);
    expect(html.textContent).toContain('No hay nada por confirmar');
  });

  it('muestra al lado el detalle de la primera, sin tablas ni ventanas', async () => {
    const { html } = await renderizar();
    expect(html.querySelector('table')).toBeNull();
    expect(html.querySelector('.fila-lista')?.getAttribute('aria-current')).toBe('true');
    expect(html.querySelector('app-detalle-solicitud h2')?.textContent).toContain('Ana Prueba');
  });

});
