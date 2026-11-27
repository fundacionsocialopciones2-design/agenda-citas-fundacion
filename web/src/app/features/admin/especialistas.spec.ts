import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { AuthService } from '../../core/auth/auth.service';
import { Especialista } from '../../core/models';
import { EnlaceInvitacion } from './enlace-invitacion';
import { Especialistas } from './especialistas';

const especialista = (extra: Partial<Especialista>): Especialista => ({
  id: 'e1',
  profile_id: null,
  full_name: 'Dra. Sin Acceso',
  active: true,
  deactivated_at: null,
  specialist_specialties: [],
  profiles: null,
  ...extra,
});

async function renderizar(lista: Especialista[], invitaciones: { specialist_id: string; expires_at: string }[] = []) {
  const api = {
    especialistas: vi.fn().mockResolvedValue(lista),
    especialidades: vi.fn().mockResolvedValue([]),
    invitaciones: vi.fn().mockResolvedValue(invitaciones),
    crearInvitacion: vi.fn().mockResolvedValue({ token: 'f'.repeat(64), expires_at: '2026-11-29T15:00:00Z' }),
  };
  const dialog = { open: vi.fn() };
  TestBed.configureTestingModule({
    providers: [{ provide: AgendaApi, useValue: api }, { provide: AuthService, useValue: {} }, { provide: MatSnackBar, useValue: { open: vi.fn() } }],
  });
  TestBed.overrideComponent(Especialistas, { add: { providers: [{ provide: MatDialog, useValue: dialog }] } });
  const fixture = TestBed.createComponent(Especialistas);
  await fixture.whenStable();
  fixture.detectChanges();
  const html = fixture.nativeElement as HTMLElement;
  const boton = (texto: string) => Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.trim() === texto);
  return { html, api, dialog, fixture, boton };
}

describe('Especialistas: acceso por invitación', () => {
  it('solo ofrece el enlace a quien está activo y no tiene acceso', async () => {
    const { boton, html } = await renderizar([
      especialista({ id: 'a', profile_id: 'p', profiles: { email: 'con@example.com' } }),
      especialista({ id: 'b', active: false }),
    ]);
    expect(boton('Generar enlace de acceso')).toBeUndefined();
    expect(html.textContent).toContain('con@example.com');
  });

  it('genera el enlace con el token después de «#» y lo muestra', async () => {
    const { api, dialog, boton } = await renderizar([especialista({})]);
    boton('Generar enlace de acceso')!.click();
    await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());
    expect(api.crearInvitacion).toHaveBeenCalledWith('e1');
    expect(dialog.open).toHaveBeenCalledWith(
      EnlaceInvitacion,
      expect.objectContaining({ data: expect.objectContaining({ nombre: 'Dra. Sin Acceso', enlace: `${location.origin}/invitacion#${'f'.repeat(64)}` }) }),
    );
  });

  it('si ya hay un enlace vigente lo indica y permite anularlo', async () => {
    const { html, boton } = await renderizar([especialista({})], [{ specialist_id: 'e1', expires_at: '2026-11-29T15:00:00Z' }]);
    expect(html.textContent).toContain('Enlace vigente hasta');
    expect(boton('Nuevo enlace')).toBeDefined();
    expect(boton('Anular enlace')).toBeDefined();
  });
});
