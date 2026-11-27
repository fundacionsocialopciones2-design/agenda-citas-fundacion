import { inject, Service } from '@angular/core';
import { FunctionsHttpError, type PostgrestError } from '@supabase/supabase-js';
import { ErrorApi, ErrorConflicto, MENSAJES_AGENDA } from './errores';
import {
  Bloqueo,
  Cita,
  ConteoGestion,
  CitaEspecialista,
  CitaPendiente,
  Cupo,
  Curso,
  Especialidad,
  Especialista,
  EstadoCita,
  EstadoInscripcion,
  EstadoSolicitud,
  FiltrosAsesorias,
  FiltrosCitas,
  FiltrosCitasPendientes,
  FiltrosInscripciones,
  FiltrosUrgencias,
  HorarioSemanal,
  Invitacion,
  Inscripcion,
  ResumenEspecialista,
  ResumenInicio,
  ResumenUrgencias,
  ServicioCita,
  SolicitudAsesoria,
  TipoAsesoria,
  TipoBloqueo,
  TipoDocumento,
  Urgencia,
} from './models';
import { SupabaseService } from './supabase.service';
import { bogotaAIso, sumarDias } from './tiempo';

interface RespuestaRpc {
  ok: boolean;
  code?: string;
}

const CAMPOS_CITA =
  'id, starts_at, ends_at, status, source, cancel_reason, rescheduled_from, specialist_id, specialty_id, ' +
  'patients!inner(first_names, last_names, document_type, document_number, phone), specialists(full_name), specialties(name)';

export const normalizarDocumento = (v: string): string => v.toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Acceso a datos del dashboard. Toda regla de negocio vive en Postgres; aquí solo se invoca. */
@Service()
export class AgendaApi {
  private readonly sb = inject(SupabaseService).client;

