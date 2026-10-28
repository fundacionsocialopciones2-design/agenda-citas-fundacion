import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { CitaEspecialista } from '../../core/models';
import { ListaCitas } from './lista-citas';

const DIA = 86_400_000;

function cita(id: string, nombre: string, desdeAhoraMs: number, status: CitaEspecialista['status'] = 'confirmada'): CitaEspecialista {
  const inicio = Date.now() + desdeAhoraMs;
  return {
    id,
    starts_at: new Date(inicio).toISOString(),
    ends_at: new Date(inicio + 3_600_000).toISOString(),
    status,
    specialty_name: 'Cirugía maxilofacial',
    patient_first_names: nombre,
    patient_last_names: 'Prueba',
    patient_document_type: 'CC',
    patient_document_number: '1000000001',
    patient_phone: null,
  };
}

describe('ListaCitas', () => {
  const miAgenda = vi.fn();

  async function renderizar() {
    const fixture = TestBed.createComponent(ListaCitas);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    miAgenda.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: AgendaApi, useValue: { miAgenda } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });
  });

  it('muestra todas las citas próximas en una sola lista, de la más cercana a la más lejana', async () => {
    miAgenda.mockResolvedValue([
      cita('3', 'Tercera', 30 * DIA),
      cita('1', 'Primera', 2 * DIA),
      cita('2', 'Segunda', 10 * DIA),
    ]);
    const html = await renderizar();
    const filas = [...html.querySelectorAll('tbody tr')].map((f) => f.textContent ?? '');
    expect(filas).toHaveLength(3);
    expect(filas[0]).toContain('Primera');
    expect(filas[1]).toContain('Segunda');
    expect(filas[2]).toContain('Tercera');
    expect(html.textContent).toContain('3 citas agendadas');
  });

  it('marca la primera como «Próxima» y no muestra canceladas ni pasadas', async () => {
    miAgenda.mockResolvedValue([
      cita('a', 'Cancelada', 3 * DIA, 'cancelada'),
      cita('b', 'Pasada', -5 * DIA),
      cita('c', 'Vigente', 4 * DIA),
    ]);
    const html = await renderizar();
    const filas = html.querySelectorAll('tbody tr');
    expect(filas).toHaveLength(1);
    expect(filas[0].textContent).toContain('Vigente');
    expect(filas[0].textContent).toContain('Próxima');
  });

  it('muestra un estado vacío claro cuando no hay citas', async () => {
    miAgenda.mockResolvedValue([]);
    const html = await renderizar();
    expect(html.querySelector('table')).toBeNull();
    expect(html.textContent).toContain('No tienes citas próximas');
  });

  it('muestra el error con opción de reintentar si falla la carga', async () => {
    miAgenda.mockRejectedValue(new Error('sin conexión'));
    const html = await renderizar();
    expect(html.querySelector('[role="alert"]')).not.toBeNull();
    expect(html.textContent).toContain('Reintentar');
  });
});
