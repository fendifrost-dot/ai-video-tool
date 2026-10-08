# AVT MCP server — connect Claude, ChatGPT and Grok to AVT

`supabase/functions/avt-mcp` makes AVT an MCP server (streamable HTTP, JSON responses). An AI connected to it acts as
you: it reads and edits your projects, boards, cast and continuity, and generates pictures and video through AVT's own
edge functions. **Every paid call is charged to a budget you approve for that video**; a call that would pass it is
refused.

URL: `https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/avt-mcp`

## 1. Give each AI its own credential
AVT → **Settings → Machine credentials** → create one per AI, labelled `Claude`, `ChatGPT`, `Grok`. The secret is shown
**once**, with a ready **MCP URL** (`…/avt-mcp/<secret>`). One per AI means you can revoke one without the others, and
the spend ledger (`mcp_spend.credential_id`) says which AI made each call.

## 2. Approve a budget for the video
AVT → **Settings → AI budgets** → name the video, pick the project, enter the amount → **Approve budget**. An AI can also
*ask* for one (`avt_budget_request`); it shows as "asked by an AI" until you approve or decline it. Close a budget when
the video is done.

## 3. Add the server to each app
The secret can go in a header (better: it stays out of URLs) or at the end of the URL (for apps that only take a URL).

| App | How |
|---|---|
| Claude Code | `claude mcp add --transport http avt https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/avt-mcp --header "Authorization: Bearer <secret>"` |
| Claude (claude.ai / desktop) | Settings → Connectors → add a custom connector → paste the **MCP URL with the secret**; no OAuth |
| ChatGPT | Developer mode → add a connector / app with the **MCP URL with the secret**; authentication: none |
| Grok (xAI API, remote MCP tool) | server URL = the MCP URL; send the secret as the `Authorization: Bearer` value if the client takes one, else use the URL with the secret |

App menus move; if a step above does not match, the app needs: an MCP server URL, HTTP transport, no OAuth.

## Tools
| tool | what |
|---|---|
| `avt_whoami` | who it acts as, the credential, caps, open budgets — start here |
| `avt_tables`, `avt_select` | read any of your tables (row-level security holds) |
| `avt_insert`, `avt_update`, `avt_delete` | write; updates/deletes name rows by id; delete needs `confirm: true` |
| `avt_rpc` | `duplicate_variation`, `lyric_lines_in_window` |
| `avt_functions` | every AVT edge function: free / paid / blocked, its notes and request type (generated from the code) |
| `avt_call` | call one as you; paid ones need `budget_id` + `max_usd` |
| `avt_signed_url`, `avt_list_files` | look at stored files |
| `avt_budgets`, `avt_budget_request`, `avt_spend` | budgets and the ledger |

## Limits, by design
- **Budget = hard cap.** `mcp_reserve` reserves `max_usd` atomically; refused when it would pass the budget. Also a
  per-call cap (`AVT_MCP_MAX_USD_PER_CALL`, default $10) and a daily cap (`AVT_MCP_DAILY_CAP_USD`, default $50) —
  edge secrets, change them in Lovable Cloud.
- A finished call is charged what the function reports it cost; if it reports nothing, the reservation stands (it may
  have been billed). A 4xx refusal costs $0.
- Not reachable: credentials (`batch_credentials*`), `batch-token-proxy`, server callbacks, research harnesses. The
  ledger and budgets are read-only to the AI; only you approve.
- The minted session never leaves the function. Sessions are minted through `batch-token-proxy` (12 per hour per
  credential, all audited in `batch_credential_mints`); a busy AI may briefly see `429` — wait and retry.
- What it cannot do that the app does: the storyboard's browser-side request building (continuity words, which
  pictures to send, the blocking checks) is not on the server. Through `avt_call` an AI writes the request itself —
  read `avt_functions` for the shape and prefer `dryRun` first.
