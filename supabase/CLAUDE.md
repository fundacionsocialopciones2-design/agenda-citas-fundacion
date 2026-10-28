# `supabase/` — database, Edge Functions

Project `chatbot-fundacion` (ref `mibnstzninkpzmlrvlro`, us-east-1, **Free plan**), in the foundation's Supabase account. Work goes through the Supabase MCP (`execute_sql`, `apply_migration`, `list_tables`, `get_advisors`, `deploy_edge_function`); there is no local Supabase CLI. If the MCP says it needs re-authentication, ask the user to authorize it again.

## Scheduling architecture

- Schema `agenda` (not exposed; no role has USAGE) holds the one implementation of the rules: `free_slots`, `availability`, `book`, `cancel`, `reschedule`, `upsert_patient`, `conflicting_appointments`. Clients reach it only through `SECURITY DEFINER` wrappers in `public`:
  - `admin_*` for `authenticated` (each checks `is_admin()` inside), `my_agenda` for specialists.
  - `bot_list_specialties`, `bot_availability`, `bot_book_appointment` for `service_role` only (min 2 h notice, 30-day horizon, consent required, idempotency key required).
- All wrappers use `set search_path = ''`; every function revokes `EXECUTE` from `public`/`anon` and grants only what is needed. The linter warning "authenticated can execute SECURITY DEFINER" on `admin_*`/`my_agenda`/`is_admin` is intentional.
- Business outcomes are returned as `jsonb {ok, code, …}` (`slot_unavailable`, `patient_has_active_appointment`, `consent_required`, `idempotency_key_reuse`, …), not exceptions.
- Concurrency: `book`/`reschedule` lock the specialist row (`FOR UPDATE`); `appointments_no_overlap` (EXCLUDE on `tstzrange`, `where status = 'confirmada'`) is the last barrier. Idempotency uses the unique `idempotency_key`; booking takes an advisory lock per patient+specialty.
- Changes that would strand future confirmed appointments (weekly hours, blocks, deactivating a specialist) fail with SQLSTATE **`AG409`** via deferred constraint triggers; DETAIL carries the appointment ids. RPCs that change them run `set constraints all immediate` so the error is raised inside the call and everything rolls back. Cancelling is never implicit.
- Slot length is per specialty (`specialties.slot_minutes`; Cirugía maxilofacial = 180). Weekly hours are local `time` (ISO weekday 1–7, America/Bogota); appointments are `timestamptz`.
- Roles: `profiles.role` is written only server-side (`profiles_guard` trigger + no grants for clients). Specialists link to Auth users through `specialists.profile_id`. `audit_log` is trigger-filled and excludes patient PII. RLS is on for every table.
- Patients are identified by (`document_type`, `document_number`); phone is contact only and may repeat.
- **WhatsApp identity is unverified** (only a document number), so the bot path is hardened (migration 15): `agenda.upsert_patient_desde_bot` never overwrites an existing patient's phone or names (the admin path, `agenda.upsert_patient`, may update the phone); the bot answers every booking failure with the **same text**, so it never confirms that a document has an active appointment; a failed attempt leaves no patient behind (sub-block rolled back with sentinel SQLSTATE `AG499`); the phone number is required; and a number can hold at most **2 active (confirmed, future) appointments** (`c_max_por_telefono` in `bot_book_appointment`; counted through a SHA-256 hash in `agenda.reservas_por_telefono`, serialized with an advisory lock; an idempotent retry does not count; `agenda.reschedule` copies the row to the new appointment).

## Chatbot engine (`bot_*`) — written by another person

A menu-driven bot stored in Postgres: `bot_responder(telefono, mensaje, nombre)` returns `{responder, texto, …}`; n8n only forwards the WhatsApp message and sends back `texto`. State: `bot_nodos` (menu tree; a node's `especialidad` links to `specialties.name`, inherited from ancestors by `bot_heredado`), `bot_config` (texts and limits; editable keys include `mensaje_sin_agenda` and `mensaje_sin_horarios`), `bot_sesiones`, `bot_mensajes`, `bot_inscripciones`. Migrations 09–12 rewired `bot_horarios_disponibles` and `bot_form_guardar` onto the `agenda` logic and removed the "preferred day/time" request and the failure log (`bot_solicitudes_cita` was dropped). This code is **not fully versioned** in `migrations/`; previous definitions are in `backups/`. Do not change the other person's bot code or menu data without the user's approval.

## MCP workflow notes

- Destructive/DDL statements may come back `declined` from the MCP confirmation prompt. Do not retry repeatedly: explain what it does and either ask the user to approve, or give them the one-line SQL to run in the SQL Editor, then verify with a query.
- `execute_sql` returns only the last statement's result: accumulate test results in a temp table and select it last.
- The user's seeded specialists have no login; a specialist is linked by creating the Auth user in the dashboard and then inserting the `profiles` row and setting `specialists.profile_id` via SQL.