  private falla(e: PostgrestError): never {
    if (e.code === 'AG409') throw new ErrorConflicto((e.details ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    if (e.code === '42501') throw new ErrorApi('forbidden', 'No tienes permiso para realizar esta acción.');
    throw new ErrorApi(e.code, 'No se pudo completar la operación. Inténtalo de nuevo.'); // sin e.message: puede traer datos del paciente
  }

  private datos<T>(r: { data: T | null; error: PostgrestError | null }): T {
    if (r.error) this.falla(r.error);
    return r.data as T;
  }

  private verificar(r: RespuestaRpc): void {
    if (!r.ok) throw new ErrorApi(r.code ?? 'error', MENSAJES_AGENDA[r.code ?? ''] ?? 'No se pudo completar la operación.');
  }

  // ---------- Catálogos ----------
  async especialidades(): Promise<Especialidad[]> {
    return this.datos(await this.sb.from('specialties').select('id, name, slot_minutes, active').order('name')) as Especialidad[];
  }

  async especialistas(): Promise<Especialista[]> {
    return this.datos(
      await this.sb
        .from('specialists')
        .select('id, profile_id, full_name, active, deactivated_at, specialist_specialties(specialty_id), profiles(email)')
        .order('full_name'),
    ) as unknown as Especialista[];
  }

  async actualizarEspecialista(id: string, nombre: string, especialidadIds: string[]): Promise<void> {
    this.datos(await this.sb.from('specialists').update({ full_name: nombre.trim() }).eq('id', id));
    const actuales = (this.datos(await this.sb.from('specialist_specialties').select('specialty_id').eq('specialist_id', id)) as { specialty_id: string }[]).map((x) => x.specialty_id);
    const quitar = actuales.filter((x) => !especialidadIds.includes(x));
    const agregar = especialidadIds.filter((x) => !actuales.includes(x));
    if (quitar.length) this.datos(await this.sb.from('specialist_specialties').delete().eq('specialist_id', id).in('specialty_id', quitar));
    if (agregar.length) this.datos(await this.sb.from('specialist_specialties').insert(agregar.map((s) => ({ specialist_id: id, specialty_id: s }))));
  }

  // ---------- Administración de usuarios (Edge Function con verificación de admin en servidor) ----------
  private adminUsuarios<T>(accion: string, datos: Record<string, unknown>): Promise<T> {
    return this.funcion<T>('admin-users', { action: accion, ...datos });
  }

  /** Llama una Edge Function; sus errores traen un mensaje ya apto para mostrar. */
  private async funcion<T>(nombre: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.functions.invoke(nombre, { body });
    if (error) {
      let cuerpo: { code?: string; message?: string; cita_ids?: string[] } | null = null;
      if (error instanceof FunctionsHttpError) cuerpo = await error.context.json().catch(() => null);
      if (cuerpo?.code === 'AG409') throw new ErrorConflicto(cuerpo.cita_ids ?? []);
      throw new ErrorApi(cuerpo?.code ?? 'edge', cuerpo?.message ?? 'No se pudo completar la operación.');
    }
    return data as T;
  }

  crearEspecialista(p: { correo: string; nombre: string; especialidadIds: string[] }): Promise<{ specialist_id: string }> {
    return this.adminUsuarios('create_specialist', { email: p.correo, full_name: p.nombre, specialty_ids: p.especialidadIds });
  }

  cambiarCorreoEspecialista(specialistId: string, correo: string): Promise<void> {
    return this.adminUsuarios('change_email', { specialist_id: specialistId, email: correo });
  }

  cambiarEstadoEspecialista(specialistId: string, activo: boolean): Promise<void> {
    return this.adminUsuarios('set_active', { specialist_id: specialistId, active: activo });
  }

  // ---------- Gestión de inscripciones y asesorías (las funciones exigen is_admin()) ----------
  async conteoGestion(): Promise<ConteoGestion> {
    return this.datos(await this.sb.rpc('admin_conteo_gestion')) as ConteoGestion;
  }

  async cambiarEstadoInscripcion(id: number, estadoActual: EstadoInscripcion, estado: EstadoInscripcion): Promise<void> {
    this.verificar(
      this.datos(
        await this.sb.rpc('admin_cambiar_estado_inscripcion', { p_id: id, p_estado_actual: estadoActual, p_estado: estado }),
      ) as RespuestaRpc,
    );
  }

  async cambiarEstadoAsesoria(id: number, estadoActual: EstadoSolicitud, estado: EstadoSolicitud): Promise<void> {
    this.verificar(
      this.datos(
        await this.sb.rpc('admin_cambiar_estado_asesoria', { p_id: id, p_estado_actual: estadoActual, p_estado: estado }),
      ) as RespuestaRpc,
    );
  }

  // ---------- Invitaciones de acceso para especialistas (las funciones admin_* exigen is_admin()) ----------
  async invitaciones(): Promise<Invitacion[]> {
    return this.datos(await this.sb.rpc('admin_invitaciones')) as Invitacion[];
  }

  /** El token solo se entrega aquí, una vez: en la base queda su huella. Crear otro anula el anterior. */
  async crearInvitacion(specialistId: string): Promise<{ token: string; expires_at: string }> {
    const r = this.datos(await this.sb.rpc('admin_crear_invitacion', { p_specialist_id: specialistId })) as RespuestaRpc & {
      token: string;
      expires_at: string;
    };
    this.verificar(r);
    return { token: r.token, expires_at: r.expires_at };
  }

  async anularInvitacion(specialistId: string): Promise<void> {
    this.verificar(this.datos(await this.sb.rpc('admin_anular_invitacion', { p_specialist_id: specialistId })) as RespuestaRpc);
  }

  /** Público (sin sesión): devuelve el nombre del especialista si el enlace sirve. */
  async consultarInvitacion(token: string): Promise<string> {
    return (await this.funcion<{ full_name: string }>('invitacion-especialista', { action: 'consultar', token })).full_name;
  }

  /** Público (sin sesión): crea el usuario del especialista y gasta el enlace. */
  async aceptarInvitacion(token: string, correo: string, clave: string): Promise<void> {
    await this.funcion('invitacion-especialista', { action: 'aceptar', token, email: correo.trim(), password: clave });
  }

  // ---------- Horarios y bloqueos ----------
  async horarios(specialistId: string): Promise<HorarioSemanal[]> {
    return this.datos(
      await this.sb.from('weekly_schedules').select('id, specialist_id, weekday, start_time, end_time').eq('specialist_id', specialistId).order('weekday').order('start_time'),
    ) as HorarioSemanal[];
  }

  async guardarHorarios(specialistId: string, filas: HorarioSemanal[]): Promise<void> {
    this.datos(
      await this.sb.rpc('admin_set_weekly_schedule', {
        p_specialist_id: specialistId,
        p_rows: filas.map((f) => ({ weekday: f.weekday, start_time: f.start_time.slice(0, 5), end_time: f.end_time.slice(0, 5) })),
      }),
    );
  }

  async bloqueos(specialistId: string): Promise<Bloqueo[]> {
    return this.datos(
      await this.sb.from('time_blocks').select('id, specialist_id, kind, starts_at, ends_at, note').eq('specialist_id', specialistId).gte('ends_at', new Date(Date.now() - 30 * 86400000).toISOString()).order('starts_at'),
    ) as Bloqueo[];
  }

  async guardarBloqueo(p: { id: string | null; specialistId: string; tipo: TipoBloqueo; inicio: string; fin: string; nota: string }): Promise<void> {
    this.datos(
      await this.sb.rpc('admin_save_block', {
        p_id: p.id,
        p_specialist_id: p.specialistId,
        p_kind: p.tipo,
        p_starts_at: p.inicio,
        p_ends_at: p.fin,
        p_note: p.nota,
      }),
    );
  }

  async eliminarBloqueo(id: string): Promise<void> {
    this.datos(await this.sb.from('time_blocks').delete().eq('id', id));
  }

  // ---------- Citas ----------
  async citas(f: FiltrosCitas): Promise<Cita[]> {
    let q = this.sb
      .from('appointments')
      .select(CAMPOS_CITA)
      .gte('starts_at', bogotaAIso(f.desde, '00:00'))
      .lt('starts_at', bogotaAIso(sumarDias(f.hasta, 1), '00:00'))
      .order('starts_at')
      .limit(500);
    if (f.specialistId) q = q.eq('specialist_id', f.specialistId);
    if (f.specialtyId) q = q.eq('specialty_id', f.specialtyId);
    if (f.estado) q = q.eq('status', f.estado);
    if (f.documento.trim()) q = q.eq('patients.document_number', normalizarDocumento(f.documento));
    return this.datos(await q) as unknown as Cita[];
  }

  async citasPorIds(ids: string[]): Promise<Cita[]> {
    if (!ids.length) return [];
    return this.datos(await this.sb.from('appointments').select(CAMPOS_CITA).in('id', ids).order('starts_at')) as unknown as Cita[];
  }

  async buscarPaciente(tipo: TipoDocumento, numero: string): Promise<{ first_names: string; last_names: string } | null> {
    const r = await this.sb.from('patients').select('first_names, last_names').eq('document_type', tipo).eq('document_number', normalizarDocumento(numero)).maybeSingle();
    if (r.error) this.falla(r.error);
    return r.data;
  }

  async cuposLibres(specialistId: string, specialtyId: string, desde: string, hasta: string): Promise<Cupo[]> {
    return this.datos(
      await this.sb.rpc('admin_free_slots', {
        p_specialist_id: specialistId,
        p_specialty_id: specialtyId,
        p_from: bogotaAIso(desde, '00:00'),
        p_to: bogotaAIso(sumarDias(hasta, 1), '00:00'),
      }),
    ) as Cupo[];
  }

  async reservarCita(p: {
    tipoDocumento: TipoDocumento;
    numeroDocumento: string;
    nombres: string;
    apellidos: string;
    telefono: string;
    autorizacion: boolean;
    specialistId: string;
    specialtyId: string;
    inicio: string;
  }): Promise<void> {
    const pacienteId = this.datos(
      await this.sb.rpc('admin_upsert_patient', {
        p_document_type: p.tipoDocumento,
        p_document_number: p.numeroDocumento,
        p_first_names: p.nombres,
        p_last_names: p.apellidos,
        p_phone: p.telefono.trim() || null,
        p_consent: p.autorizacion,
      }),
    ) as string;
    this.verificar(
      this.datos(
        await this.sb.rpc('admin_book_appointment', {
          p_patient_id: pacienteId,
          p_specialist_id: p.specialistId,
          p_specialty_id: p.specialtyId,
          p_starts_at: p.inicio,
        }),
      ) as RespuestaRpc,
    );
  }

  async cancelarCita(id: string, motivo: string): Promise<void> {
    this.verificar(this.datos(await this.sb.rpc('admin_cancel_appointment', { p_appointment_id: id, p_reason: motivo.trim() || null })) as RespuestaRpc);
  }

  async reprogramarCita(id: string, nuevoInicioIso: string): Promise<void> {
    this.verificar(this.datos(await this.sb.rpc('admin_reschedule_appointment', { p_appointment_id: id, p_new_starts_at: nuevoInicioIso })) as RespuestaRpc);
  }

  async registrarAsistencia(id: string, estado: Extract<EstadoCita, 'asistida' | 'no_asistio'>): Promise<void> {
    this.verificar(this.datos(await this.sb.rpc('admin_set_attendance', { p_appointment_id: id, p_status: estado })) as RespuestaRpc);
  }

  // ---------- Cursos (solo lectura; las funciones exigen is_admin()) ----------
  async cursos(): Promise<Curso[]> {
    return (this.datos(await this.sb.rpc('admin_cursos')) as Curso[]).map((c) => ({ ...c, inscritos: Number(c.inscritos) }));
  }

  async inscripciones(f: FiltrosInscripciones): Promise<Inscripcion[]> {
    return this.datos(
      await this.sb.rpc('admin_inscripciones', {
        p_curso_id: f.cursoId || null,
        p_categoria_id: f.categoriaId || null,
        p_estado: f.estado || null,
        p_busqueda: f.busqueda.trim() || null,
        p_vista: f.vista,
      }),
    ) as Inscripcion[];
  }

  // ---------- Asesorías jurídicas y generales (solo lectura; las funciones exigen is_admin()) ----------
  async asesorias(): Promise<TipoAsesoria[]> {
    return (this.datos(await this.sb.rpc('admin_asesorias')) as TipoAsesoria[]).map((t) => ({ ...t, solicitudes: Number(t.solicitudes) }));
  }

  async solicitudesAsesoria(f: FiltrosAsesorias): Promise<SolicitudAsesoria[]> {
    return this.datos(
      await this.sb.rpc('admin_solicitudes_asesoria', {
        p_servicio_id: f.servicioId || null,
        p_categoria_id: f.categoriaId || null,
        p_estado: f.estado || null,
        p_busqueda: f.busqueda.trim() || null,
        p_vista: f.vista,
      }),
    ) as SolicitudAsesoria[];
  }

  // ---------- Agenda pendiente: citas abiertas del bot (las funciones exigen is_admin()) ----------
  async serviciosCita(): Promise<ServicioCita[]> {
    return (this.datos(await this.sb.rpc('admin_servicios_cita')) as ServicioCita[]).map((s) => ({
      ...s,
      solicitudes: Number(s.solicitudes),
      pendientes: Number(s.pendientes),
    }));
  }

  async citasPendientes(f: FiltrosCitasPendientes): Promise<CitaPendiente[]> {
    return this.datos(
      await this.sb.rpc('admin_citas_pendientes', {
        p_servicio_id: f.servicioId || null,
        p_estado: f.estado || null,
        p_busqueda: f.busqueda.trim() || null,
      }),
    ) as CitaPendiente[];
  }

  /** `estadoActual` es el que se estaba viendo: si ya cambió, la base de datos no lo pisa. */
  async cambiarEstadoCitaPendiente(id: number, estadoActual: EstadoSolicitud, estado: EstadoSolicitud): Promise<void> {
    this.verificar(
      this.datos(
        await this.sb.rpc('admin_cambiar_estado_cita_pendiente', { p_id: id, p_estado_actual: estadoActual, p_estado: estado }),
      ) as RespuestaRpc,
    );
  }

  // ---------- Inicio del administrador (la función exige is_admin()) ----------
  async inicio(): Promise<ResumenInicio> {
    return this.datos(await this.sb.rpc('admin_inicio')) as ResumenInicio;
  }

  // ---------- Urgencias del bot (las funciones exigen is_admin()) ----------
  async urgencias(f: FiltrosUrgencias): Promise<Urgencia[]> {
    return this.datos(
      await this.sb.rpc('admin_urgencias', { p_vista: f.vista, p_busqueda: f.busqueda.trim() || null, p_atencion: f.atencion || null }),
    ) as Urgencia[];
  }

  async resumenUrgencias(): Promise<ResumenUrgencias> {
    return this.datos(await this.sb.rpc('admin_urgencias_resumen')) as ResumenUrgencias;
  }

  async cambiarEstadoUrgencia(id: number, estadoActual: EstadoSolicitud, estado: EstadoSolicitud): Promise<void> {
    this.verificar(
      this.datos(
        await this.sb.rpc('admin_cambiar_estado_urgencia', { p_id: id, p_estado_actual: estadoActual, p_estado: estado }),
      ) as RespuestaRpc,
    );
  }

  /** Agrega una nota de seguimiento (con fecha y autor, los pone la base de datos) y devuelve todas. */
  async agregarNotaUrgencia(id: number, nota: string): Promise<string[]> {
    const r = this.datos(await this.sb.rpc('admin_agregar_nota_urgencia', { p_id: id, p_nota: nota })) as RespuestaRpc & { notas: string[] };
    this.verificar(r);
    return r.notas;
  }

  // ---------- Especialista (solo sobre sus propias citas; lo exige la base de datos) ----------
  async registrarAsistenciaPropia(id: string, estado: Extract<EstadoCita, 'asistida' | 'no_asistio'>): Promise<void> {
    this.verificar(this.datos(await this.sb.rpc('my_set_attendance', { p_appointment_id: id, p_status: estado })) as RespuestaRpc);
  }

  async cancelarCitaPropia(id: string, motivo: string): Promise<void> {
    this.verificar(this.datos(await this.sb.rpc('my_cancel_appointment', { p_appointment_id: id, p_reason: motivo.trim() || null })) as RespuestaRpc);
  }

  async miAgenda(desdeIso: string, hastaIso: string): Promise<CitaEspecialista[]> {
    return this.datos(await this.sb.rpc('my_agenda', { p_from: desdeIso, p_to: hastaIso })) as CitaEspecialista[];
  }

  async miDashboard(): Promise<ResumenEspecialista> {
    return this.datos(await this.sb.rpc('my_dashboard')) as ResumenEspecialista;
  }
}
