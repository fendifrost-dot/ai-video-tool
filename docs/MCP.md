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
| `avt_montage` | the storyboard's Montage button as a server call (`montage-shot`): a performance shot's DRESSED take re-shot as a fast-cut montage in its scene's plate, one Seedance call, filed on the shot unselected; `lines` = the scenes one per line, `dry_run` first |
| `avt_signed_url`, `avt_list_files` | look at stored files |
| `avt_browser_session` | a one-hour sign-in (access token only) for a headless browser that presses the app itself — `scripts/agent-browser/README.md`; for an older tool list, `avt_functions {name: "avt_browser_session"}` performs it (a declared argument, which every client forwards; `avt_whoami {browser_session: true}` works only where the client forwards undeclared ones) |

## Limits, by design
- No budget, cap or ledger: a call runs as you and is billed to your provider accounts at list price. Each AI has its
  own credential, so `batch_credential_mints` says which AI was active when; revoke one in Settings to cut it off.
- Not reachable: credentials (`batch_credentials*`), `batch-token-proxy`, server callbacks, research harnesses.
- The minted session leaves the function in exactly one way: `avt_browser_session` hands the ACCESS token (never the
  refresh token) to a headless browser so the AI can press what only runs in a browser (the composite lane's
  WebCodecs render). It is the same owner session this server acts with, refreshed first so a full hour remains, and
  each hand-out through the MCP is a `[browser]` row in `batch_credential_mints`. Revoking the credential ends the
  stored session, but an access token already handed out stays valid until its `exp` (an hour at most) — that hour is
  the exposure, and it sits in the AI vendor's transcript. A machine-minted session cannot enrol, list or revoke
  credentials (`batch-token-proxy` refuses it, audited), so a one-hour hand-out cannot make itself permanent or cut
  off a sibling AI. Sessions are minted through `batch-token-proxy` (all audited); a busy AI may briefly see `429` —
  wait and retry.
- What it cannot do that the app does: most of the storyboard's browser-side request building (continuity words,
  which pictures to send, the blocking checks) is not on the server. Through `avt_call` an AI writes the request
  itself — read `avt_functions` for the shape and prefer `dryRun` first. The montage is the exception: `avt_montage`
  builds the storyboard's own request on the server (16 Oct 2026, Fendi: "whatever you need the browser for, build it
  into the MCP"); the other presses (dress, animate the plate, composite) still need the browser driver.
