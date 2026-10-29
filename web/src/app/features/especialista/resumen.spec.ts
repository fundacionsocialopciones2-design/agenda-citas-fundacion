import { describe, expect, it } from 'vitest';
import { horaDelDiaBogota } from '../../core/tiempo';
import { comparar, cuantoFalta, diaSemanaCorto, porcentaje, saludoDe } from './resumen';

describe('comparar', () => {
  it('describe el aumento, la disminución y la igualdad sin juzgar', () => {
    expect(comparar(12, 9, 'ayer')).toEqual({ texto: '3 más que ayer', corto: '+3 vs. ayer', icono: 'arrow_upward' });
    expect(comparar(4, 6, 'el mes anterior')).toEqual({ texto: '2 menos que el mes anterior', corto: '−2 vs. el mes anterior', icono: 'arrow_downward' });
    expect(comparar(5, 5, 'la semana anterior')).toEqual({ texto: 'Igual que la semana anterior', corto: 'Igual que la semana anterior', icono: 'drag_handle' });
  });

  it('la pastilla visible usa la referencia abreviada y la frase completa queda para lectores de pantalla', () => {
    expect(comparar(6, 5, 'la semana anterior', 'sem. anterior')).toEqual({ texto: '1 más que la semana anterior', corto: '+1 vs. sem. anterior', icono: 'arrow_upward' });
  });
});

describe('saludoDe', () => {
  it('cambia según la hora del día', () => {
    expect(saludoDe(0)).toBe('Buenos días');
    expect(saludoDe(11)).toBe('Buenos días');
    expect(saludoDe(12)).toBe('Buenas tardes');
    expect(saludoDe(18)).toBe('Buenas tardes');
    expect(saludoDe(19)).toBe('Buenas noches');
  });
});

describe('horaDelDiaBogota', () => {
  it('convierte un instante UTC a la hora de Bogotá (UTC-5), incluida la medianoche', () => {
    expect(horaDelDiaBogota(new Date('2026-10-28T15:30:00Z'))).toBe(10);
    expect(horaDelDiaBogota(new Date('2026-10-28T05:00:00Z'))).toBe(0);
    expect(horaDelDiaBogota(new Date('2026-10-28T04:59:00Z'))).toBe(23);
  });
});

describe('porcentaje', () => {
  it('formatea en español y muestra «—» si no hay dato', () => {
    expect(porcentaje(0.3333).replace(/\s/g, '')).toBe('33,3%');
    expect(porcentaje(0).replace(/\s/g, '')).toBe('0%');
    expect(porcentaje(null)).toBe('—');
  });
});

describe('diaSemanaCorto', () => {
  it('toma la fecha como día calendario (no se corre por la zona horaria)', () => {
    expect(diaSemanaCorto('2026-10-26').toLowerCase()).toMatch(/^lun/);
    expect(diaSemanaCorto('2026-11-01').toLowerCase()).toMatch(/^dom/);
  });
});

describe('cuantoFalta', () => {
  const ahora = new Date('2026-10-28T20:00:00Z');
  it('en curso, minutos, horas o nada si falta un día o más', () => {
    expect(cuantoFalta('2026-10-28T19:30:00Z', ahora)).toBe('En curso');
    expect(cuantoFalta('2026-10-28T20:45:00Z', ahora)).toBe('En 45 min');
    expect(cuantoFalta('2026-10-28T23:10:00Z', ahora)).toBe('En 3 h');
    expect(cuantoFalta('2026-10-30T20:00:00Z', ahora)).toBeNull();
  });
});
