# Handoff · Deploy the AVT MCP server · 8 Oct 2026

Fendi: "I want the MCP created … give access to Claude, ChatGPT, and Grok … execute every function inside of AVT to
create videos/edit videos". Choices (his): scope **everything**; spend = **a budget he approves per video, hard caps
past it**; hosting = **AVT edge function**. Lovable credits were out until midnight, so nothing below is live.

## State
| part | state |
|---|---|
| migration `supabase/migrations/20261008040000_mcp_budgets.sql` (mcp_budgets, mcp_spend, mcp_reserve, mcp_settle, mcp_budget_committed) | CODED, not applied |
| edge function `avt-mcp` (+ `config.toml` `verify_jwt = false`) | CODED, not deployed |
| Settings → AI budgets panel; MCP URL on a new machine credential | CODED, not published |
| Cast rider-picture fix (`7c382d5`) | CODED, not published |
| Tests | full suite + `tsc` — see PR #202 |

Branch `claude/avt-mcp-config-oefz18`, PR #202. Class C (auth + paid-provider orchestration).

## Steps (in this order — the function needs the tables)
1. Merge PR #202 to `main`.
2. **Lovable SQL editor** (AVT project `bd21b544-…`): run `20261008040000_mcp_budgets.sql` as is.
3. **Lovable → Edge Functions → redeploy `avt-mcp`** (new). No other function changes.
4. **Lovable Publish** (Settings panel + cast fix).

## Verify — expected values
After step 2:
```sql
select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('mcp_budgets','mcp_spend')) tables,
       (select count(*) from pg_proc where proname in ('mcp_reserve','mcp_settle','mcp_budget_committed')) fns,
       (select count(*) from pg_policies where tablename in ('mcp_budgets','mcp_spend')) policies;
```
→ `2 | 3 | 4`. Anything else: stop and report. **Do not edit the migration to make it run** — an error means the live
schema differs (e.g. `video_projects` or `batch_credentials` missing), and that is the finding.

After step 3:
```bash
curl -s -w '\n%{http_code}\n' -X POST https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/avt-mcp -H 'content-type: application/json' -d '{}'
```
- `401` with body containing **`missing credential`** → deployed, `verify_jwt = false` applied. ✔
- `401` with `Missing authorization header` → deployed but the platform still verifies JWTs: `config.toml` entry not
  applied — set verify_jwt off for `avt-mcp` in Lovable and redeploy.
- `404` → not deployed.

After step 4, with Fendi signed in: Settings shows **AI budgets** and the MCP URL; creating a machine credential shows
"Copy MCP URL". Then, with a credential (Fendi pastes it into the AI app, never into chat):
- `initialize` → `serverInfo.name = "avt"`; `tools/list` → **14** tools.
- `avt_whoami` → `user_id = 3ca10935-8c3d-4479-9a0c-8bfe8050840c`.
- `avt_call` on `world-still-proxy` with no budget → refused, "needs budget_id". With an approved $1 budget and
  `body.dryRun: true`, `max_usd: 0.5` → answer from the function; `mcp_spend` gets one row, settled.

## Do not
- Use the supabase CLI or a supabase.com dashboard (a 403 is a false wall); paste secrets in chat; widen the generic
  write tools to `mcp_*` or `batch_*` tables; mark anything verified without the output above.

## Report back
The three SQL numbers, the curl status + body, the `tools/list` count, and the first real paid call's `mcp_spend` row.
