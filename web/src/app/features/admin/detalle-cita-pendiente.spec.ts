import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { ErrorApi, MENSAJES_AGENDA } from '../../core/errores';
import { CitaPendiente } from '../../core/models';
import { DetalleCitaPendiente } from './detalle-cita-pendiente';

const CITA: CitaPendiente = {
  id: 8,
  creado: '2026-11-25T15:00:00Z',
  servicio_id: 'sal_optometria',
  servicio: 'Optometría y examen visual',
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
};

async function renderizar(cambiar = vi.fn().mockResolvedValue(undefined)) {
  const api = { cambiarEstadoCitaPendiente: cambiar };
  const ref = { close: vi.fn(), disableClose: false };
  const aviso = { open: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: CITA },
      { provide: MatDialogRef, useValue: ref },
      { provide: AgendaApi, useValue: api },
      { provide: MatSnackBar, useValue: aviso },
    ],
  });
  const fixture = TestBed.createComponent(DetalleCitaPendiente);
  await fixture.whenStable();
  fixture.detectChanges();
  const html = fixture.nativeElement as HTMLElement;
  const select = () => html.querySelector<HTMLSelectElement>('#d-estado')!;
  const guardar = () => html.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const elegir = (valor: string) => {
    select().value = valor;
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  return { html, api, ref, aviso, fixture, select, guardar, elegir };
}

describe('DetalleCitaPendiente', () => {
  it('muestra el estado actual y no deja guardar sin cambios', async () => {
    const { select, guardar } = await renderizar();
    expect(select().value).toBe('pendiente');
    expect(Array.from(select().options).map((o) => o.textContent?.trim())).toEqual(['Pendiente', 'Contactado', 'Agendada', 'Atendida', 'Cancelada']);
    expect(guardar().disabled).toBe(true);
  });

  it('guarda el estado nuevo, avisa y cierra para recargar la lista', async () => {
    const { api, ref, aviso, guardar, elegir } = await renderizar();
    elegir('contactado');
    guardar().click();
    await vi.waitFor(() => expect(ref.close).toHaveBeenCalledWith('actualizada'));
    expect(api.cambiarEstadoCitaPendiente).toHaveBeenCalledWith(8, 'pendiente', 'contactado');
    expect(aviso.open).toHaveBeenCalledWith('Estado actualizado a «Contactado».', 'Cerrar', expect.anything());
  });

  it('si falla, muestra un error sin texto crudo y deja el diálogo abierto', async () => {
    const { html, ref, guardar, elegir, fixture } = await renderizar(vi.fn().mockRejectedValue(new Error('sin red')));
    elegir('atendida');
    guardar().click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(html.querySelector('[role="alert"]')).not.toBeNull();
    });
    expect(html.textContent).not.toContain('sin red');
    expect(ref.close).not.toHaveBeenCalled();
    expect(ref.disableClose).toBe(false);
  });

  it('si el estado ya había cambiado, avisa y cierra para recargar', async () => {
    const error = new ErrorApi('status_changed', MENSAJES_AGENDA['status_changed']);
    const { ref, aviso, guardar, elegir } = await renderizar(vi.fn().mockRejectedValue(error));
    elegir('contactado');
    guardar().click();
    await vi.waitFor(() => expect(ref.close).toHaveBeenCalledWith('actualizada'));
    expect(aviso.open).toHaveBeenCalledWith(MENSAJES_AGENDA['status_changed'], 'Cerrar', expect.anything());
  });
});
