# AVT MCP server — connect Claude, ChatGPT and Grok to AVT

`supabase/functions/avt-mcp` makes AVT an MCP server (streamable HTTP, JSON responses). An AI connected to it acts as
you: it reads and edits your projects, boards, cast and continuity, and generates pictures and video through AVT's own
edge functions. There are no budgets, caps or ledger in the server (your decision, 8 Oct 2026): generation is billed
straight to your provider accounts, which is where spend is controlled.

URL: `https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/avt-mcp`

## 1. Give each AI its own credential
AVT → **Settings → Machine credentials** → create one per AI, labelled `Claude`, `ChatGPT`, `Grok`. The secret is shown
**once**, with a ready **MCP URL** (`…/avt-mcp/<secret>`). One per AI means you can revoke one without the others, and
the spend ledger (`mcp_spend.credential_id`) says which AI made each call.

## 2. Add the server to each app
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
| `avt_whoami` | who it acts as and the credential — start here |
| `avt_tables`, `avt_select` | read any of your tables (row-level security holds) |
| `avt_insert`, `avt_update`, `avt_delete` | write; updates/deletes name rows by id; delete needs `confirm: true` |
| `avt_rpc` | `duplicate_variation`, `lyric_lines_in_window` |
| `avt_functions` | every AVT edge function: callable / blocked, its notes and request type (generated from the code) |
| `avt_call` | call one as you |
| `avt_signed_url`, `avt_list_files` | look at stored files |

## Limits, by design
- No budget, cap or ledger: a call runs as you and is billed to your provider accounts at list price. Each AI has its
  own credential, so `batch_credential_mints` says which AI was active when; revoke one in Settings to cut it off.
- Not reachable: credentials (`batch_credentials*`), `batch-token-proxy`, server callbacks, research harnesses.
- The minted session never leaves the function. Sessions are minted through `batch-token-proxy` (12 per hour per
  credential, all audited); a busy AI may briefly see `429` — wait and retry.
- What it cannot do that the app does: the storyboard's browser-side request building (continuity words, which
  pictures to send, the blocking checks) is not on the server. Through `avt_call` an AI writes the request itself —
  read `avt_functions` for the shape and prefer `dryRun` first.
