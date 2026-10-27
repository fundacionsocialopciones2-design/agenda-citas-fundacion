# `features/especialista/` — specialist calendar (FullCalendar 7)

Route `/mi-agenda`. Read-only: specialists see only their own appointments through `my_agenda` (minimal patient data: name and document, no phone). Cancelled appointments are hidden.

## FullCalendar 7 quirks

- v7 differs a lot from v6 and most online examples are wrong. Plugins are **subpaths** of `@fullcalendar/angular` (`/daygrid`, `/timegrid`, `/themes/monarch`); the Spanish locale is `fullcalendar/locales/es`. Never install the separate `@fullcalendar/core|daygrid|interaction` v6 packages. License is MIT; resource/timeline views are paid and not used.
- Theme CSS (`skeleton.css`, monarch theme and palette) is registered in `angular.json` `styles`.
- **CSS class names are hashed** (`.fc-0s`, `.fc-monarch-07j`), so styling by selector is impossible. Control size/look through options (`slotMinHeight`, `dayMaxEvents`, `eventTimeFormat`, per-event `display: 'block'`/`color`) and the custom `eventContent` `ng-template` (its markup is styled by this component's own CSS). `arg.isShort` is available to drop secondary lines.
- Renames/removals found at compile time: `slotLabelFormat` → `slotHeaderFormat`; `Calendar.updateSize()` does not exist (it resizes itself). `headerToolbar: false` is used; the period title and prev/Hoy/next buttons are our own (`datesSet` supplies `view.title`).
- The reference for option names is the typings under `node_modules/fullcalendar/chunks/*.d.ts` (view names: `dayGridMonth`, `timeGridWeek`, `timeGridDay`). The Angular wrapper component is not standalone: import `FullCalendarModule`.
- Events come from an async `events` function (`{start, end}` → promise of `EventInput[]`); `timeZone: 'America/Bogota'`.

## Views

Mes / Semana / Día use the calendar, which stays **mounted** (hidden with a CSS class) while the custom "Lista" view is shown, so its position is kept. "Lista" is `lista-citas.ts`, not a FullCalendar view: all upcoming confirmed appointments from today (including the one in progress) up to ~13 months, ordered nearest → farthest, not grouped by day. On narrow screens (<720 px) it is the default view. `detalle-cita.ts` is the shared detail dialog (`aDetalle()` builds its data for both list and calendar).
