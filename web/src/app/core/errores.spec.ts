import { describe, expect, it } from 'vitest';
import { ErrorApi, ErrorConflicto, MENSAJE_ERROR_GENERICO, mensajeDeError } from './errores';

describe('mensajeDeError', () => {
  it('muestra el mensaje curado de un ErrorApi', () => {
    expect(mensajeDeError(new ErrorApi('slot_unavailable', 'Ese horario ya no está disponible.'))).toBe('Ese horario ya no está disponible.');
  });

  it('muestra el aviso de conflicto de un ErrorConflicto', () => {
    const e = new ErrorConflicto(['a', 'b']);
    expect(mensajeDeError(e)).toBe(e.message);
    expect(e.citaIds).toEqual(['a', 'b']);
  });

  it('NO deja pasar el texto de errores desconocidos (podrían traer datos de pacientes)', () => {
    const crudo = new Error('duplicate key value violates unique constraint: Key (document_type, document_number)=(CC, 1000000001) already exists');
    const mensaje = mensajeDeError(crudo);
    expect(mensaje).toBe(MENSAJE_ERROR_GENERICO);
    expect(mensaje).not.toContain('1000000001');
    expect(mensaje).not.toContain('constraint');
  });

  it('usa el texto fijo con valores que no son Error', () => {
    expect(mensajeDeError('texto con datos')).toBe(MENSAJE_ERROR_GENERICO);
    expect(mensajeDeError(null)).toBe(MENSAJE_ERROR_GENERICO);
    expect(mensajeDeError(undefined)).toBe(MENSAJE_ERROR_GENERICO);
  });

  it('un ErrorApi no conserva ningún detalle crudo', () => {
    const e = new ErrorApi('23505', 'No se pudo completar la operación. Inténtalo de nuevo.');
    expect(Object.keys(e)).toEqual(['codigo']);
  });
});
