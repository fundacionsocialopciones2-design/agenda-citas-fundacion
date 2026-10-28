# `features/especialista/` — specialist calendar (FullCalendar 7)

Route `/mi-agenda`. Specialists see only their own appointments through `my_agenda` (minimal patient data: name and document, plus the contact **phone on every one of their own appointments**; migrations 16–17, the user's decision). The detail dialog shows the phone as a `tel:` link ("No registrado" if the patient has none). The list view does not show the phone. Cancelled appointments are hidden.

**Actions on their own appointments only** (migration 18, the user's decision): the detail dialog (`detalle-cita.ts`) offers «Asistió»/«No asistió» once the appointment has started (confirmed ones; asks for confirmation because it is irreversible) and «Cancelar cita» (`cancelar-cita-propia.ts`, optional reason) only before it starts. These call `AgendaApi.registrarAsistenciaPropia` / `cancelarCitaPropia` → RPC `my_set_attendance` / `my_cancel_appointment`. The buttons are presentation only: the database re-checks ownership (a foreign id returns `not_found`) and the time rules. The dialog closes with `'actualizada'` and the caller (`mi-agenda.ts`, `lista-citas.ts`) reloads. The patient gets **no automatic notice** on cancel (the dialog says so). In specs, `MatDialogModule` re-provides `MatDialog`, so mock it with `TestBed.overrideComponent(..., { add: { providers } })`.

## FullCalendar 7 quirks

- v7 differs a lot from v6 and most online examples are wrong. Plugins are **subpaths** of `@fullcalendar/angular` (`/daygrid`, `/timegrid`, `/themes/monarch`); the Spanish locale is `fullcalendar/locales/es`. Never install the separate `@fullcalendar/core|daygrid|interaction` v6 packages. License is MIT; resource/timeline views are paid and not used.
- Theme CSS (`skeleton.css`, monarch theme and palette) is registered in `angular.json` `styles`.
- **CSS class names are hashed** (`.fc-0s`, `.fc-monarch-07j`), so styling by selector is impossible. Control size/look through options (`slotMinHeight`, `dayMaxEvents`, `eventTimeFormat`, per-event `display: 'block'`/`color`) and the custom `eventContent` `ng-template` (its markup is styled by this component's own CSS). `arg.isShort` is available to drop secondary lines.
- Renames/removals found at compile time: `slotLabelFormat` → `slotHeaderFormat`; `Calendar.updateSize()` does not exist (it resizes itself). `headerToolbar: false` is used; the period title and prev/Hoy/next buttons are our own (`datesSet` supplies `view.title`).
- The reference for option names is the typings under `node_modules/fullcalendar/chunks/*.d.ts` (view names: `dayGridMonth`, `timeGridWeek`, `timeGridDay`). The Angular wrapper component is not standalone: import `FullCalendarModule`.
- Events come from an async `events` function (`{start, end}` → promise of `EventInput[]`); `timeZone: 'America/Bogota'`.

## Views

Mes / Semana / Día use the calendar, which stays **mounted** (hidden with a CSS class) while the custom "Lista" view is shown, so its position is kept. "Lista" is `lista-citas.ts`, not a FullCalendar view: all upcoming confirmed appointments from today (including the one in progress) up to ~13 months, ordered nearest → farthest, not grouped by day. On narrow screens (<720 px) it is the default view. `detalle-cita.ts` is the shared detail dialog (`aDetalle()` builds its data for both list and calendar).
