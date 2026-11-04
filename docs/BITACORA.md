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
| Cursos del chatbot e inscritos (filtros por categoría, curso, estado y nombre/documento) | `/admin/cursos` | admin |
| Asesorías jurídicas y generales y sus solicitudes (mismos filtros) | `/admin/asesorias` | admin |
| Dashboard (inicio del especialista): cifras, próxima cita, por cerrar, hoy, gráficos | `/mi-panel` | especialista |
| Calendario mensual/semanal/diario + lista (móvil) | `/mi-agenda` | especialista |

Diseño: minimalista, azul y amarillo del logo, textos en español, hora de Bogotá, estados de carga/vacío/error/conflicto.
Código: `core/` (modelos, sesión, guards, acceso a datos), `shared/` (marco, estados, selector de cupos), `features/`.

### Notas
- La tabla `documentos_fundacion` y la función `match_documentos` ya existían (no son de este sistema). Se activó RLS en `documentos_fundacion` (sin políticas: solo `service_role` accede).
- Los avisos del linter "SECURITY DEFINER ejecutable por authenticated" son intencionales: cada función `admin_*` verifica `is_admin()` dentro.

### Primer administrador y primera prueba
- Usuario creado en Auth (fundacionsocialopciones2@gmail.com) y perfil `admin` asignado por SQL.
- Error hallado al ingresar: «Tu cuenta no está habilitada». Causa: condición de carrera en `AuthService` (el evento de Supabase y el inicio de sesión cargaban el perfil a la vez). Corrección: las cargas de sesión se encolan. Ingreso verificado por el usuario.

### Verificación contra la base real (20 oct)
- Coinciden con las migraciones: 9 tablas propias con RLS, restricciones EXCLUDE (citas y horarios), 16 políticas, funciones `admin_*`/`my_agenda`/`bot_*` con permisos correctos, triggers de bloqueo/conflicto/auditoría, esquema `agenda` sin acceso para ningún rol, Edge Function `admin-users` v1.
- Datos actuales: 4 especialidades, 4 especialistas (0 con usuario), 8 franjas, 1 perfil (admin), 2 pacientes y 2 citas de prueba.
- **Apareció código que no creó este proyecto:** tablas `bot_config`, `bot_nodos`, `bot_sesiones`, `bot_mensajes`, `bot_inscripciones`, `bot_solicitudes_cita` y funciones `bot_responder`, `bot_formulario`, `bot_form_guardar`, `bot_horarios_disponibles`, etc. (motor de chatbot por menús dentro de Postgres).
- **Lógica duplicada:** `bot_horarios_disponibles` recalcula disponibilidad (por defecto 21 días y 2 h; no 30 días) y `bot_form_guardar` inserta directo en `appointments`, sin pasar por `agenda.book` (sin regla de una cita activa por paciente/especialidad, sin el bloqueo por especialista, clave de idempotencia aleatoria). La restricción EXCLUDE y los triggers de conflicto sí protegen contra solapamientos. Decisión pendiente: unificarlas con `bot_availability`/`bot_book_appointment`.
- Aviso de seguridad de Auth: protección contra contraseñas filtradas desactivada.

### Unificación de reglas del chatbot (20 oct) — migración 09
- Aprobado por el usuario. Se reemplazaron solo 2 funciones del motor de menús; menús, textos y formulario no cambian:
  - `bot_horarios_disponibles` → ahora usa `agenda.availability` (misma disponibilidad del dashboard). `bot_config` solo puede ser más estricta (mín. 2 h, máx. 30 días; hoy 21 días).
  - `bot_form_guardar` → reserva con `bot_book_appointment`: idempotente (clave estable `wa-` + hash de teléfono, especialista y hora), una cita activa por paciente/especialidad, bloqueo por especialista, solo `confirmada` ocupa agenda. Si el horario se ocupó, vuelve a ofrecer fechas; si ya tiene cita activa, lo informa; si hay datos inválidos o error, deja una solicitud en `bot_solicitudes_cita` con el motivo.
- Respaldo para revertir: [supabase/backups/20261020_bot_funciones_originales.sql](../supabase/backups/20261020_bot_funciones_originales.sql).
- Pruebas: 12/12 OK (ventana, paridad con la agenda, reserva, reintento sin duplicar, cupo visible para el dashboard, una cita activa, horario tomado, datos inválidos, inscripciones, `bot_responder`). Revertidas con ROLLBACK.
- Seguridad: la clave `sb_secret_` estaba escrita en el nodo HTTP de n8n (y quedó expuesta en la conversación). Debe rotarse y guardarse como credencial.

