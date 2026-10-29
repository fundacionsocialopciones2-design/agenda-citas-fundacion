import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { AuthService } from '../../core/auth/auth.service';
import { CitaEspecialista, ResumenEspecialista } from '../../core/models';
import { Panel } from './panel';

const cita = (extra: Partial<CitaEspecialista> = {}): CitaEspecialista => ({
  id: '1',
  starts_at: new Date(Date.now() + 30 * 60000).toISOString(),
  ends_at: new Date(Date.now() + 90 * 60000).toISOString(),
  status: 'confirmada',
  specialty_name: 'Odontología general',
  patient_first_names: 'Ana',
  patient_last_names: 'Prueba',
  patient_document_type: 'CC',
  patient_document_number: '1000000001',
  patient_phone: '3001234567',
  ...extra,
});

const resumen = (extra: Partial<ResumenEspecialista> = {}): ResumenEspecialista => ({
  hoy: '2026-10-28',
  semana_inicio: '2026-10-26',
  mes_inicio: '2026-10-01',
  citas_hoy: 3,
  citas_ayer: 1,
  citas_semana: 5,
  citas_semana_anterior: 5,
  citas_mes: 5,
  citas_mes_anterior: 7,
  canceladas_mes: 2,
  canceladas_mes_anterior: 0,
  inasistencia_mes: 0.3333,
  inasistencia_mes_anterior: 0.5,
  estados_mes: { confirmada: 2, asistida: 2, no_asistio: 1, cancelada: 2 },
  por_dia_semana: ['26', '27', '28', '29', '30', '31'].map((d, i) => ({ fecha: `2026-10-${d}`, total: [0, 1, 3, 0, 0, 0][i] })).concat({ fecha: '2026-11-01', total: 1 }),
  por_cerrar: 1,
  por_cerrar_lista: [cita({ id: 'p1', patient_first_names: 'Pedro' })],
  citas_de_hoy: [cita({ id: 'h1' })],
  proxima: cita({ id: 'h1' }),
  ...extra,
});

const autenticacion = { provide: AuthService, useValue: { perfil: signal({ full_name: 'Dra. Prueba' }) } };

async function renderizar(datos: ResumenEspecialista, resultadoDialogo: unknown = undefined) {
  const api = { miDashboard: vi.fn().mockResolvedValue(datos) };
  const dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(resultadoDialogo) }) };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), autenticacion, { provide: AgendaApi, useValue: api }, { provide: MatDialog, useValue: dialog }],
  });
  const fixture = TestBed.createComponent(Panel);
  await fixture.whenStable();
  fixture.detectChanges();
  return { html: fixture.nativeElement as HTMLElement, api, dialog, fixture };
}

describe('Panel (dashboard del especialista)', () => {
  it('muestra las cifras y comparaciones que llegan del servidor', async () => {
    const { html } = await renderizar(resumen());
    const tarjetas = Array.from(html.querySelectorAll('.cifra')).map((t) => ({
      titulo: t.querySelector('.cifra__titulo')?.textContent?.trim(),
      valor: t.querySelector('.cifra__valor')?.textContent?.trim(),
      nota: t.querySelector('.cifra__nota')?.textContent?.replace(/\s+/g, ' ').trim(),
    }));
    expect(tarjetas.map((t) => t.titulo)).toEqual(['Citas hoy', 'Citas esta semana', 'Citas este mes', 'Canceladas este mes', 'Inasistencia del mes']);
    expect(tarjetas.map((t) => t.valor?.replace(/\s/g, ''))).toEqual(['3', '5', '5', '2', '33,3%']);
    expect(tarjetas[0].nota).toContain('2 más que ayer');
    expect(tarjetas[1].nota).toContain('Igual que la semana anterior');
    expect(tarjetas[2].nota).toContain('2 menos que el mes anterior');
    expect(tarjetas[4].nota?.replace(/\s/g, '')).toBe('Mesanterior:50%');
  });

  it('saluda por el nombre y muestra la fecha del servidor', async () => {
    const { html } = await renderizar(resumen());
    const saludo = html.querySelector('.saludo')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(saludo).toMatch(/^(Buenos días|Buenas tardes|Buenas noches), Dra\. Prueba · Miércoles, 28 de octubre/);
  });

  it('la pastilla de comparación muestra la versión corta y deja la frase completa a los lectores de pantalla', async () => {
    const { html } = await renderizar(resumen());
    const pastilla = html.querySelector('.cifra__nota')!;
    expect(pastilla.querySelector('[aria-hidden="true"]:not(mat-icon)')?.textContent).toBe('+2 vs. ayer');
    expect(pastilla.querySelector('.solo-lectores')?.textContent).toBe('2 más que ayer');
  });

  it('muestra la próxima cita con su teléfono y las citas por cerrar', async () => {
    const { html } = await renderizar(resumen());
    expect(html.querySelector('a[href="tel:3001234567"]')).not.toBeNull();
    expect(html.textContent).toContain('En 30 min');
    expect(html.textContent).toContain('Pedro Prueba');
  });

  it('el gráfico semanal tiene su tabla equivalente para lectores de pantalla', async () => {
    const { html } = await renderizar(resumen());
    const filas = html.querySelectorAll('table.solo-lectores tbody tr');
    expect(filas.length).toBe(7);
    expect(filas[2].textContent).toContain('(hoy)');
    expect(filas[2].textContent).toContain('3');
  });

  it('sin citas resueltas, la inasistencia se muestra como «—» con una explicación', async () => {
    const { html } = await renderizar(resumen({ inasistencia_mes: null }));
    expect(html.textContent).toContain('—');
    expect(html.textContent).toContain('Aún no hay citas atendidas este mes');
  });

  it('sin pendientes indica «Todo al día»', async () => {
    const { html } = await renderizar(resumen({ por_cerrar: 0, por_cerrar_lista: [] }));
    expect(html.textContent).toContain('Todo al día');
  });

  it('si la cita cambia en el detalle, vuelve a pedir las cifras', async () => {
    const { html, api, fixture } = await renderizar(resumen(), 'actualizada');
    const boton = Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Registrar')!;
    boton.click();
    await vi.waitFor(() => expect(api.miDashboard).toHaveBeenCalledTimes(2));
    await fixture.whenStable();
  });

  it('si el servidor falla, muestra el error', async () => {
    const api = { miDashboard: vi.fn().mockRejectedValue(new Error('x')) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), autenticacion, { provide: AgendaApi, useValue: api }, { provide: MatDialog, useValue: {} }] });
    const fixture = TestBed.createComponent(Panel);
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
  });
});
