import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_TEMA, TemaService } from './tema.service';

const esquema = () => document.documentElement.getAttribute('data-color-scheme');

describe('TemaService', () => {
  let alCambiarSistema: (e: { matches: boolean }) => void = () => undefined;

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: (_: string, f: typeof alCambiarSistema) => (alCambiarSistema = f) }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-color-scheme');
  });

  const crear = () => {
    const tema = TestBed.inject(TemaService);
    TestBed.tick();
    return tema;
  };

  it('por defecto es claro, aunque el equipo esté en oscuro', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => undefined }));
    expect(crear().preferencia()).toBe('claro');
    expect(esquema()).toBe('light');
  });

  it('al elegir oscuro lo aplica y lo recuerda', () => {
    const tema = crear();
    tema.elegir('oscuro');
    TestBed.tick();
    expect(esquema()).toBe('dark');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('oscuro');
  });

  it('recupera lo elegido antes e ignora valores desconocidos', () => {
    localStorage.setItem(CLAVE_TEMA, 'oscuro');
    expect(crear().oscuro()).toBe(true);
    TestBed.resetTestingModule();
    localStorage.setItem(CLAVE_TEMA, 'rosado');
    expect(crear().preferencia()).toBe('claro');
  });

  it('«según el equipo» sigue los cambios del sistema', () => {
    const tema = crear();
    tema.elegir('sistema');
    TestBed.tick();
    expect(esquema()).toBe('light');
    alCambiarSistema({ matches: true });
    TestBed.tick();
    expect(esquema()).toBe('dark');
  });

  it('funciona aunque el almacenamiento esté bloqueado', () => {
    const bloqueado = () => {
      throw new Error('bloqueado');
    };
    vi.stubGlobal('localStorage', { getItem: bloqueado, setItem: bloqueado });
    const tema = crear();
    tema.elegir('oscuro');
    TestBed.tick();
    expect(esquema()).toBe('dark');
  });
});