### Chatbot sin agenda: informa en vez de pedir «día y horario» (20 oct) — migración 10
- Antes de pedir ningún dato personal, `bot_form_iniciar` revisa si el servicio tiene agenda y horarios. Si no, **informa y no abre el formulario**; la persona sigue en el menú (pie «0 Volver · menu»).
  - Servicio sin especialidad enlazada (hoy: Optometría, Salud mental, Fisioterapia): «ℹ️ Por este chat todavía no es posible agendar *{servicio}*.»
  - Especialidad sin horarios libres: «😕 Por ahora no hay horarios disponibles para *{servicio}*. La agenda se actualiza con frecuencia: intenta de nuevo más adelante.»
  - Textos editables en `bot_config`: `mensaje_sin_agenda` y `mensaje_sin_horarios`.
- Se eliminó el paso «¿Qué día y horario prefieres?» y ya no se promete que la fundación se comunicará. Si una reserva falla por un error inesperado, el bot dice «No pudimos agendar tu cita en este momento…» y deja constancia en `bot_solicitudes_cita`.
- Respaldo: [supabase/backups/20261020_bot_formulario_originales.sql](../supabase/backups/20261020_bot_formulario_originales.sql). Pruebas: [04_bot_sin_agenda.sql](../supabase/tests/04_bot_sin_agenda.sql), 9/9 OK.
- Hallazgo para decidir: los servicios dentales Implantología, Endodoncia, Periodoncia, Higiene oral, Odontopediatría, Laboratorio y Diseño de sonrisa se agendan como «Odontología general» (Dr. Jorge Riveros). Cambiarlo se hace en `bot_nodos.especialidad`.

### Sin registro de fallos (20 oct) — migración 11
- A pedido de la fundación, `bot_form_guardar` **ya no escribe nada** cuando una reserva falla: el paciente recibe «No pudimos agendar tu cita en este momento…» y no se guarda ningún registro (esto reemplaza lo anotado en la migración 10 sobre `bot_solicitudes_cita`).
- Verificado (5/5): el fallo avisa, no guarda registro, no crea cita ni paciente; la reserva normal sigue funcionando.
- `bot_solicitudes_cita` ya no recibe filas. Solo `bot_form_guardar` la usaba (ninguna vista, llave ni política depende de ella). Contiene **1 fila anterior** (Optometría, «21 de octubre 10 am», del flujo viejo de preferencia, con teléfono y documento). Pendiente: decidir si se elimina la tabla.

### Tabla `bot_solicitudes_cita` eliminada (20 oct) — migración 12
- La eliminó el usuario a mano en el SQL Editor (`drop table public.bot_solicitudes_cita;`). Verificado: la tabla ya no existe y ninguna función la menciona. Tablas `bot_*` restantes: `bot_config`, `bot_inscripciones`, `bot_mensajes`, `bot_nodos`, `bot_sesiones`.
- Con la tabla ausente, la reserva por el bot, el aviso de fallo y `bot_responder` funcionan (3/3 OK, revertido).
- Estructura (sin datos) respaldada en [supabase/backups/20261020_bot_solicitudes_cita_estructura.sql](../supabase/backups/20261020_bot_solicitudes_cita_estructura.sql). Como la migración 12 se ejecutó a mano, no figura en el historial de Supabase.

### Cierre de sesión por inactividad (20 oct) — frontend
- **15 minutos** sin actividad cierran la sesión; **aviso 60 s antes** con cuenta regresiva y «Continuar sesión» / «Cerrar sesión». Configurable en `environment.ts` (`inactividad`).
- Código: [core/inactividad.service.ts](../web/src/app/core/inactividad.service.ts), [shared/aviso-inactividad.ts](../web/src/app/shared/aviso-inactividad.ts); `AuthService` (cierre local y `sesionPerdida`), `App` (arranque y redirección) e `Ingresar` (mensaje del motivo).
- Decisiones de diseño: compara marcas de tiempo (si el equipo se suspende, al volver cierra de inmediato); la última actividad se comparte entre pestañas por `localStorage` (solo un número); no cuenta el movimiento del ratón; durante el aviso solo «Continuar» extiende; al cerrar se cierran todos los diálogos; `signOut` local (no cierra otros dispositivos); si la sesión se pierde por otra causa (otra pestaña, expiración) se redirige al ingreso; sin sesión no hay oyentes ni temporizadores.
- Pruebas unitarias (Vitest, reloj simulado): 9/9 OK. Hallazgo corregido: el vigilante reintentaba el cierre cada segundo si no cambiaba la sesión; ahora actúa una sola vez por sesión y el cierre local nunca lanza error.
- Límite conocido: es una capa del cliente. La caducidad de sesión del servidor (tiempo máximo e inactividad en Supabase Auth) requiere el plan Pro.

