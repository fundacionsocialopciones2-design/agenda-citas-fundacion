import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AgendaApi } from '../../core/agenda.api';
import { AuthService } from '../../core/auth/auth.service';
import { ErrorApi } from '../../core/errores';
import { Invitacion } from './invitacion';

interface Opciones {
  fragmento?: string | null;
  sesion?: unknown;
  consultar?: ReturnType<typeof vi.fn>;
  aceptar?: ReturnType<typeof vi.fn>;
}

async function renderizar({ fragmento = 'abc', sesion = null, consultar, aceptar }: Opciones = {}) {
  const api = {
    consultarInvitacion: consultar ?? vi.fn().mockResolvedValue('Dra. Prueba'),
    aceptarInvitacion: aceptar ?? vi.fn().mockResolvedValue(undefined),
  };
  const auth = {
    sesion: signal(sesion),
    whenReady: () => Promise.resolve(),
    cerrarSesion: vi.fn().mockResolvedValue(undefined),
    iniciarSesion: vi.fn().mockResolvedValue(null),
    rutaInicio: () => '/mi-panel',
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AgendaApi, useValue: api },
      { provide: AuthService, useValue: auth },
      { provide: ActivatedRoute, useValue: { snapshot: { fragment: fragmento } } },
    ],
  });
  const navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(Invitacion);
  const estabilizar = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await estabilizar();
  const html = fixture.nativeElement as HTMLElement;
  const llenar = (correo: string, clave: string, confirmar = clave) => {
    for (const [id, valor] of [['correo', correo], ['clave', clave], ['confirmar', confirmar]]) {
      const campo = html.querySelector<HTMLInputElement>(`#${id}`)!;
      campo.value = valor;
      campo.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
    html.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  };
  return { html, api, auth, navegar, estabilizar, llenar };
}

describe('Invitacion (enlace para especialistas)', () => {
  it('saluda por el nombre y pide correo y contraseña', async () => {
    const { html, api } = await renderizar();
    expect(api.consultarInvitacion).toHaveBeenCalledWith('abc');
    expect(html.textContent).toContain('Dra. Prueba');
    expect(html.querySelector('#correo')).not.toBeNull();
  });

  it('crea la cuenta, inicia sesión y entra', async () => {
    const { api, auth, navegar, llenar } = await renderizar();
    llenar('doc@example.com', 'clave-segura');
    await vi.waitFor(() => expect(navegar).toHaveBeenCalledWith('/mi-panel'));
    expect(api.aceptarInvitacion).toHaveBeenCalledWith('abc', 'doc@example.com', 'clave-segura');
    expect(auth.iniciarSesion).toHaveBeenCalledWith('doc@example.com', 'clave-segura');
  });

  it('no envía nada si las contraseñas no coinciden', async () => {
    const { html, api, llenar, estabilizar } = await renderizar();
    llenar('doc@example.com', 'clave-segura', 'otra-clave-x');
    await estabilizar();
    expect(html.textContent).toContain('Las contraseñas no coinciden.');
    expect(api.aceptarInvitacion).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor y deja corregir', async () => {
    const aceptar = vi.fn().mockRejectedValue(new ErrorApi('email_exists', 'Ya existe una cuenta con ese correo.'));
    const { html, auth, llenar, estabilizar } = await renderizar({ aceptar });
    llenar('doc@example.com', 'clave-segura');
    await vi.waitFor(async () => {
      await estabilizar();
      expect(html.textContent).toContain('Ya existe una cuenta con ese correo.');
    });
    expect(html.querySelector('form')).not.toBeNull();
    expect(auth.iniciarSesion).not.toHaveBeenCalled();
  });

  it('un enlace vencido o sin token se explica sin formulario', async () => {
    const consultar = vi.fn().mockRejectedValue(new ErrorApi('invitation_invalid', 'x'));
    const { html } = await renderizar({ consultar });
    expect(html.textContent).toContain('no es válido o ya venció');
    expect(html.querySelector('form')).toBeNull();
  });

  it('sin token no consulta al servidor', async () => {
    const { html, api } = await renderizar({ fragmento: null });
    expect(api.consultarInvitacion).not.toHaveBeenCalled();
    expect(html.textContent).toContain('no es válido o ya venció');
  });

  it('con una sesión abierta pide cerrarla antes', async () => {
    const { html, api, auth, estabilizar } = await renderizar({ sesion: {} });
    expect(api.consultarInvitacion).not.toHaveBeenCalled();
    Array.from(html.querySelectorAll('button')).find((b) => b.textContent?.includes('Cerrar sesión'))!.click();
    await vi.waitFor(() => expect(api.consultarInvitacion).toHaveBeenCalled());
    expect(auth.cerrarSesion).toHaveBeenCalled();
    await estabilizar();
  });
});
