# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Appointment-scheduling system for Fundación Social Opciones (Colombia). Two channels share one source of truth: an Angular admin/specialist dashboard (`web/`) and a WhatsApp chatbot (n8n, outside this repo) that calls Supabase. The user communicates in Spanish; UI text, domain identifiers and docs are in Spanish.

## Core principle

Business rules (availability, booking, cancel/reschedule, conflict detection, permissions) live **only in Postgres** (`supabase/`). Angular and n8n are thin clients that call RPCs; never re-implement a rule in a client.

## Memory hierarchy

Nested `CLAUDE.md` files hold area-specific guidance and load when you work in that folder. Read the one for the area before editing it.

| Area | File |
|---|---|
| Frontend (commands, stack, conventions) | `web/CLAUDE.md` |
| Data access, errors, time handling | `web/src/app/core/CLAUDE.md` |
| Session and guards | `web/src/app/core/auth/CLAUDE.md` |
| Idle logout | `web/src/app/core/inactividad/CLAUDE.md` |
| Admin screens (conflicts, schedules, dialogs) | `web/src/app/features/admin/CLAUDE.md` |
| Specialist calendar (FullCalendar 7) | `web/src/app/features/especialista/CLAUDE.md` |
| Database architecture, MCP workflow, chatbot engine | `supabase/CLAUDE.md` |
| Migration workflow | `supabase/migrations/CLAUDE.md` |
| SQL test scripts | `supabase/tests/CLAUDE.md` |
| Edge Function `admin-users` | `supabase/functions/admin-users/CLAUDE.md` |

## Project-wide conventions

- Keep `docs/BITACORA.md` updated with every change (the user asked for this explicitly): what was created in Supabase, decisions, verification results and pending items. Pending decisions are tracked at its end.
- `web/src/environments/environment.ts` intentionally contains the Supabase URL and **publishable** key (public by design, safe in source code with RLS on). Secret keys never go in the repo; `.gitignore` also blocks n8n exports (`Chatbot*.json`, `*workflow*.json`) because they embed keys.
- The GitHub repo (`fundacionsocialopciones2-design/agenda-citas-fundacion`, private) belongs to a different account than the one logged into VS Code. The user pushes manually with `git -c credential.helper= push` and a personal access token; the local repo sets `user.name`/`user.email` for the foundation account. Never ask for or handle the token.
- Do not change things the user did not ask for (specialist schedules, bot menu mappings, other people's `bot_*` code); ask first and record the open question in the bitácora.