### Nuevas especialidades (21 oct) — migración 13
- Según el cuadro de servicios de la fundación se agregaron 7 especialidades: Endodoncia, Periodoncia, Odontopediatría, Psicología, Fisioterapia, Optometría y Fonoaudiología (60 min). Aparecen solas en el modal «Nuevo especialista» (se leen de la tabla `specialties`).
- Sin especialistas activos no ofrecen cupos y el chatbot no las lista (verificado: sigue ofreciendo las 4 anteriores).
- Diferencias entre el cuadro y lo configurado, **pendientes de decidir**: Dr. Darío Campos figura L–V 8:00–17:00 con citas de **3 horas** (hoy: sábados 9–12, 60 min); hay citas «a domicilio» (Dr. Guerra, Fisioterapia), que el modelo no contempla; «Sede Chapinero» y «Sede Fundación» comparten dirección; faltan los nombres de Fisioterapia, Optometría y Fonoaudiología; 5 especialistas del cuadro aún no están creados (Sergio Rodríguez, Clemencia Vaquero, María, Camilo Alemán, Orquídea Chaparro).

### Acceso del primer especialista de prueba (21 oct)
- Usuario creado por el administrador en Supabase Auth (correo de prueba con alias `+prueba` de la cuenta de la fundación, confirmado, contraseña elegida por el administrador) y enlazado por SQL a **Dr. Darío Campos**: perfil con rol `especialista` y `specialists.profile_id`. No se duplicó el especialista.
- Verificado simulando su sesión (solo lectura): no es administrador; ve únicamente su registro, su perfil, su horario y sus citas; no puede leer la tabla de pacientes. Pendiente: que el usuario lo pruebe en el navegador (calendario).
- El correo definitivo del médico se cambia después desde «Editar especialista».

### Mejoras al calendario del especialista (22 oct) — frontend
- **Lista:** ya no usa la vista semanal de FullCalendar. Es una lista propia con **todas las citas próximas** (confirmadas, desde hoy y hasta ~13 meses; incluye la que está en curso), de la más cercana a la más lejana, sin agrupar por día. Muestra «Próxima», «Hoy»/«Mañana», total de citas, «Actualizar», estados de carga/vacío/error y «Ver detalle». En móvil las filas se apilan como tarjetas. Código: `features/especialista/lista-citas.ts`, `core/citas.util.ts`.
- **Título del mes/semana/día:** barra propia con título grande (hasta 2.4 rem), botones anterior/Hoy/siguiente con etiquetas accesibles y anuncio del periodo (`aria-live`). Se oculta la barra de FullCalendar.
- **Citas más grandes:** FullCalendar 7 usa nombres de clase cifrados (no se pueden estilizar con CSS), así que cada cita usa contenido propio (`eventContent`) con hora, paciente y especialidad en letra de 15 px; en el mes son barras de color sólidas; franjas de 44 px en semana/día; hasta 3 citas por día en el mes; horas en formato 24 h.
- El detalle de la cita pasó a `detalle-cita.ts` (compartido por lista y calendario).
- Cambios de API de FullCalendar 7 hallados al compilar: `slotLabelFormat` → `slotHeaderFormat`; no existe `updateSize()` (se redimensiona solo).
- Pruebas (Vitest): 18/18 OK; nuevas para el orden y filtrado de la lista, estados vacío y de error. **Pendiente: verificación visual en el navegador** (tamaño real de las citas en el mes).

