import { BreakpointObserver } from '@angular/cdk/layout';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { ResumenUrgencias, Urgencia } from '../../core/models';
import { UrgenciasResumen } from '../../core/urgencias-resumen.service';
import { enlaceLlamada, enlaceWhatsApp } from './contacto';
import { Urgencias } from './urgencias';

const urgencia = (extra: Partial<Urgencia> = {}): Urgencia => ({
  id: 1,
  creado: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  nombre_completo: 'Ana Prueba',
  tipo_documento: 'CC',
  numero_documento: '1000000001',
  telefono: '573001112233',
  telefono_contacto: '3001234567',
  correo: null,
  modalidad: 'Atención a domicilio',
  direccion: 'Calle 1 # 2-3',
  detalle: 'Dolor fuerte de muela',
  estado: 'pendiente',
  notas: [],
  autoriza_datos_at: '2026-11-26T15:00:00Z',
  ...extra,
});

const DOS = [urgencia(), urgencia({ id: 2, nombre_completo: 'Beto Prueba', detalle: 'Golpe en la rodilla', modalidad: 'Voy a la sede', direccion: null })];

async function renderizar(lista: Urgencia[] = DOS, angosto = false) {
  const api = { urgencias: vi.fn().mockResolvedValue(lista), cambiarEstadoUrgencia: vi.fn().mockResolvedValue(undefined), agregarNotaUrgencia: vi.fn() };
  const resumen = signal<ResumenUrgencias | null>({ sin_atender: 2, en_gestion: 3, ultima_id: 2 });
  const cifras = { resumen, actualizar: vi.fn().mockResolvedValue(undefined) };
  TestBed.configureTestingModule({
    providers: [
      { provide: AgendaApi, useValue: api },
      { provide: UrgenciasResumen, useValue: cifras },
      { provide: MatSnackBar, useValue: { open: vi.fn() } },
      { provide: BreakpointObserver, useValue: { observe: () => of({ matches: angosto, breakpoints: {} }) } },
    ],
  });
  const fixture = TestBed.createComponent(Urgencias);
  const estabilizar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await estabilizar();
  const html = fixture.nativeElement as HTMLElement;
  const filas = () => Array.from(html.querySelectorAll<HTMLButtonElement>('.fila-lista'));
  const boton = (texto: string) => Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.replace(/\s+/g, ' ').trim().startsWith(texto))!;
  const panel = () => html.querySelector('app-detalle-urgencia');
  return { html, api, resumen, cifras, fixture, estabilizar, filas, boton, panel };
}

