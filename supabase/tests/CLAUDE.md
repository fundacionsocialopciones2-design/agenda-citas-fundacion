# `supabase/tests/` — SQL test scripts

Each script is self-contained and **leaves no data**: `begin; … rollback;`, with fictitious fixtures, ending in `select n, prueba, OK/FALLO, detalle from t_res`. Run them by sending the whole script through the MCP `execute_sql`.

Patterns that matter:
- Collect results in a temp table `t_res` and select it last (`execute_sql` returns only the last statement's result).
- To test permissions, switch role inside a `DO` block: `set local role authenticated|anon|service_role` + `select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)`, run the call in a `begin … exception when others` block, then **`reset role` before inserting into `t_res`**. Read any fixture from temp tables (e.g. `t_ctx`) **before** switching role, because limited roles cannot read the postgres-owned temp tables (this once caused a false pass).
- Make assertions strict: check the exact error (`sqlerrm = 'forbidden'`, `sqlstate 'AG409'`), not just "it failed".
- Deferred conflict triggers only fire at commit; force them inside the test with `set constraints all immediate` (and `deferred` again after).
- Fixtures: auth users `…0a1` admin, `…0a2`/`…0a3` specialists; "next Tuesday" is `date_trunc('week', now() at time zone 'America/Bogota')::date + 8`.
- Files: `01` permissions/availability/booking/idempotency/cancel/reschedule/conflicts, `03` chatbot uses the shared rules, `04` chatbot informs when there is no agenda (creates a temporary specialty and menu node), `05` WhatsApp hardening (phone not overwritten, same text for every failure, 2-per-phone limit, rollback of failed attempts, inscription errors). The new-RPC checks from migration 08 were run inline and are not saved as a file.