### Especialistas y horarios del cuadro (22 oct) — migración 14
- **Dr. Darío Campos:** horario lunes a viernes 8:00–17:00 y **Cirugía maxilofacial = citas de 180 min** (3 horas, 3 cupos por día: 8–11, 11–14, 14–17). **Se conserva su sábado 9:00–12:00**: tiene una cita futura confirmada (sáb 31 oct 11:00, Johana Galindo Galindo, por WhatsApp) y el sistema no deja quitar el horario sin resolverla. Pendiente: reprogramarla/cancelarla y luego quitar el sábado.
- **5 especialistas creados sin usuario de acceso**, con el horario del cuadro: Dr. Sergio Rodríguez (Endodoncia, L–V 8–17), Dra. Clemencia Vaquero (Periodoncia, L–V 8–17), Dra. María (Odontopediatría, L–V 8–17), Camilo Armando Alemán Herrera y Orquídea Chaparro (Psicología, L–S 8–17). Nombres tal como figuran en el cuadro (se escribió «María» con tilde).
- Verificado: cada especialidad ofrece cupos con su especialista (próximos 14 días: Endodoncia 90, Periodoncia 90, Odontopediatría 90, Psicología 216, Cirugía 31…). Fisioterapia, Optometría y Fonoaudiología siguen sin especialista (faltan nombres) y sin cupos.
- **Pendiente de decisión:** los menús del chatbot de Endodoncia, Periodoncia y Odontopediatría siguen enlazados a «Odontología general» (Dr. Riveros), y «Salud mental» no está enlazado a ninguna especialidad (`bot_nodos.especialidad`). Citas a domicilio (Dr. Guerra, Fisioterapia): el modelo no las contempla.

### Revisión de estructura, estado y configuración (26 oct)
- **Estructura de carpetas** revisada contra la «Angular coding style guide» (v22, consultada por el MCP de Angular): organizar por áreas funcionales, un concepto por archivo, sin nombres genéricos (`utils.ts`), pruebas junto al código. Correcciones (con `git mv`, historial conservado; compila y 18/18 pruebas OK):
  - `shared/util.ts` → `shared/eventos-formulario.ts`; `core/citas.util.ts` → `core/proximas-citas.ts` (+ spec).
  - `core/` agrupado por tema: `core/auth/` (sesión y guards), `core/inactividad/` (servicio y aviso).
  - Archivos de un solo uso movidos a su área: `acceso.ts` → `features/acceso/`; `selector-cupos.ts` y `conflictos.ts` → `features/admin/`; `marco.ts` → `layout/`.
  - `dialogos-cita.ts` (3 componentes) → `nueva-cita.ts`, `reprogramar-cita.ts`, `cancelar-cita.ts`.
- **Gestión de estado:** señales de Angular (`signal`, `computed`, `effect`, `input`); RxJS no se importa en el código de la app (solo `.subscribe` sobre `afterClosed()` de los diálogos de Material); las llamadas a Supabase son Promesas con `async/await`; sin NgRx ni otra librería de estado.
- **Clave en `environment.ts`:** es la clave *publishable* (pública por diseño; la documentación de Supabase la declara segura para el código fuente y el navegador si hay RLS). Se revisó todo el historial de Git (3 commits): no hay claves secretas ni JWT. Mejora recomendada al pasar a producción: entornos separados (`ng generate environments`) con `fileReplacements` y valores de producción inyectados en el despliegue.

### Jerarquía de memoria (`CLAUDE.md`) (26 oct)
- El `CLAUDE.md` general se dividió por ámbito: raíz (principio, índice y convenciones del proyecto), `web/`, `web/src/app/core/` (+ `auth/`, `inactividad/`), `web/src/app/features/admin/`, `web/src/app/features/especialista/` (FullCalendar 7), `supabase/` (arquitectura de la base y motor del chatbot), `supabase/migrations/`, `supabase/tests/` y `supabase/functions/admin-users/`. Los subniveles se cargan solo al trabajar en esa carpeta. Al cambiar el comportamiento de un área, actualizar el `CLAUDE.md` de esa carpeta.

### `web/CLAUDE.md` completado y verificación de TypeScript (26 oct)
- Se llenó la plantilla (Comandos, Stack, Arquitectura, Estructura, Convenciones) con datos reales; se verificó que solo 3 archivos tocan Supabase (capas respetadas).
- **TypeScript estricto:** el `tsconfig.json` no declaraba `strict`; se comprobó que TypeScript 6.0.3 lo aplica por defecto (rechaza `any` implícito y `null` sin comprobar) y se dejó `"strict": true` explícito. `tsc` de app y de specs sin errores.
- **Build de producción** (no se había ejecutado antes): compila; el bundle inicial pesa 733 kB (169.9 kB comprimido) y supera el aviso de 500 kB (el límite de error es 1 MB). Pendiente opcional: reducir el bundle inicial.

