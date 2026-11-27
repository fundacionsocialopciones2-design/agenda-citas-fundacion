import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { ErrorApi, MENSAJES_AGENDA } from '../../core/errores';
import { Urgencia } from '../../core/models';
import { DetalleUrgencia } from './detalle-urgencia';

const URGENCIA: Urgencia = {
  id: 7,
  creado: '2026-11-26T15:00:00Z',
  nombre_completo: 'Ana Prueba',
  tipo_documento: 'CC',
  numero_documento: '1000000001',
  telefono: '573001112233',
  telefono_contacto: null,
  correo: null,
  modalidad: 'Voy a la sede',
  direccion: null,
  detalle: 'Dolor fuerte',
  estado: 'pendiente',
  notas: ['2026-11-26 10:00 · Admin: primera'],
  autoriza_datos_at: '2026-11-26T15:00:00Z',
};

async function renderizar(extra: Partial<Record<'cambiarEstadoUrgencia' | 'agregarNotaUrgencia', ReturnType<typeof vi.fn>>> = {}) {
  const api = {
    cambiarEstadoUrgencia: vi.fn().mockResolvedValue(undefined),
    agregarNotaUrgencia: vi.fn().mockResolvedValue([...URGENCIA.notas, '2026-11-26 10:30 · Admin: llamé']),
    ...extra,
  };
  const aviso = { open: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: AgendaApi, useValue: api },
      { provide: MatSnackBar, useValue: aviso },
    ],
  });
  const fixture = TestBed.createComponent(DetalleUrgencia);
  fixture.componentRef.setInput('urgencia', URGENCIA);
  const cambiada = vi.fn();
  fixture.componentInstance.cambiada.subscribe(cambiada);
  await fixture.whenStable();
  fixture.detectChanges();
  const html = fixture.nativeElement as HTMLElement;
  const boton = (texto: string) => Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.trim() === texto)!;
  const escribir = (selector: string, valor: string, evento: 'input' | 'change') => {
    const campo = html.querySelector<HTMLSelectElement | HTMLTextAreaElement>(selector)!;
    campo.value = valor;
    campo.dispatchEvent(new Event(evento));
    fixture.detectChanges();
  };
  return { html, api, aviso, cambiada, fixture, boton, escribir };
}

describe('DetalleUrgencia', () => {
  it('muestra los datos, las notas y no deja guardar sin cambios', async () => {
    const { html, boton } = await renderizar();
    expect(html.textContent).toContain('Dolor fuerte');
    expect(html.querySelectorAll('.notas li')).toHaveLength(1);
    expect(boton('Guardar estado').disabled).toBe(true);
    expect(boton('Agregar nota').disabled).toBe(true);
  });

  it('agrega una nota y pide volver a consultar', async () => {
    const { html, api, cambiada, boton, escribir, fixture } = await renderizar();
    escribir('#u-nota', '  llamé  ', 'input');
    boton('Agregar nota').click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(html.querySelectorAll('.notas li')).toHaveLength(2);
    });
    expect(api.agregarNotaUrgencia).toHaveBeenCalledWith(7, 'llamé');
    expect(html.querySelector<HTMLTextAreaElement>('#u-nota')!.value).toBe('');
    expect(cambiada).toHaveBeenCalled();
  });

  it('una recarga sin cambio de estado no borra el estado elegido', async () => {
    const { html, escribir, fixture } = await renderizar();
    escribir('#u-estado', 'agendada', 'change');
    fixture.componentRef.setInput('urgencia', { ...URGENCIA });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(html.querySelector<HTMLSelectElement>('#u-estado')!.value).toBe('agendada');
  });

  it('al guardar el estado también guarda la nota pendiente y avisa dónde quedó', async () => {
    const { api, aviso, cambiada, boton, escribir } = await renderizar();
    escribir('#u-nota', 'viene a la sede', 'input');
    escribir('#u-estado', 'contactado', 'change');
    boton('Guardar estado').click();
    await vi.waitFor(() => expect(cambiada).toHaveBeenCalled());
    expect(api.agregarNotaUrgencia).toHaveBeenCalledWith(7, 'viene a la sede');
    expect(api.cambiarEstadoUrgencia).toHaveBeenCalledWith(7, 'pendiente', 'contactado');
    expect(aviso.open).toHaveBeenCalledWith('Estado actualizado a «Contactado». Quedó en «En gestión».', 'Cerrar', expect.anything());
  });

  it('si el estado ya había cambiado, avisa y pide volver a consultar', async () => {
    const error = new ErrorApi('status_changed', MENSAJES_AGENDA['status_changed']);
    const { aviso, cambiada, boton, escribir } = await renderizar({ cambiarEstadoUrgencia: vi.fn().mockRejectedValue(error) });
    escribir('#u-estado', 'atendida', 'change');
    boton('Guardar estado').click();
    await vi.waitFor(() => expect(cambiada).toHaveBeenCalled());
    expect(aviso.open).toHaveBeenCalledWith(MENSAJES_AGENDA['status_changed'], 'Cerrar', expect.anything());
  });

  it('si falla, muestra un error sin texto crudo y conserva la nota escrita', async () => {
    const { html, cambiada, boton, escribir, fixture } = await renderizar({ agregarNotaUrgencia: vi.fn().mockRejectedValue(new Error('sin red')) });
    escribir('#u-nota', 'llamé', 'input');
    boton('Agregar nota').click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(html.querySelector('[role="alert"]')).not.toBeNull();
    });
    expect(html.textContent).not.toContain('sin red');
    expect(html.querySelector<HTMLTextAreaElement>('#u-nota')!.value).toBe('llamé');
    expect(cambiada).not.toHaveBeenCalled();
  });
});
