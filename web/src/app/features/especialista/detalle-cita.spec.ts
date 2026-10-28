import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { CitaEspecialista } from '../../core/models';
import { aDetalle, DatosDetalle, DetalleCita } from './detalle-cita';

const HORA = 3600000;
const enHoras = (h: number): string => new Date(Date.now() + h * HORA).toISOString();

const cita = (extra: Partial<CitaEspecialista> = {}): CitaEspecialista => ({
  id: '1',
  starts_at: enHoras(48),
  ends_at: enHoras(49),
  status: 'confirmada',
  specialty_name: 'Cirugía maxilofacial',
  patient_first_names: 'Paciente',
  patient_last_names: 'Prueba',
  patient_document_type: 'CC',
  patient_document_number: '1000000001',
  patient_phone: '3001234567',
  ...extra,
});

function renderizar(datos: DatosDetalle, confirmaDialogo: unknown = true) {
  const api = { registrarAsistenciaPropia: vi.fn().mockResolvedValue(undefined), cancelarCitaPropia: vi.fn() };
  const ref = { close: vi.fn() };
  const aviso = { open: vi.fn() };
  const dialog = { open: vi.fn().mockReturnValue({ afterClosed: () => of(confirmaDialogo) }) };
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: datos },
      { provide: MatDialogRef, useValue: ref },
      { provide: AgendaApi, useValue: api },
      { provide: MatSnackBar, useValue: aviso },
    ],
  });
  // MatDialogModule (importado por el componente) vuelve a proveer MatDialog: se sustituye a nivel de componente.
  TestBed.overrideComponent(DetalleCita, { add: { providers: [{ provide: MatDialog, useValue: dialog }] } });
  const fixture = TestBed.createComponent(DetalleCita);
  fixture.detectChanges();
  const html = fixture.nativeElement as HTMLElement;
  const boton = (texto: string): HTMLButtonElement | undefined => Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.trim() === texto);
  return { html, api, ref, aviso, dialog, fixture, boton };
}

describe('DetalleCita', () => {
  it('muestra el teléfono como enlace para llamar', () => {
    const { html } = renderizar(aDetalle(cita()));
    const enlace = html.querySelector('a[href^="tel:"]');
    expect(enlace?.getAttribute('href')).toBe('tel:3001234567');
    expect(enlace?.textContent).toContain('3001234567');
  });

  it('indica «No registrado» si el paciente no tiene teléfono', () => {
    const { html } = renderizar(aDetalle(cita({ patient_phone: null })));
    expect(html.querySelector('a[href^="tel:"]')).toBeNull();
    expect(html.textContent).toContain('No registrado');
  });

  it('muestra el teléfono en cualquier estado de la cita (también asistida)', () => {
    const { html } = renderizar(aDetalle(cita({ status: 'asistida' })));
    expect(html.textContent).toContain('Teléfono');
    expect(html.querySelector('a[href^="tel:"]')?.getAttribute('href')).toBe('tel:3001234567');
  });

  it('en una cita futura ofrece cancelar, pero no registrar asistencia', () => {
    const { boton } = renderizar(aDetalle(cita()));
    expect(boton('Cancelar cita')).toBeDefined();
    expect(boton('Asistió')).toBeUndefined();
    expect(boton('No asistió')).toBeUndefined();
  });

  it('en una cita que ya empezó ofrece asistencia, pero no cancelar', () => {
    const { boton } = renderizar(aDetalle(cita({ starts_at: enHoras(-2), ends_at: enHoras(-1) })));
    expect(boton('Asistió')).toBeDefined();
    expect(boton('No asistió')).toBeDefined();
    expect(boton('Cancelar cita')).toBeUndefined();
  });

  it('en una cita ya resuelta o cancelada no ofrece ninguna acción', () => {
    for (const status of ['asistida', 'no_asistio', 'cancelada'] as const) {
      TestBed.resetTestingModule();
      const { boton } = renderizar(aDetalle(cita({ status, starts_at: enHoras(-2), ends_at: enHoras(-1) })));
      expect(boton('Asistió')).toBeUndefined();
      expect(boton('Cancelar cita')).toBeUndefined();
    }
  });

  it('registra la asistencia tras confirmar y cierra avisando que la cita cambió', async () => {
    const { boton, api, ref, aviso } = renderizar(aDetalle(cita({ id: 'abc', starts_at: enHoras(-2), ends_at: enHoras(-1) })));
    boton('Asistió')!.click();
    await vi.waitFor(() => expect(ref.close).toHaveBeenCalledWith('actualizada'));
    expect(api.registrarAsistenciaPropia).toHaveBeenCalledWith('abc', 'asistida');
    expect(aviso.open).toHaveBeenCalled();
  });

  it('no registra nada si se rechaza la confirmación', async () => {
    const { boton, api, ref, dialog } = renderizar(aDetalle(cita({ starts_at: enHoras(-2), ends_at: enHoras(-1) })), false);
    boton('No asistió')!.click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());
    expect(api.registrarAsistenciaPropia).not.toHaveBeenCalled();
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor y no cierra si la asistencia falla', async () => {
    const { boton, api, ref, fixture, html } = renderizar(aDetalle(cita({ starts_at: enHoras(-2), ends_at: enHoras(-1) })));
    api.registrarAsistenciaPropia.mockRejectedValue(new Error('x'));
    boton('Asistió')!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(html.querySelector('[role="alert"]')).not.toBeNull();
    });
    expect(ref.close).not.toHaveBeenCalled();
  });

  it('al cancelar con éxito en el diálogo cierra avisando que la cita cambió', async () => {
    const { boton, ref } = renderizar(aDetalle(cita()), true);
    boton('Cancelar cita')!.click();
    await vi.waitFor(() => expect(ref.close).toHaveBeenCalledWith('actualizada'));
  });

  it('si se vuelve atrás en el diálogo de cancelación no cierra', async () => {
    const { boton, ref, dialog } = renderizar(aDetalle(cita()), false);
    boton('Cancelar cita')!.click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());
    expect(ref.close).not.toHaveBeenCalled();
  });
});

describe('aDetalle', () => {
  it('toma el teléfono de la cita y lo deja null si falta', () => {
    expect(aDetalle(cita()).telefono).toBe('3001234567');
    expect(aDetalle(cita({ patient_phone: null })).telefono).toBeNull();
    // Compatibilidad: si la base de datos aún no devolviera la columna, no se rompe.
    expect(aDetalle({ ...cita(), patient_phone: undefined } as unknown as CitaEspecialista).telefono).toBeNull();
  });

  it('conserva el id, el instante de inicio y el estado para las acciones', () => {
    const c = cita({ id: 'xyz' });
    const d = aDetalle(c);
    expect(d.id).toBe('xyz');
    expect(d.inicio).toBe(c.starts_at);
    expect(d.estado).toBe('confirmada');
  });
});