### Subagente `security-reviewer` (27 oct)
- Creado en `.claude/agents/security-reviewer.md` (modelo sonnet). Herramientas: Read, Glob, Grep, Bash y 5 del MCP de Supabase de solo lectura (`get_advisors`, `list_tables`, `list_migrations`, `list_edge_functions`, `get_edge_function`). Revisa: autenticación/RBAC, secretos, validación de entradas, límites y abuso, CORS/configuración, fugas de datos en errores (prioridad máxima) y sesión. Informe por hallazgo con ubicación, severidad, categoría OWASP, escenario y arreglo.
- Límites conocidos: «solo lectura» es una instrucción (Bash no se puede restringir por herramienta); sin `execute_sql` no puede leer políticas RLS ni GRANT en vivo (los lee de las migraciones). Quedaron fuera a propósito la minimización de datos personales y la inyección SQL explícitas.
- Hallazgo abierto que debe reportar: la clave `sb_secret_` escrita en el nodo de n8n (pendiente de rotar).

### Primera revisión de seguridad completa (27 oct) — agente `security-reviewer`
- Alcance: 14 migraciones, 3 respaldos, Edge Function (código desplegado = repositorio), `web/src`, árbol de trabajo e historial de git (6 commits, sin secretos), contrastado en vivo (advisors, RLS activo, migraciones, función desplegada). `npm audit --omit=dev`: 0 vulnerabilidades.
- **Resultado: 1 Critical (ya conocido, fuera del repo), 0 High, 4 Medium, 7 Low.** Autorización en base de datos, Edge Function y escalada de rol: sin hallazgos.
- Critical: clave `sb_secret_` en un nodo de n8n (rotar y mover a credencial/Edge Function). Medium: (1) el bot revela que un documento tiene cita activa y `upsert_patient` sobrescribe el teléfono de un paciente existente; (2) sin límite de reservas por teléfono; (3) `bot_mensajes`/`bot_sesiones` guardan datos personales sin retención y `bot_responder` no está en el repo; (4) la inscripción a cursos no captura excepciones. Low: contraseñas filtradas desactivadas; `APP_URL`/`ALLOWED_ORIGINS` por defecto a localhost; registro público de usuarios posiblemente activo; sin CSP/cabeceras (hosting sin definir); `ErrorApi.detalle`/`mensajeDeError` conservan el mensaje crudo; 4 funciones ajenas sin `search_path`; el MCP de Supabase del agente no es de solo lectura por configuración.
- No verificado: políticas RLS y GRANT en vivo, código de `bot_responder`, flujo de n8n (firma de Meta, límites, retención), configuración de Auth, secretos de la función desplegada, hosting.
- Decisiones pendientes del usuario: cuáles correcciones aplicar (ver el resumen de la conversación).

### Correcciones del informe de seguridad (27 oct) — migración 15 y frontend
- **Teléfono (Medium):** el bot ya no sobrescribe el teléfono ni los nombres de un paciente existente (`agenda.upsert_patient_desde_bot`); el panel del administrador sí puede actualizar el teléfono (`agenda.upsert_patient` sin cambios).
- **Confirmación de cita ajena (Medium):** el bot responde el mismo texto ante cualquier fallo («No pudimos agendar tu cita… Si ya tienes una cita en este servicio y necesitas cambiarla… comunícate con la fundación»); ya no afirma que el documento tenga cita activa.
- **Límite por teléfono (Medium):** máximo **2 citas activas** (confirmadas y futuras) por número de WhatsApp. Se cuenta con un hash SHA-256 del número en `agenda.reservas_por_telefono` (esquema interno, sin acceso de la API), con bloqueo consultivo por número; cancelar libera cupo; un reintento idempotente no cuenta; reprogramar conserva el origen. El teléfono pasó a ser obligatorio para reservar por el bot. Límite = constante `c_max_por_telefono` en `bot_book_appointment`.
- **Intento fallido sin datos:** una reserva rechazada ya no deja al paciente creado (se revierte con un sub-bloque).
- **Inscripción a cursos (Medium):** captura errores y responde un mensaje amable sin detalle de Postgres.
- **Frontend (Low):** `ErrorApi` ya no guarda el mensaje crudo (se eliminó `detalle`) y `mensajeDeError()` solo muestra mensajes de `ErrorApi`; el resto, un texto fijo.
- Verificado: suite nueva `supabase/tests/05_endurece_canal_whatsapp.sql` 19/19 OK; regresión de las suites 03, 04 y las secciones afectadas de la 01: 20/20 OK (se actualizaron dos expectativas de las pruebas 01 y 03 por el cambio de comportamiento); frontend 23/23 pruebas, con `errores.spec.ts` nuevo. Versiones anteriores de las funciones: migraciones 03, 04 y 11.
- Sin cambiar a propósito: retención de `bot_mensajes`/`bot_sesiones` y el código de `bot_responder` (dependen del dueño del motor), configuración de Auth y de n8n (acciones del usuario).

