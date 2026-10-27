# `features/admin/` — administrator screens

Routes: `/admin/agenda`, `/admin/especialistas`, `/admin/horarios`. Every write goes through `AgendaApi` and is re-validated by Postgres; the screen only presents results.

- **Conflicts:** changing weekly hours, saving a block or deactivating a specialist can fail with `ErrorConflicto` (future confirmed appointments would be stranded). Catch it and call `mostrarConflictos()` (`conflictos.ts`), which lists the affected appointments. Never cancel appointments to make a change pass.
- **Weekly schedule:** the editor replaces the whole week with one `admin_set_weekly_schedule` call. Do not delete + insert from the client: the deferred conflict check would reject the intermediate state. Client-side validation (overlaps, end > start) is only a convenience.
- **Blocks:** `formulario-bloqueo.ts` converts "all day" ranges to `[00:00, next day 00:00)` in Bogotá time; notes must not contain health data.
- **Creating specialists** (`formulario-especialista.ts`) calls the `admin-users` Edge Function (invite by email → the person sets their own password at `/restablecer`). New specialists have no hours until configured in Horarios, so they offer no slots.
- **Known gaps:** the modal only creates *new* specialists; seeded specialists without a user cannot be granted access from the UI (the Edge Function's `change_email` returns 404 for them), they are linked by SQL. Removing a specialty from a specialist with future appointments of that specialty is not validated.
- **New appointment** (`nueva-cita.ts`): patients are identified by document type + number (phone is contact only and may repeat); an existing patient's names are shown and never overwritten; the "autorización de datos" checkbox is required. `selector-cupos.ts` shows the real free slots (via `admin_free_slots`) in 14-day windows and keeps the dialog's choice as an ISO instant.
- Dialogs are one component per file (`nueva-cita`, `reprogramar-cita`, `cancelar-cita`); reschedule is atomic server-side, so a failed new slot leaves the original appointment untouched.
