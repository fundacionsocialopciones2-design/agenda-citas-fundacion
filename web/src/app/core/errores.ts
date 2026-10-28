/**
 * Error de la API con un mensaje ya apto para mostrar. Nunca guarda el texto crudo de Postgres/PostgREST:
 * podría incluir datos de un paciente (por ejemplo, el documento en un error de duplicado).
 */
export class ErrorApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

/** Cambio que dejaría citas futuras confirmadas fuera de horario, sobre un bloqueo o con el especialista inactivo. */
export class ErrorConflicto extends ErrorApi {
  constructor(readonly citaIds: string[]) {
    super(
      'AG409',
      'Hay citas futuras confirmadas afectadas. Reprográmalas o cancélalas antes de aplicar este cambio.',
    );
  }
}

export const MENSAJES_AGENDA: Record<string, string> = {
  slot_unavailable: 'Ese horario ya no está disponible. Elige otro cupo.',
  patient_has_active_appointment: 'El paciente ya tiene una cita activa en esa especialidad.',
  specialist_not_found: 'El especialista no existe.',
  specialty_not_found: 'La especialidad no existe o está inactiva.',
  not_found: 'La cita no existe.',
  not_cancellable: 'Esta cita ya no se puede cancelar.',
  not_reschedulable: 'Esta cita ya no se puede reprogramar.',
  in_past: 'La cita ya pasó.',
  same_slot: 'Elige un horario distinto al actual.',
  not_confirmed: 'Solo se puede registrar asistencia de citas confirmadas.',
  not_started: 'La cita todavía no ha comenzado.',
  invalid_status: 'Estado no válido.',
};

export const MENSAJE_ERROR_GENERICO = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

/** Solo los `ErrorApi` traen un mensaje curado; cualquier otro error (red, librerías, bugs) muestra un texto fijo. */
export function mensajeDeError(e: unknown): string {
  return e instanceof ErrorApi ? e.message : MENSAJE_ERROR_GENERICO;
}