### Teléfono del paciente visible para el especialista (28 oct) — migración 16
- **Decisión del responsable del proyecto:** el especialista ve el teléfono de contacto del paciente en el detalle de su cita (antes se ocultaba por minimización). `my_agenda` ahora devuelve `patient_phone`, solo de las citas del propio especialista.
- Migración 16 (recrea la función: `drop` + `create`): el MCP devolvió «declined» y el usuario la ejecutó a mano en el SQL Editor; verificada. Esa versión mostraba el teléfono solo en citas confirmadas.
- Migración 17 (28 oct): a pedido del usuario, el teléfono llega en **todas** las citas del especialista (confirmadas, asistidas, no asistidas y canceladas). Solo cambia el cuerpo (`create or replace`, aplicada por el MCP; permisos conservados).
- Verificado con `supabase/tests/06_my_agenda_telefono.sql`: 7/7 OK (teléfono en todas las citas propias, NULL si no hay, ninguna cita ajena, administrador y `anon` sin acceso).
- Frontend (27/27 pruebas): el detalle muestra el teléfono como enlace `tel:` y «No registrado» si no hay. La lista de próximas citas no lo muestra.
- Punto para revisión jurídica (Ley 1581): confirmar que el especialista necesita este dato también en citas pasadas.

### El especialista marca asistencia y cancela sus propias citas (28 oct) — migración 18
- **Decisión del responsable del proyecto:** cada especialista puede registrar «Asistió»/«No asistió» y cancelar citas, **solo de sus propios pacientes**.
- Migración 18 (aplicada por el MCP): `agenda.set_attendance` (misma lógica para administración y especialista), `my_set_attendance` y `my_cancel_appointment` (verifican `my_specialist_id()`; una cita ajena responde `not_found`, sin revelar que existe), y `admin_set_attendance` pasa a usar la misma función. Permisos: solo `authenticated` y `service_role`.
- Reglas en la base: asistencia solo en citas `confirmada` que ya empezaron (`not_started` si no); estado final no reversible; cancelar solo citas futuras (`in_past`). La cancelación libera el cupo y queda en `audit_log` con el actor.
- Verificado con `supabase/tests/07_especialista_gestiona_citas.sql`: 16/16 OK (propias sí, ajenas `not_found`, administrador no usa `my_*`, especialista no usa `admin_*`, `anon` denegado).
- Frontend: el detalle ofrece «Asistió»/«No asistió» (con confirmación) si la cita ya empezó y «Cancelar cita» (motivo opcional) si aún no; calendario y lista se recargan solos. Compilación correcta y 39/39 pruebas (nuevas: `detalle-cita.spec.ts` ampliado y `cancelar-cita-propia.spec.ts`).
- Límites conocidos: un clic equivocado en asistencia no se puede corregir desde la interfaz (solo por SQL); al cancelar, el paciente **no recibe aviso automático** (el diálogo lo advierte).
- Punto para revisión jurídica (Ley 1581): confirmar que el especialista puede cancelar citas sin pasar por administración.

### Dashboard del especialista y menú lateral (28 oct) — migración 19 y frontend
- **Decisiones del responsable del proyecto:** nueva pestaña «Dashboard», primera del especialista y su pantalla de inicio; tarjetas Hoy, Semana (lunes a domingo), Mes, Canceladas e Inasistencia, más próxima cita, citas por cerrar, citas de hoy, gráfico por día y estado del mes. Menú lateral izquierdo para ambos roles. La validación de la cédula en el chatbot queda en espera.
- Criterio acordado: «citas» = confirmadas + asistidas + no asistió; las canceladas se cuentan aparte. Inasistencia = no asistió / (asistidas + no asistió) del mes; sin citas resueltas se muestra «—».
- Migración 19 (aplicada por el MCP): `agenda.dashboard(especialista, instante)` hace todos los cálculos en hora de Colombia; `public.my_dashboard()` la expone solo al especialista (su propio id, hora actual). Permisos: `authenticated` y `service_role`; administrador → `forbidden`; `anon` sin acceso.
- Verificado con `supabase/tests/08_my_dashboard.sql`: 19/19 OK (instante fijo 28-oct 15:00, semana que cruza al 1-nov, canceladas aparte, citas de otro especialista excluidas, próxima cita, por cerrar, inasistencia nula sin datos, permisos).
- Frontend: `features/especialista/panel.ts` (ruta `/mi-panel`, inicio del especialista), `resumen.ts` (solo formato de texto), `AgendaApi.miDashboard()`. Gráficos en HTML/CSS sin librería, con tabla equivalente para lectores de pantalla. Los colores de estado de la app no se distinguen bien entre sí con daltonismo si van juntos; por eso los estados van en filas separadas con nombre y cifra (no se cambiaron los colores).
- `layout/marco.ts`: menú lateral (`mat-sidenav`) para administrador y especialista; en pantallas anchas es fijo y se contrae a íconos (la preferencia se guarda en el navegador), por debajo de 840 px se abre con ☰.
- Compilación correcta y 50/50 pruebas. Pendiente: revisarlo en el navegador.

