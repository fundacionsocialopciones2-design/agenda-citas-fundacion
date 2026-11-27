import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { ResumenInicio } from '../../core/models';
import { Inicio } from './inicio';

const RESUMEN: ResumenInicio = {
  hoy: '2026-11-26',
  urgencias: { total: 2, mas_antigua: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  citas_pendientes: { total: 1, mas_antigua: new Date().toISOString() },
  inscripciones: { total: 4, mas_antigua: new Date().toISOString() },
  asesorias: { total: 0, mas_antigua: null },
  citas_hoy: { total: 3, por_atender: 2 },
};

async function renderizar(inicio = vi.fn().mockResolvedValue(RESUMEN)) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AgendaApi, useValue: { inicio } }] });
  const fixture = TestBed.createComponent(Inicio);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('Inicio (administrador)', () => {
  it('muestra las cinco cifras con enlace a su pestaña ya filtrada', async () => {
    const html = await renderizar();
    const tarjetas = Array.from(html.querySelectorAll('a.cifra'));
    expect(tarjetas.map((a) => a.getAttribute('href'))).toEqual([
      '/admin/urgencias',
      '/admin/agenda?dia=2026-11-26',
      '/admin/agenda-pendiente?estado=pendiente',
      '/admin/cursos?estado=pendiente',
      '/admin/asesorias?estado=pendiente',
    ]);
    expect(tarjetas.map((a) => a.querySelector('.cifra__total')?.textContent?.trim())).toEqual(['2', '3', '1', '4', '0']);
    expect(html.textContent).toContain('Jueves');
  });

  it('resalta las urgencias sin atender y dice cuánto lleva la más antigua', async () => {
    const html = await renderizar();
    const [urgencias, , , , asesorias] = Array.from(html.querySelectorAll('a.cifra'));
    expect(urgencias.classList).toContain('cifra--alerta');
    expect(urgencias.textContent).toContain('La más antigua: hace 3 días');
    expect(asesorias.textContent).toContain('Todo al día');
    expect(asesorias.classList).not.toContain('cifra--alerta');
  });

  it('si falla la consulta muestra el error sin texto crudo', async () => {
    const html = await renderizar(vi.fn().mockRejectedValue(new Error('sin red')));
    expect(html.querySelector('[role="alert"]')).not.toBeNull();
    expect(html.textContent).not.toContain('sin red');
  });
});
