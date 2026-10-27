# Edge Function `admin-users`

Administers Auth users for specialists. It exists because creating/banning Auth users needs the privileged key, which must never reach Angular.

- Flow: require a Bearer JWT → `getUser()` → call `is_admin()` **with the caller's own token** → only then create the service-role client. Any failure returns 401/403 before touching Auth. Probed: no token and the public key alone both return 401.
- Actions: `create_specialist` (invite by email, insert `profiles` → `specialists` → `specialist_specialties`, roll back everything including the Auth user if a step fails), `change_email`, `set_active` (calls `admin_set_specialist_active` with the *user's* token so AG409 conflicts surface as HTTP 409 `{code:'AG409', cita_ids}`, then updates `profiles.active` and bans/unbans the Auth user).
- Invitations redirect to `${APP_URL}/restablecer`; `APP_URL` defaults to `http://localhost:4200` and `ALLOWED_ORIGINS` defaults to it (CORS). Set both as function secrets when a production URL exists. Supabase's built-in email is heavily rate-limited on the Free plan.
- Known gap: `change_email` for a specialist with no `profile_id` returns 404; granting access to existing specialists is not implemented (a draft was reverted at the user's request).
- Never log emails, names or tokens.
- Deploy with the MCP `deploy_edge_function` (`verify_jwt: true`), passing the full contents of `index.ts` as the file; keep this file in sync with what is deployed. Supabase's publishable/secret keys are not JWTs, so this function relies on the user's session JWT, not on `apikey`.