### Rediseño con profundidad en toda la app (28 oct) — frontend
- **Decisión del responsable del proyecto:** aplicar las seis ideas propuestas para que la interfaz sea menos plana; la profundidad la decidí para **toda la app** (si solo el Dashboard la tuviera, la agenda y las tablas del administrador se verían planas a su lado). Se descartó el 3D literal (biseles, perspectiva) porque cansa y baja el contraste.
- Estilos globales (`styles.scss`): sombra de dos capas con tinte azul, borde más suave, radio de 16 px y elevación al pasar el mouse en tarjetas con acciones (`.tarjeta--accion`, desactivada con «reducir movimiento»). Afecta `.tarjeta`, `.tabla`, `.estado`, el calendario y los diálogos. `marco.ts`: barra y menú con sombra suave, fondo con degradado leve, ítem activo con relieve.
- Dashboard: saludo por nombre y hora de Bogotá; tarjetas de cifras con ícono de color, franja de acento y pastilla de comparación de una línea («+3 vs. ayer»; la frase completa queda para lectores de pantalla); «Próxima cita» como tarjeta protagonista (degradado azul, pastilla amarilla con el tiempo que falta, botones propios); estados vacíos con ícono grande; barras con degradado y el día de hoy en amarillo con contorno; barras de estado más gruesas.
- Accesibilidad: el color nunca es la única pista, los textos conservan contraste AA y el amarillo de las barras lleva contorno oscuro (el amarillo solo no llega a 3:1 sobre blanco).
- Presupuesto de estilos por componente subido a aviso 8 kB / error 12 kB en `angular.json` (el CSS del Dashboard pesa ~5,8 kB). Se tocó una configuración sin que se pidiera expresamente: queda anotado por si se prefiere revertirlo.
- 55/55 pruebas y compilación correcta. **No se ha visto en el navegador:** pendiente la revisión visual (colores, espacios, menú contraído y vista móvil).

### Pestaña «Cursos» del administrador (30 oct) — migración 20 y frontend
- **Decisión del responsable del proyecto:** nueva pestaña «Cursos» para ver todos los cursos y las personas inscritas, con filtros. Pidió revisar primero las tablas y no crear tablas innecesarias.
- Revisión de Supabase: **no existe una tabla de cursos**. El catálogo es el menú del chatbot (`bot_nodos`): los cursos son los nodos tipo `info` bajo las ramas con acción «inscripción» — Cursos de idiomas (8), Cursos de seguridad privada (15, en dos submenús), Primaria y bachillerato por ciclos (2) y Técnicos laborales (5): 30 cursos. Las inscripciones están en `bot_inscripciones` (3 reales al 30 oct, todas «pendiente»), con FK `curso_id → bot_nodos` y copia en texto del título y la categoría. Ambas tablas son del motor del chatbot, con RLS activo y sin políticas.
- Migración 20 (aplicada por el MCP), **sin tablas nuevas y sin tocar las tablas `bot_*`**: `agenda.cursos_catalogo()` (regla del catálogo), `public.admin_cursos()` (catálogo con número de inscritos; incluye «Sin curso vinculado» si un curso se borra del menú) y `public.admin_inscripciones(curso, categoría, estado, búsqueda)` (máx. 500, más recientes primero; búsqueda por nombre o documento sin puntos). Ambas exigen `is_admin()`; especialista → `forbidden`; `anon` sin acceso.
- Verificado con `supabase/tests/09_admin_cursos.sql`: 14/14 OK.
- Frontend: `features/admin/cursos.ts` (catálogo por categoría con contador; clic en un curso filtra sus inscritos), filtros (categoría, curso, estado, nombre o documento), tabla que se apila en móvil y `detalle-inscripcion.ts` con toda la información (documento, WhatsApp, teléfono de contacto, correo, ciudad, dirección, modalidad, fecha de autorización de datos). 64/64 pruebas y compilación correcta. Pendiente: revisarlo en el navegador.
- Solo lectura: el estado de la inscripción (pendiente, contactado, matriculado, cancelado) se muestra pero no se puede cambiar desde el dashboard.

