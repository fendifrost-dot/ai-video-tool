# Handoff → Grok bot · Create the AI machine credentials and the first budget, connect AVT's MCP · 8 Oct 2026

Written by the Claude Code session that shipped and deployed `avt-mcp` (PR #202, `main` at `65fcfab`+). Everything in
§0–§1 is VERIFIED live; nothing you do is verified until you paste real output (§5).

## 0. What is live (VERIFIED 8 Oct 06:0x UTC)
| thing | state |
|---|---|
| MCP server | `https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/avt-mcp` — anonymous POST answers `401 {"error":{"message":"missing credential: …"}}` |
| Budget tables / functions | `mcp_budgets`, `mcp_spend`, `mcp_reserve`, `mcp_settle` applied (`2 \| 3 \| 4`) |
| App | `aivideotool.lovable.app` published with **Settings → Machine credentials** and **Settings → AI budgets** |

## 1. What you need, and what you must not do
| need | why |
|---|---|
| A browser signed in to `aivideotool.lovable.app` **as Fendi's account** (`3ca10935-8c3d-4479-9a0c-8bfe8050840c`; magic link to his email) | credentials and budgets are created by the signed-in owner; the app refuses anyone else |
| Access to the AI app each credential is for (Grok's connector settings at least) | a secret is shown **once**; it must go straight into its app |

Do **not**: paste a secret into any chat, log, file, or this handoff; create a credential for an app you cannot
configure in the same sitting (it would be lost — create it later instead); approve a budget larger than Fendi named;
use the supabase CLI or a supabase.com dashboard (a 403 is a false wall); press any **Generate** button in the app.

## 2. Create the credentials — `/settings`, "Machine credentials"
For each AI you can configure now (start with **Grok**; `Claude` and `ChatGPT` only if you can open their connector
settings right after):
1. "Which machine" (`#machine-label`) → the AI's name exactly: `Grok` / `Claude` / `ChatGPT`. Press **Create credential**
   (`create-credential`).
2. A box (`issued-secret`) shows `AVT_BATCH_SECRET=…` and, below it, the **MCP URL** (`issued-mcp-url`):
   `https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/avt-mcp/<64 hex>`. Press **Copy MCP URL** (`copy-mcp-url`).
3. Add it to that AI app **now** (§4). Only then press **I have stored it** (`dismiss-secret`). The secret is gone from
   the page after that and cannot be read back; if it was lost, revoke the row and create another.
4. Expected afterwards: one row per AI in the list (`credential-row`), status "active", "last used never".

One credential per AI, never shared: `mcp_spend.credential_id` is how the ledger says which AI spent what, and
revoking one must not cut off the others.

## 3. Approve the first budget — same page, "AI budgets"
Fendi approves a budget per video. Unless he says otherwise for this run:
- Video: `Interrupted Broadcast — candidate 4` · Project: **YSL** (`764a63d2-93cd-44f3-905f-292f14ab2f51`) · USD: **5**
  → **Approve budget** (`create-budget`).
- Expected: a row (`budget-row`, `data-status="approved"`) reading `YSL · $0.00 of $5.00 used · $5.00 left · 0 paid calls`.
- Nothing can be spent before this row exists; every paid call past $5.00 is refused by the server.

## 4. Connect each app (what each needs: an MCP server URL, HTTP transport, **no OAuth**)
| App | How |
|---|---|
| **Grok** | add a remote MCP server with the MCP URL (secret in the URL), or server URL = `…/avt-mcp` + header `Authorization: Bearer <secret>` if the client takes headers |
| Claude (claude.ai / desktop) | Settings → Connectors → custom connector → the MCP URL |
| Claude Code | `claude mcp add --transport http avt https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/avt-mcp --header "Authorization: Bearer <secret>"` |
| ChatGPT | Developer mode → add connector/app → the MCP URL, authentication: none |

App menus move; if a step does not match, those three facts are what the app needs. Full notes: `docs/MCP.md`.

## 5. Verify (from the connected AI, free — $0)
1. `avt_whoami` → `user_id` = `3ca10935-8c3d-4479-9a0c-8bfe8050840c`, `credential.label` = that AI's name, `budgets`
   lists `Interrupted Broadcast — candidate 4` with `remaining_usd: 5`.
2. The client's tool list shows **14** tools (`avt_whoami` … `avt_spend`).
3. `avt_call` on `world-still-proxy` with `body: {projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51", prompt: "test", dryRun: true}`,
   `budget_id` = the budget's id, `max_usd: 0.5` → the function's own answer (`referencesAccepted`, a plan), and
   `budget.charged_usd` ≤ 0.5. Then `avt_spend` on that budget → **1** row.
4. Failure readings: `401 credential refused: credential revoked/unknown` → wrong or revoked secret; `429 rate_limited`
   → more than 12 session mints in an hour, wait; `refused: true, reason: "budget … is pending"` → §3 not done.

## 6. Report back
Credential labels created (never the secrets); which apps are connected; the `avt_whoami` output; the tool count;
the dry-run answer and the `avt_spend` row. Do not write "verified" for anything you did not see in output.
