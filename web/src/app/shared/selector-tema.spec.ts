import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SelectorTema } from './selector-tema';

describe('SelectorTema', () => {
  beforeEach(() => localStorage.clear());

  it('ofrece las tres apariencias, marca la actual y aplica la elegida', async () => {
    const fixture = TestBed.createComponent(SelectorTema);
    await fixture.whenStable();
    const boton = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(boton.getAttribute('aria-label')).toBe('Apariencia: Claro');
    boton.click();
    await fixture.whenStable();

    const opciones = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    expect(opciones()).toHaveLength(3);
    expect(opciones()[0].getAttribute('aria-checked')).toBe('true');
    opciones()[1].click();
    TestBed.tick();
    await fixture.whenStable();

    expect(document.documentElement.getAttribute('data-color-scheme')).toBe('dark');
    expect(boton.getAttribute('aria-label')).toBe('Apariencia: Oscuro');
    document.documentElement.removeAttribute('data-color-scheme');
  });
});
