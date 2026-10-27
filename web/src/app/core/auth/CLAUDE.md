# `core/auth/` — session and guards

- `AuthService` holds session/profile/role as signals. `autenticado` requires both a session and `profiles.active`. Specialists also load their `specialists.id` (RLS returns only their own row).
- Session loads are **serialized through a promise queue** (`aplicarSesion`). Supabase's `onAuthStateChange` event and the manual post-login load used to race and caused a false "cuenta no habilitada" on login; do not reintroduce unsynchronized loads. Never `await` Supabase calls inside the `onAuthStateChange` callback (it can block the client); it defers with `setTimeout`.
- The auth listener is registered **before** `getSession()` so the `PASSWORD_RECOVERY` event from an email link is not missed. Invitation and recovery links land on `/restablecer` with a session in the URL hash (`detectSessionInUrl`); that page only lets you set a password when a session exists.
- `cerrarSesion()` signs out with `scope: 'local'` (does not kill the user's other devices) and never throws: if the network fails it still clears local state.
- `sesionPerdida` increments when the session disappears **without** this tab asking (another tab signed out, expiry); `App` reacts by redirecting to `/ingresar?motivo=sesion`. A voluntary close sets `cierreSolicitado` so it does not trigger that redirect.
- Guards (`soloAutenticados`, `soloInvitados`, `conRol`) improve UX only; real authorization is RLS and the `is_admin()` checks in the database.
