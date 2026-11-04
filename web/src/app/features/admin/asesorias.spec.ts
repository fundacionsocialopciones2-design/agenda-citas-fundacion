import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { SolicitudAsesoria, TipoAsesoria } from '../../core/models';
import { Asesorias } from './asesorias';
import { DetalleSolicitud } from './detalle-solicitud';

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
  const api = { asesorias: vi.fn().mockResolvedValue(CATALOGO), solicitudesAsesoria: vi.fn().mockResolvedValue(solicitudes) };
  const dialog = { open: vi.fn() };
  TestBed.configureTestingModule({ providers: [{ provide: AgendaApi, useValue: api }, { provide: MatDialog, useValue: dialog }] });
  const fixture = TestBed.createComponent(Asesorias);
  await fixture.whenStable();
  fixture.detectChanges();
  return { html: fixture.nativeElement as HTMLElement, api, dialog, fixture };
}

describe('Asesorias (administrador)', () => {
  it('muestra las asesorías jurídicas y generales con sus solicitudes', async () => {
    const { html } = await renderizar();
    const categorias = Array.from(html.querySelectorAll('.catalogo-categoria h2')).map((h) => h.textContent!.replace(/\s+/g, ' ').trim());
    expect(categorias).toEqual(['Asesorías generales 1', 'Asesoría jurídica 2']);
    expect(html.textContent).toContain('Simposios y bienestar empresarial');
  });

  it('al entrar trae todas las solicitudes', async () => {
    const { html, api } = await renderizar();
    expect(api.solicitudesAsesoria).toHaveBeenCalledWith({ servicioId: '', categoriaId: '', estado: '', busqueda: '' });
    expect(html.querySelector('#t-solicitudes')?.textContent).toContain('Todas las solicitudes de asesoría');
    expect(html.querySelector('tbody tr')?.textContent).toContain('Ana Prueba');
  });

  it('al elegir un tipo del catálogo filtra por él y por su categoría', async () => {
    const { html, api, fixture } = await renderizar();
    const boton = Array.from(html.querySelectorAll<HTMLButtonElement>('button.catalogo-item')).find((b) => b.textContent?.includes('Derechos de petición'))!;
    boton.click();
    await vi.waitFor(() => expect(api.solicitudesAsesoria).toHaveBeenLastCalledWith({ servicioId: 'jur_peticion', categoriaId: 'juridica', estado: '', busqueda: '' }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(html.querySelector('#t-solicitudes')?.textContent).toContain('Solicitudes de Derechos de petición');
  });

  it('el filtro de estado ofrece los cinco estados de una solicitud', async () => {
    const { html } = await renderizar();
    const opciones = Array.from(html.querySelectorAll<HTMLOptionElement>('#f-est option')).map((o) => o.textContent?.trim());
    expect(opciones).toEqual(['Todos', 'Pendiente', 'Contactado', 'Agendada', 'Atendida', 'Cancelada']);
  });

  it('una solicitud sin documento no muestra un documento vacío', async () => {
    const { html } = await renderizar([solicitud({ tipo_documento: null, numero_documento: null })]);
    expect(html.querySelector('tbody td[data-etiqueta="Persona"]')?.textContent?.trim()).toBe('Ana Prueba');
  });

  it('sin solicitudes muestra un mensaje vacío', async () => {
    const { html } = await renderizar([]);
    expect(html.textContent).toContain('No hay solicitudes con estos filtros');
  });

  it('«Ver» abre el detalle de la solicitud', async () => {
    const { html, dialog } = await renderizar();
    Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ver')!.click();
    expect(dialog.open).toHaveBeenCalledWith(DetalleSolicitud, expect.objectContaining({ data: expect.objectContaining({ nombre_completo: 'Ana Prueba' }) }));
  });
});
