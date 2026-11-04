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

// ---------- Cursos (catálogo del menú del chatbot e inscripciones hechas por WhatsApp) ----------
export type EstadoInscripcion = 'pendiente' | 'contactado' | 'matriculado' | 'cancelado';

export const ETIQUETA_INSCRIPCION: Record<EstadoInscripcion, string> = {
  pendiente: 'Pendiente',
  contactado: 'Contactado',
  matriculado: 'Matriculado',
  cancelado: 'Cancelado',
};

/** Id especial para las inscripciones cuyo curso ya no existe en el menú del bot. */
export const SIN_CURSO = '__sin_curso';

/** Un curso del catálogo (admin_cursos). La categoría es la rama del menú; el grupo, un submenú intermedio. */
export interface Curso {
  curso_id: string;
  titulo: string;
  categoria_id: string | null;
  categoria: string;
  grupo: string | null;
  activo: boolean;
  inscritos: number;
}

/** Una persona inscrita (admin_inscripciones). `telefono` es el WhatsApp desde el que se inscribió. */
export interface Inscripcion {
  id: number;
  creado: string;
  curso_id: string | null;
  curso: string;
  categoria: string | null;
  nombre_completo: string;
  tipo_documento: string;
  numero_documento: string;
  telefono: string;
  telefono_contacto: string | null;
  correo: string;
  ciudad: string;
  direccion: string | null;
  modalidad: string | null;
  estado: EstadoInscripcion;
  autoriza_datos_at: string;
}

export interface FiltrosInscripciones {
  cursoId: string;
  categoriaId: string;
  estado: EstadoInscripcion | '';
  busqueda: string;
}

// ---------- Asesorías (jurídicas y generales; solicitudes hechas por WhatsApp) ----------
export type EstadoSolicitud = 'pendiente' | 'contactado' | 'agendada' | 'atendida' | 'cancelada';

export const ETIQUETA_SOLICITUD: Record<EstadoSolicitud, string> = {
  pendiente: 'Pendiente',
  contactado: 'Contactado',
  agendada: 'Agendada',
  atendida: 'Atendida',
  cancelada: 'Cancelada',
};

/** Id especial para las solicitudes cuyo servicio ya no existe en el menú del bot. */
export const SIN_SERVICIO = '__sin_servicio';

/** Un tipo de asesoría (admin_asesorias). La categoría es la rama del menú (jurídica o generales). */
export interface TipoAsesoria {
  servicio_id: string;
  titulo: string;
  categoria_id: string | null;
  categoria: string;
  grupo: string | null;
  activo: boolean;
  solicitudes: number;
}

/** Una solicitud de asesoría (admin_solicitudes_asesoria). `detalle` es lo que la persona contó de su caso. */
export interface SolicitudAsesoria {
  id: number;
  creado: string;
  servicio_id: string | null;
  servicio: string;
  categoria: string | null;
  nombre_completo: string;
  tipo_documento: string | null;
  numero_documento: string | null;
  telefono: string;
  telefono_contacto: string | null;
  correo: string | null;
  modalidad: string | null;
  direccion: string | null;
  detalle: string | null;
  preferencia: string | null;
  estado: EstadoSolicitud;
  notas: string | null;
  autoriza_datos_at: string;
}

export interface FiltrosAsesorias {
  servicioId: string;
  categoriaId: string;
  estado: EstadoSolicitud | '';
  busqueda: string;
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
