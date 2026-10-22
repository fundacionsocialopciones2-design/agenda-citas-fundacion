import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { AuthService } from './core/auth.service';
import { InactividadService } from './core/inactividad.service';

describe('App', () => {
  const sesionPerdida = signal(0);

  beforeEach(async () => {
    sesionPerdida.set(0);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { sesionPerdida } },
        { provide: InactividadService, useValue: {} },
      ],
    }).compileComponents();
  });

  it('se crea', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('vuelve al ingreso cuando la sesión se pierde sin que la pestaña lo pida', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(navegar).not.toHaveBeenCalled();

    sesionPerdida.set(1);
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/ingresar'], { queryParams: { motivo: 'sesion' } });
  });
});