describe('Urgencias (administrador)', () => {
  it('muestra las pestañas con su cantidad y consulta las sin atender', async () => {
    const { api, boton } = await renderizar();
    expect(api.urgencias).toHaveBeenCalledWith({ vista: 'sin_atender', busqueda: '', atencion: '' });
    expect(boton('Sin atender').textContent).toContain('2');
    expect(boton('En gestión').textContent).toContain('3');
    expect(boton('Sin atender').getAttribute('aria-pressed')).toBe('true');
  });

  it('en pantalla ancha lista las urgencias y abre la primera al lado', async () => {
    const { filas, panel } = await renderizar();
    expect(filas()).toHaveLength(2);
    expect(filas()[0].textContent).toContain('hace 2 horas');
    expect(filas()[0].textContent).toContain('Atención a domicilio');
    expect(filas()[1].textContent).not.toContain('Atención a domicilio');
    expect(filas()[0].getAttribute('aria-current')).toBe('true');
    expect(panel()?.textContent).toContain('Calle 1 # 2-3');
    expect(panel()?.querySelector('a')?.getAttribute('href')).toBe('tel:3001234567');
  });

  it('al elegir otra urgencia el panel cambia y conserva la nota a medio escribir de cada una', async () => {
    const { filas, panel, estabilizar } = await renderizar();
    const nota = () => panel()!.querySelector<HTMLTextAreaElement>('#u-nota')!;
    nota().value = 'pendiente de llamar';
    nota().dispatchEvent(new Event('input'));
    filas()[1].click();
    await estabilizar();
    expect(panel()?.querySelector('h2')?.textContent).toContain('Beto Prueba');
    expect(nota().value).toBe('');
    filas()[0].click();
    await estabilizar();
    expect(nota().value).toBe('pendiente de llamar');
  });

  it('cambiar de pestaña consulta esa vista', async () => {
    const { api, boton } = await renderizar();
    boton('Historial').click();
    await vi.waitFor(() => expect(api.urgencias).toHaveBeenLastCalledWith({ vista: 'historial', busqueda: '', atencion: '' }));
  });

  it('filtra por tipo de atención y por nombre o documento', async () => {
    const { html, api, boton, estabilizar } = await renderizar();
    const select = html.querySelector<HTMLSelectElement>('#u-atencion')!;
    select.value = 'domicilio';
    select.dispatchEvent(new Event('change'));
    await estabilizar();
    expect(api.urgencias).toHaveBeenLastCalledWith({ vista: 'sin_atender', busqueda: '', atencion: 'domicilio' });
    const campo = html.querySelector<HTMLInputElement>('#u-buscar')!;
    campo.value = 'ana';
    campo.dispatchEvent(new Event('input'));
    boton('Buscar').click();
    await vi.waitFor(() => expect(api.urgencias).toHaveBeenLastCalledWith({ vista: 'sin_atender', busqueda: 'ana', atencion: 'domicilio' }));
  });

  it('se recarga sola cuando cambian las cifras, sin perder la urgencia abierta', async () => {
    const { api, resumen, filas, panel, estabilizar } = await renderizar();
    filas()[1].click();
    await estabilizar();
    resumen.set({ sin_atender: 3, en_gestion: 3, ultima_id: 3 });
    TestBed.tick();
    await estabilizar();
    expect(api.urgencias).toHaveBeenCalledTimes(2);
    expect(panel()?.querySelector('h2')?.textContent).toContain('Beto Prueba');
  });

  it('si la urgencia abierta sale de la pestaña, pasa a la primera que queda', async () => {
    const { api, panel, estabilizar } = await renderizar();
    api.urgencias.mockResolvedValue([DOS[1]]);
    const select = panel()!.querySelector<HTMLSelectElement>('#u-estado')!;
    select.value = 'contactado';
    select.dispatchEvent(new Event('change'));
    await estabilizar();
    panel()!.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => expect(api.urgencias).toHaveBeenCalledTimes(2));
    await estabilizar();
    expect(api.cambiarEstadoUrgencia).toHaveBeenCalledWith(1, 'pendiente', 'contactado');
    expect(panel()?.querySelector('h2')?.textContent).toContain('Beto Prueba');
  });

  it('en pantalla angosta muestra la lista y, al elegir, solo el detalle con «Volver»', async () => {
    const { filas, panel, boton, estabilizar } = await renderizar(DOS, true);
    expect(panel()).toBeNull();
    filas()[1].click();
    await estabilizar();
    expect(filas()).toHaveLength(0);
    expect(panel()?.textContent).toContain('Beto Prueba');
    boton('arrow_back').click();
    await estabilizar();
    expect(filas()).toHaveLength(2);
    expect(panel()).toBeNull();
  });

  it('sin urgencias muestra un mensaje vacío', async () => {
    const { html } = await renderizar([]);
    expect(html.textContent).toContain('No hay urgencias sin atender');
  });
});

describe('enlaces de contacto', () => {
  it('usa el WhatsApp para llamar si no hay teléfono de contacto', () => {
    expect(enlaceLlamada({ telefono: '573001112233', telefono_contacto: null })).toBe('tel:+573001112233');
  });
  it('conserva el indicativo y limpia espacios', () => {
    expect(enlaceLlamada({ telefono: '1', telefono_contacto: '+57 300 123 4567' })).toBe('tel:+573001234567');
    expect(enlaceWhatsApp({ telefono: '+57 300', telefono_contacto: null })).toBe('https://wa.me/57300');
  });
});
