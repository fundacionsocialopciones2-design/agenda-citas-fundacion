import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { CancelarCitaPropia } from './cancelar-cita-propia';
import { DatosDetalle } from './detalle-cita';

const datos: DatosDetalle = {
  id: 'abc',
  paciente: 'Paciente Prueba',
  documento: 'CC 1000000001',
  telefono: null,
  especialidad: 'Cirugía maxilofacial',
  fecha: 'sábado, 31 de octubre de 2026',
  hora: '11:00 – 12:00',
  inicio: '2026-10-31T16:00:00Z',
  estado: 'confirmada',
};

function renderizar(cancelar: () => Promise<void>) {
  const api = { cancelarCitaPropia: vi.fn(cancelar) };
  const ref = { close: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: datos },
      { provide: MatDialogRef, useValue: ref },
      { provide: AgendaApi, useValue: api },
    ],
  });
  const fixture = TestBed.createComponent(CancelarCitaPropia);
  fixture.detectChanges();
  const html = fixture.nativeElement as HTMLElement;
  const confirmar = () => Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancelar cita')!;
  return { api, ref, fixture, html, confirmar };
}

describe('CancelarCitaPropia', () => {
  it('advierte que el paciente no recibe aviso automático', () => {
    const { html } = renderizar(() => Promise.resolve());
    expect(html.textContent).toContain('no recibe un aviso automático');
    expect(html.textContent).toContain('Paciente Prueba');
  });

  it('cancela con el motivo escrito y se cierra con true', async () => {
    const { api, ref, fixture, html, confirmar } = renderizar(() => Promise.resolve());
    const campo = html.querySelector<HTMLInputElement>('#motivo')!;
    campo.value = 'Calamidad del especialista';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    confirmar().click();
    await vi.waitFor(() => expect(ref.close).toHaveBeenCalledWith(true));
    expect(api.cancelarCitaPropia).toHaveBeenCalledWith('abc', 'Calamidad del especialista');
  });

  it('si el servidor rechaza, muestra el error y no se cierra', async () => {
    const { ref, fixture, html, confirmar } = renderizar(() => Promise.reject(new Error('x')));
    confirmar().click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(html.querySelector('[role="alert"]')).not.toBeNull();
    });
    expect(ref.close).not.toHaveBeenCalled();
  });
});
