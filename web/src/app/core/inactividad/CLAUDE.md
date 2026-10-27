# `core/inactividad/` — idle logout

Closes the session after `environment.inactividad.limiteMinutos` (15) of inactivity, with a dialog `avisoSegundos` (60) before. Client-side only: server-side idle/time-box session limits need the Supabase Pro plan, which the project does not have.

Design decisions to preserve:
- It compares `Date.now()` timestamps on a 1 s tick instead of one long timer, so a suspended laptop or background tab logs out immediately on return (also re-checked on `visibilitychange`).
- Last activity is shared between tabs through one localStorage key (`agenda-citas:ultima-actividad`, a bare number, never personal data); writes are throttled to every 5 s because `scroll` fires constantly. Storage access is wrapped in try/catch.
- Only deliberate actions count (`pointerdown`, `keydown`, `wheel`, `touchstart`, `scroll`); `mousemove` is intentionally excluded.
- While the warning dialog is open, activity does **not** extend the session; only "Continuar sesión" does. The dialog gets its countdown as a signal through `MAT_DIALOG_DATA` (avoids a circular import with the service).
- After the logout decision, `cerrando` stays `true` until the next login (`vigilar()` resets it) so a failing sign-out cannot cause retries every second; all dialogs are closed so patient data is not left on screen.
- Listeners and the interval exist only while `AuthService.autenticado()`; an `effect` with cleanup attaches/detaches them. The service is instantiated from `App`.
- Tests use `vi.useFakeTimers()`, `advanceTimersByTimeAsync` and `TestBed.tick()`. A real bug (repeated logout attempts) was found by the spec; keep it covered.
