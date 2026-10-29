export type Rol = 'admin' | 'especialista';
export type EstadoCita = 'confirmada' | 'cancelada' | 'asistida' | 'no_asistio';
export type OrigenCita = 'whatsapp' | 'dashboard';
export type TipoBloqueo = 'descanso' | 'vacaciones' | 'ausencia' | 'otro';
export type TipoDocumento = 'CC' | 'TI' | 'CE' | 'RC' | 'PA' | 'PPT' | 'PEP';

export interface Perfil {
  id: string;
  full_name: string;
  role: Rol;
  active: boolean;
  email: string | null;
}

export interface Especialidad {
  id: string;
  name: string;
  slot_minutes: number;
  active: boolean;
}

export interface Especialista {
  id: string;
  profile_id: string | null;
  full_name: string;
  active: boolean;
  deactivated_at: string | null;
  specialist_specialties: { specialty_id: string }[];
  profiles: { email: string | null } | null;
}

export interface HorarioSemanal {
  id?: string;
  specialist_id?: string;
  weekday: number; // 1 = lunes ... 7 = domingo
  start_time: string; // HH:MM[:SS]
  end_time: string;
}

export interface Bloqueo {
  id: string;
  specialist_id: string;
  kind: TipoBloqueo;
  starts_at: string;
  ends_at: string;
  note: string | null;
}

export interface Cita {
  id: string;
  starts_at: string;
  ends_at: string;
  status: EstadoCita;
  source: OrigenCita;
  cancel_reason: string | null;
  rescheduled_from: string | null;
  specialist_id: string;
  specialty_id: string;
  patients: {
    first_names: string;
    last_names: string;
    document_type: TipoDocumento;
    document_number: string;
    phone: string | null;
  };
  specialists: { full_name: string };
  specialties: { name: string };
}

export interface CitaEspecialista {
  id: string;
  starts_at: string;
  ends_at: string;
  status: EstadoCita;
  specialty_name: string;
  patient_first_names: string;
  patient_last_names: string;
  patient_document_type: TipoDocumento;
  patient_document_number: string;
  /** Teléfono de contacto del paciente (solo de las citas del propio especialista); null si no tiene registrado. */
  patient_phone: string | null;
}

export interface Cupo {
  starts_at: string;
  ends_at: string;
}

export interface FiltrosCitas {
  desde: string; // YYYY-MM-DD (Bogotá)
  hasta: string;
  specialistId: string;
  specialtyId: string;
  estado: EstadoCita | '';
  documento: string;
}

export const DIAS_SEMANA = [
  { valor: 1, nombre: 'Lunes' },
  { valor: 2, nombre: 'Martes' },
  { valor: 3, nombre: 'Miércoles' },
  { valor: 4, nombre: 'Jueves' },
  { valor: 5, nombre: 'Viernes' },
  { valor: 6, nombre: 'Sábado' },
  { valor: 7, nombre: 'Domingo' },
] as const;

export const ETIQUETA_ESTADO: Record<EstadoCita, string> = {
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  asistida: 'Asistida',
  no_asistio: 'No asistió',
};

/** Color de cada estado en el calendario y en el dashboard (siempre acompañado de su texto). */
export const COLOR_ESTADO: Record<EstadoCita, string> = {
  confirmada: '#1f5aa6',
  asistida: '#14603f',
  no_asistio: '#5b6676',
  cancelada: '#8f2419',
};

/** Resumen del dashboard del especialista (my_dashboard). Las cifras las calcula la base de datos, en hora de Colombia. */
export interface ResumenEspecialista {
  hoy: string; // YYYY-MM-DD
  semana_inicio: string; // lunes, YYYY-MM-DD
  mes_inicio: string;
  citas_hoy: number;
  citas_ayer: number;
  citas_semana: number;
  citas_semana_anterior: number;
  citas_mes: number;
  citas_mes_anterior: number;
  canceladas_mes: number;
  canceladas_mes_anterior: number;
  /** Fracción 0–1; null si aún no hay citas resueltas en el periodo. */
  inasistencia_mes: number | null;
  inasistencia_mes_anterior: number | null;
  estados_mes: Record<EstadoCita, number>;
  por_dia_semana: { fecha: string; total: number }[];
  por_cerrar: number;
  por_cerrar_lista: CitaEspecialista[];
  citas_de_hoy: CitaEspecialista[];
  proxima: CitaEspecialista | null;
}

export const ETIQUETA_BLOQUEO: Record<TipoBloqueo, string> = {
  descanso: 'Descanso',
  vacaciones: 'Vacaciones',
  ausencia: 'Ausencia',
  otro: 'Otro',
};

export const TIPOS_DOCUMENTO: { valor: TipoDocumento; nombre: string }[] = [
  { valor: 'CC', nombre: 'Cédula de ciudadanía' },
  { valor: 'TI', nombre: 'Tarjeta de identidad' },
  { valor: 'CE', nombre: 'Cédula de extranjería' },
  { valor: 'RC', nombre: 'Registro civil' },
  { valor: 'PA', nombre: 'Pasaporte' },
  { valor: 'PPT', nombre: 'Permiso por protección temporal' },
  { valor: 'PEP', nombre: 'Permiso especial de permanencia' },
];
