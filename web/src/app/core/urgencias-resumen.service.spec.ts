import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgendaApi } from './agenda.api';
import { haceCuanto } from './tiempo';
import { UrgenciasResumen } from './urgencias-resumen.service';

const CIFRAS = { sin_atender: 2, en_gestion: 1, ultima_id: 5 };

describe('UrgenciasResumen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const crear = (resumenUrgencias = vi.fn().mockResolvedValue(CIFRAS)) => {
    TestBed.configureTestingModule({ providers: [{ provide: AgendaApi, useValue: { resumenUrgencias } }] });
    return { servicio: TestBed.inject(UrgenciasResumen), resumenUrgencias };
  };

  it('consulta al empezar y cada minuto, y deja de hacerlo al detenerse', async () => {
    const { servicio, resumenUrgencias } = crear();
    const detener = servicio.vigilar();
    await vi.advanceTimersByTimeAsync(0);
    expect(servicio.resumen()).toEqual(CIFRAS);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resumenUrgencias).toHaveBeenCalledTimes(2);
    detener();
    expect(servicio.resumen()).toBeNull();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(resumenUrgencias).toHaveBeenCalledTimes(2);
  });

  it('conserva la última cifra si una consulta falla', async () => {
    const { servicio } = crear(vi.fn().mockResolvedValueOnce(CIFRAS).mockRejectedValue(new Error('sin red')));
    await servicio.actualizar();
    await servicio.actualizar();
    expect(servicio.resumen()).toEqual(CIFRAS);
  });

  it('no cambia la señal si las cifras son las mismas', async () => {
    const { servicio } = crear(vi.fn().mockImplementation(async () => ({ ...CIFRAS })));
    await servicio.actualizar();
    const primera = servicio.resumen();
    await servicio.actualizar();
    expect(servicio.resumen()).toBe(primera);
  });
});

describe('haceCuanto', () => {
  const ahora = Date.parse('2026-11-26T15:00:00Z');
  it.each([
    ['2026-11-26T14:59:40Z', 'hace un momento'],
    ['2026-11-26T14:59:00Z', 'hace 1 minuto'],
    ['2026-11-26T14:15:00Z', 'hace 45 minutos'],
    ['2026-11-26T13:00:00Z', 'hace 2 horas'],
    ['2026-11-04T15:00:00Z', 'hace 22 días'],
  ])('%s → %s', (iso, texto) => expect(haceCuanto(iso, ahora)).toBe(texto));
});
