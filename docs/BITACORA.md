# Bitácora del proyecto – Agenda de citas Fundación Social Opciones

Registro corto de lo que se va creando. Más reciente abajo.

## Decisiones acordadas
| Tema | Decisión |
|---|---|
| Sede | Una. No se controlan consultorios; los solapamientos se impiden por especialista |
| Especialistas | 1 por especialidad (el modelo admite varios) |
| Cita | Bloques de 60 min, sin descansos. Zona horaria America/Bogota; `timestamptz` |
| Estados | `confirmada` (ocupa agenda), `cancelada`, `asistida`, `no_asistio` |
| Chatbot | Mínimo 2 h de antelación, máximo 30 días; 1 cita activa por paciente y especialidad |
| Paciente | Tipo y n.º de documento (identifica), nombres, apellidos; teléfono solo contacto |
| Stack | Angular 22.2 (Node 24.22 LTS), Angular Material, Supabase, FullCalendar 7 (MIT) |
| Admin inicial | fundacionsocialopciones2@gmail.com (se identifica por id de usuario; el correo puede cambiarse) |

## Supabase
Proyecto: `chatbot-fundacion` (ref `mibnstzninkpzmlrvlro`, `us-east-1`, plan Free).
Cuenta: fundacionsocialopciones2@gmail.com. Migraciones en [supabase/migrations](../supabase/migrations).

| # | Migración | Qué crea |
|---|---|---|
| 01 | tablas_base | `profiles`, `specialties`, `specialists`, `specialist_specialties`, `patients`, `weekly_schedules`, `time_blocks`, `appointments`, `audit_log`; restricciones EXCLUDE anti-solapamiento |
| 02 | rls_permisos | RLS en todas las tablas, `is_admin()`, `my_specialist_id()`, privilegios mínimos |
| 03 | agenda_nucleo | Esquema interno `agenda`: `free_slots`, `availability`, `book`, `cancel`, `reschedule`, `upsert_patient` |
| 04 | rpc_publicas | `admin_*` (admin), `my_agenda` (especialista), `bot_*` (solo service_role) |
| 05 | conflictos_auditoria | Triggers que impiden cambios de horario/bloqueo/desactivación con citas futuras (SQLSTATE `AG409`); auditoría sin PII; guard de roles |
| 06 | datos_iniciales | 4 especialidades, 4 especialistas y sus horarios |
| 07 | fix_trigger_conflictos | Corrección hallada por las pruebas |
| 08 | rpc_horarios_y_estado | Columna `profiles.email`; RPC atómicas `admin_set_weekly_schedule`, `admin_save_block`, `admin_set_specialist_active` (ejecutada a mano en el SQL Editor; no figura en el historial de migraciones) |

Pruebas: [supabase/tests/01_permisos_agenda.sql](../supabase/tests/01_permisos_agenda.sql) → 33/33 OK (se revierte con ROLLBACK). Las 6 pruebas de la migración 08 también pasaron (conflicto AG409 con ids, bloqueo, desactivación, no-admin); falta guardarlas como archivo.

### Edge Functions
| Función | JWT | Qué hace |
|---|---|---|
| `admin-users` | Sí | Solo administradores (verificado en servidor con `is_admin`). Acciones: `create_specialist` (invita por correo y crea perfil, especialista y especialidades; si algo falla revierte), `change_email`, `set_active` (activa/desactiva; si hay citas futuras responde 409 con los ids; además bloquea/desbloquea el acceso en Auth). Probado: sin token y con la clave pública responde 401. |

Código en [supabase/functions/admin-users](../supabase/functions/admin-users/index.ts).

## Frontend (carpeta `web/`)
Angular 22.2 · Node 24.22 · Material 22 · Signal Forms · FullCalendar 7 (MIT) · Vitest. Compila sin errores (`ng build`).

| Pantalla | Ruta | Rol |
|---|---|---|
| Iniciar sesión / Recuperar / Crear contraseña | `/ingresar`, `/recuperar`, `/restablecer` | público |
| Agenda con filtros, nueva cita, cancelar, reprogramar, asistencia | `/admin/agenda` | admin |
| Especialistas (crear, editar, activar/desactivar, enviar enlace) | `/admin/especialistas` | admin |
| Horarios semanales y bloqueos (con detección de conflictos) | `/admin/horarios` | admin |
| Calendario mensual/semanal/diario + lista (móvil) | `/mi-agenda` | especialista |

Diseño: minimalista, azul y amarillo del logo, textos en español, hora de Bogotá, estados de carga/vacío/error/conflicto.
Código: `core/` (modelos, sesión, guards, acceso a datos), `shared/` (marco, estados, selector de cupos), `features/`.

### Notas
- La tabla `documentos_fundacion` y la función `match_documentos` ya existían (no son de este sistema). Se activó RLS en `documentos_fundacion` (sin políticas: solo `service_role` accede).
- Los avisos del linter "SECURITY DEFINER ejecutable por authenticated" son intencionales: cada función `admin_*` verifica `is_admin()` dentro.

### Primer administrador y primera prueba
- Usuario creado en Auth (fundacionsocialopciones2@gmail.com) y perfil `admin` asignado por SQL.
- Error hallado al ingresar: «Tu cuenta no está habilitada». Causa: condición de carrera en `AuthService` (el evento de Supabase y el inicio de sesión cargaban el perfil a la vez). Corrección: las cargas de sesión se encolan. Ingreso verificado por el usuario.

## Pendiente
- Probar en el navegador el resto de pantallas (especialistas, horarios, agenda, calendario) y corregir lo que aparezca.
- Edge Function `bot-api` (contrato para n8n) y pruebas de concurrencia real con solicitudes paralelas.
- Pruebas unitarias del frontend (Vitest) y revisión de accesibilidad.
- Documentación de instalación e integración con n8n.
- Quitar una especialidad a un especialista con citas futuras de esa especialidad aún no se valida.
- Revisión jurídica (Ley 1581): transferencia internacional (Supabase `us-east-1`, OpenAI, n8n), autorización de datos, retención.
