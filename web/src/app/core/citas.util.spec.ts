import { describe, expect, it } from 'vitest';
import { marcaRelativa, proximasCitas } from './citas.util';
import { CitaEspecialista, EstadoCita } from './models';

const AHORA = new Date('2026-10-21T15:00:00Z');

function cita(id: string, inicio: string, fin: string, status: EstadoCita = 'confirmada'): CitaEspecialista {
  return {
    id,
    starts_at: inicio,
    ends_at: fin,
    status,
    specialty_name: 'Cirugía maxilofacial',
    patient_first_names: 'Paciente',
    patient_last_names: id,
    patient_document_type: 'CC',
    patient_document_number: '1000000000',
  };
}

describe('proximasCitas', () => {
  it('ordena de la cita más cercana a la más lejana, sin agrupar', () => {
    const citas = [
      cita('lejana', '2026-12-01T14:00:00Z', '2026-12-01T15:00:00Z'),
      cita('cercana', '2026-10-22T14:00:00Z', '2026-10-22T15:00:00Z'),
      cita('media', '2026-11-05T14:00:00Z', '2026-11-05T15:00:00Z'),
    ];
    expect(proximasCitas(citas, AHORA).map((c) => c.id)).toEqual(['cercana', 'media', 'lejana']);
  });

  it('excluye canceladas, asistidas, no asistidas y las que ya terminaron', () => {
    const citas = [
      cita('pasada', '2026-10-20T14:00:00Z', '2026-10-20T15:00:00Z'),
      cita('cancelada', '2026-10-25T14:00:00Z', '2026-10-25T15:00:00Z', 'cancelada'),
      cita('asistida', '2026-10-26T14:00:00Z', '2026-10-26T15:00:00Z', 'asistida'),
      cita('no-asistio', '2026-10-27T14:00:00Z', '2026-10-27T15:00:00Z', 'no_asistio'),
      cita('vigente', '2026-10-28T14:00:00Z', '2026-10-28T15:00:00Z'),
    ];
    expect(proximasCitas(citas, AHORA).map((c) => c.id)).toEqual(['vigente']);
  });

  it('conserva la cita en curso (empezó pero aún no termina)', () => {
    const enCurso = cita('en-curso', '2026-10-21T14:30:00Z', '2026-10-21T15:30:00Z');
    expect(proximasCitas([enCurso], AHORA)).toHaveLength(1);
  });

  it('no modifica el arreglo original', () => {
    const citas = [cita('b', '2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z'), cita('a', '2026-10-30T10:00:00Z', '2026-10-30T11:00:00Z')];
    proximasCitas(citas, AHORA);
    expect(citas.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('marcaRelativa', () => {
  it('reconoce hoy y mañana', () => {
    expect(marcaRelativa('2026-10-21', '2026-10-21', '2026-10-22')).toBe('Hoy');
    expect(marcaRelativa('2026-10-22', '2026-10-21', '2026-10-22')).toBe('Mañana');
    expect(marcaRelativa('2026-10-30', '2026-10-21', '2026-10-22')).toBeNull();
  });
});
