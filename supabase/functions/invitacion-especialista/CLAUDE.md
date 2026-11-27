# Edge Function `invitacion-especialista`

**Public** (`verify_jwt: false`): a specialist without access creates their user from an invitation link. The admin generates it in «Especialistas» (user's decision: their emails are unknown; open sign-up was rejected).

- The only credential is the link token (32 random bytes, single use, 72 h). The database stores its SHA-256 only (`agenda.invitaciones_especialista`, migration 29) and decides validity; every invalid case answers the same `invitation_invalid`.
- Actions: `consultar` → `{full_name}`; `aceptar` → checks the token, validates email and password (8–72 bytes), `auth.admin.createUser` (`email_confirm: true`, so no email is sent), then RPC `invitacion_canjear` (profile + `specialists.profile_id` + token spent, atomic). If the exchange fails the new Auth user is deleted. `invitacion_consultar` / `invitacion_canjear` are `service_role` only.
- `invitacion_canjear` refuses any user that already has a profile: never let this path attach an existing account.
- The emailed address is not verified: a typo breaks password recovery (fix with «change_email» in `admin-users`).
- CORS uses `APP_URL` / `ALLOWED_ORIGINS` (default `http://localhost:4200`), same secrets as `admin-users`. The link points to the origin the admin is using, so it only works for others once the app is hosted.
- Never log emails, passwords or tokens. Deploy with `deploy_edge_function` passing the full `index.ts` and `verify_jwt: false`; keep the file in sync.
- Live check (26 nov): invented token, short password, email in use, success, reuse, specialist sign-in and direct RPC calls were exercised with a temporary specialist, then removed.
