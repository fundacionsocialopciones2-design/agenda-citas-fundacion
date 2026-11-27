import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { describe, expect, it, vi } from 'vitest';
import { ErrorApi, MENSAJES_AGENDA } from '../../core/errores';
import { ETIQUETA_INSCRIPCION } from '../../core/models';
import { GestionEstado } from './gestion-estado';
import { destinoAsesoria, destinoInscripcion, ESTADOS_ASESORIA, ESTADOS_INSCRIPCION, vistaDe } from './pestanas-gestion';

async function renderizar(guardar = vi.fn().mockResolvedValue(undefined)) {
  const aviso = { open: vi.fn() };
  TestBed.configureTestingModule({ providers: [{ provide: MatSnackBar, useValue: aviso }] });
  const fixture = TestBed.createComponent(GestionEstado);
  fixture.componentRef.setInput('estado', 'pendiente');
  fixture.componentRef.setInput('etiquetas', ETIQUETA_INSCRIPCION);
  fixture.componentRef.setInput('destino', destinoInscripcion);
  fixture.componentRef.setInput('guardar', guardar);
  const cambiada = vi.fn();
  fixture.componentInstance.cambiada.subscribe(cambiada);
  await fixture.whenStable();
  fixture.detectChanges();
  const html = fixture.nativeElement as HTMLElement;
  const boton = () => html.querySelector<HTMLButtonElement>('button')!;
  const elegir = (valor: string) => {
    const s = html.querySelector<HTMLSelectElement>('select')!;
    s.value = valor;
    s.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  return { html, guardar, aviso, cambiada, fixture, boton, elegir };
}

describe('GestionEstado', () => {
  it('no deja guardar sin cambios y, al guardar, dice en qué pestaña quedó', async () => {
    const { guardar, aviso, cambiada, boton, elegir } = await renderizar();
    expect(boton().disabled).toBe(true);
    elegir('matriculado');
    boton().click();
    await vi.waitFor(() => expect(cambiada).toHaveBeenCalled());
    expect(guardar).toHaveBeenCalledWith('pendiente', 'matriculado');
    expect(aviso.open).toHaveBeenCalledWith('Estado actualizado a «Matriculado». Quedó en «Confirmados».', 'Cerrar', expect.anything());
  });

  it('si falla muestra un error sin texto crudo', async () => {
    const { html, cambiada, boton, elegir, fixture } = await renderizar(vi.fn().mockRejectedValue(new Error('sin red')));
    elegir('cancelado');
    boton().click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(html.querySelector('[role="alert"]')).not.toBeNull();
    });
    expect(html.textContent).not.toContain('sin red');
    expect(cambiada).not.toHaveBeenCalled();
  });

  it('si el estado ya había cambiado, avisa y pide volver a consultar', async () => {
    const error = new ErrorApi('status_changed', MENSAJES_AGENDA['status_changed']);
    const { aviso, cambiada, boton, elegir } = await renderizar(vi.fn().mockRejectedValue(error));
    elegir('contactado');
    boton().click();
    await vi.waitFor(() => expect(cambiada).toHaveBeenCalled());
    expect(aviso.open).toHaveBeenCalledWith(MENSAJES_AGENDA['status_changed'], 'Cerrar', expect.anything());
  });
});

describe('pestañas de gestión', () => {
  it('cada estado cae en una pestaña', () => {
    expect(vistaDe(ESTADOS_INSCRIPCION, 'contactado')).toBe('por_confirmar');
    expect(vistaDe(ESTADOS_INSCRIPCION, 'matriculado')).toBe('confirmados');
    expect(vistaDe(ESTADOS_ASESORIA, 'atendida')).toBe('confirmados');
    expect(destinoAsesoria('cancelada')).toBe('Canceladas');
  });
});
