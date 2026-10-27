import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { CLAVE_ULTIMA_ACTIVIDAD, InactividadService } from './inactividad.service';

const LIMITE = environment.inactividad.limiteMinutos * 60_000;
const AVISO = environment.inactividad.avisoSegundos * 1000;

describe('InactividadService', () => {
  const autenticado = signal(true);
  const cerrarSesion = vi.fn();
  const navigate = vi.fn();
  const cerrarDialogo = vi.fn();
  const abrir = vi.fn();
  const closeAll = vi.fn();

  /** Crea el servicio y deja que arranque su vigilancia (un effect). */
  function crear(): InactividadService {
    const servicio = TestBed.inject(InactividadService);
    TestBed.tick();
    return servicio;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    autenticado.set(true);
    cerrarSesion.mockReset().mockResolvedValue(undefined);
    navigate.mockReset().mockResolvedValue(true);
    cerrarDialogo.mockReset();
    abrir.mockReset().mockReturnValue({ afterClosed: () => of(), close: cerrarDialogo });
    closeAll.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { autenticado, cerrarSesion } },
        { provide: Router, useValue: { navigate } },
        { provide: MatDialog, useValue: { open: abrir, closeAll } },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cierra la sesión y vuelve al ingreso al superar el tiempo de inactividad', async () => {
    crear();
    await vi.advanceTimersByTimeAsync(LIMITE + 1500);
    expect(cerrarSesion).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/ingresar'], { queryParams: { motivo: 'inactividad' } });
    expect(closeAll).toHaveBeenCalled(); // no queda ningún diálogo con datos abiertos
  });

  it('avisa antes de cerrar y todavía no cierra la sesión', async () => {
    const servicio = crear();
    await vi.advanceTimersByTimeAsync(LIMITE - AVISO + 1500);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(servicio.segundosRestantes()).toBeLessThanOrEqual(environment.inactividad.avisoSegundos);
    expect(cerrarSesion).not.toHaveBeenCalled();
  });

  it('la actividad de la persona reinicia el contador', async () => {
    crear();
    await vi.advanceTimersByTimeAsync(LIMITE / 2);
    window.dispatchEvent(new Event('keydown'));
    await vi.advanceTimersByTimeAsync(LIMITE / 2 + 2000);
    expect(cerrarSesion).not.toHaveBeenCalled();
  });

  it('«Continuar sesión» cierra el aviso y extiende la sesión', async () => {
    const servicio = crear();
    await vi.advanceTimersByTimeAsync(LIMITE - AVISO + 1500);
    servicio.continuar();
    expect(cerrarDialogo).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(LIMITE - AVISO - 2000);
    expect(cerrarSesion).not.toHaveBeenCalled();
  });

  it('la actividad en otra pestaña mantiene viva la sesión', async () => {
    crear();
    await vi.advanceTimersByTimeAsync(LIMITE - 5000);
    localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(Date.now()));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(cerrarSesion).not.toHaveBeenCalled();
  });

  it('no vigila nada si no hay una sesión iniciada', async () => {
    autenticado.set(false);
    crear();
    await vi.advanceTimersByTimeAsync(LIMITE * 2);
    expect(cerrarSesion).not.toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
  });

  it('deja de vigilar cuando la sesión termina', async () => {
    crear();
    autenticado.set(false);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(LIMITE * 2);
    expect(cerrarSesion).not.toHaveBeenCalled();
  });
});