### Pestaña «Asesorías» del administrador (30 oct) — migración 21 y frontend
- **Decisiones del responsable del proyecto:** una pestaña «Asesorías» con las asesorías jurídicas **y** las generales, filtrables; solo lectura; la solicitud de prueba por WhatsApp la hará él.
- Revisión de Supabase: no hay una tabla propia de asesorías. Los tipos están en el menú del bot (`bot_nodos`): **Asesoría jurídica** → Consultoría legal general, Defensa de derechos humanos, Derechos de petición; **Asesorías generales** → contables, empresariales y financieras, capacitaciones y diplomados, cátedra de la paz, derechos humanos, medios de comunicación alternativos, servicio social y pasantías, y el submenú «Simposios y bienestar empresarial» (3). Las solicitudes van a `bot_solicitudes` (`tipo = 'servicio'`; la misma tabla guarda citas sin agenda y urgencias). Al 30 oct la tabla tiene **0 registros**.
- Migración 21 (aplicada por el MCP), sin tablas nuevas y sin tocar las `bot_*`: `agenda.asesorias_nodos()`, `public.admin_asesorias()` y `public.admin_solicitudes_asesoria(...)`, ambas exigen `is_admin()`. Si el bot guarda la rama en vez del tipo concreto, la solicitud se muestra como «<rama>: sin tipo específico».
- Verificado con `supabase/tests/10_admin_asesorias.sql`: 15/15 OK (incluye que las citas de la misma tabla no aparecen).
- Frontend: `features/admin/asesorias.ts` y `detalle-solicitud.ts` (incluye el texto del caso, la preferencia y las notas). El catálogo agrupado y sus estilos pasaron a ser compartidos con Cursos (`agrupar-catalogo.ts`, clases globales). 73/73 pruebas y compilación correcta. Pendiente: revisarlo en el navegador.
- Punto para revisión jurídica (Ley 1581): el campo «detalle» puede contener información sensible del caso; solo lo ve el administrador.
- Por confirmar con la primera solicitud real: si `bot_solicitudes.servicio_id` guarda el tipo concreto (p. ej. «Derechos de petición») o la rama.

## Pendiente
- Confirmar con la prueba por WhatsApp cómo guarda el bot el tipo de asesoría (`servicio_id`).
- Decidir si el administrador puede cambiar el estado de una solicitud de asesoría y escribir notas (la tabla ya tiene `estado` y `notas`).
- Decidir si el administrador puede cambiar el estado de una inscripción (pendiente → contactado → matriculado / cancelado) desde la pestaña Cursos, y si se necesita exportar los inscritos (por ejemplo a Excel).
- Validación de la cédula en el chatbot (en espera; propuesta: reglas por tipo de documento en Postgres, rechazo de números basura y confirmación en el bot).
- Decidir si se permite corregir una asistencia mal marcada y si el paciente debe recibir aviso por WhatsApp al cancelar el especialista.
- Rotar la clave `sb_secret_` de Supabase (Critical del informe de seguridad)
- Del informe de seguridad, a cargo del usuario en el panel: activar protección de contraseñas filtradas, desactivar el registro público, definir `APP_URL`/`ALLOWED_ORIGINS` de la Edge Function antes de producción y cabeceras CSP al elegir hosting
- Exportar a una migración el motor del chatbot (`bot_*`), que hoy no está en el repositorio.
- Rotar la clave secret de Supabase y pasarla a una credencial de n8n (o usar una Edge Function intermedia).
- Probar en el navegador el resto de pantallas (especialistas, horarios, agenda, calendario) y corregir lo que aparezca.
- Edge Function `bot-api` (contrato para n8n) y pruebas de concurrencia real con solicitudes paralelas.
- Pruebas unitarias del frontend (Vitest) y revisión de accesibilidad.
- Documentación de instalación e integración con n8n.
- Quitar una especialidad a un especialista con citas futuras de esa especialidad aún no se valida.
- Revisión jurídica (Ley 1581): transferencia internacional (Supabase `us-east-1`, OpenAI, n8n), autorización de datos, retención.
