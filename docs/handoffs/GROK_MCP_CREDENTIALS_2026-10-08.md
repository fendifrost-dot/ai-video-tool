# Handoff → Grok bot · Make the AI machine credentials and connect AVT's MCP · 8 Oct 2026

AVT now runs as an MCP server, so Claude, ChatGPT and Grok can drive it directly instead of clicking in the browser.
Your job: make one credential per AI and hand Fendi the three MCP URLs.

## What is live (verified 8 Oct)
- MCP server: `https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/avt-mcp` (anonymous POST answers `401 missing credential` — that is correct).
- App: `https://aivideotool.lovable.app` → **Settings → Machine credentials**. No budgets or caps anywhere.

## Steps
1. Signed in to `aivideotool.lovable.app` as Fendi, open `/settings`.
2. In **Machine credentials**, create three credentials, labelled `Grok`, `Claude`, `ChatGPT` (one per AI so any one can
   be revoked on its own). Each shows its secret once with a ready **MCP URL** (`…/avt-mcp/<64 hex>`). Copy the MCP
   URL before pressing "I have stored it" — the app does not show it again (if one is lost, just revoke it and make
   another; nothing else breaks).
3. Post the three MCP URLs back to Fendi in chat, labelled. He adds them to each app himself, or you add Grok's now.

## Connecting an app (any of them needs only: the MCP URL, HTTP transport, no OAuth)
- Grok: add a remote MCP server with the MCP URL.
- Claude: Settings → Connectors → custom connector → the MCP URL. Claude Code:
  `claude mcp add --transport http avt <MCP URL>`.
- ChatGPT: Developer mode → add connector → the MCP URL, authentication none.
More in `docs/MCP.md`.

## Quick check from a connected AI (free)
- `avt_whoami` → `user_id 3ca10935-8c3d-4479-9a0c-8bfe8050840c`, `credential.label` = the AI's name.
- Tool list shows 11 tools. `avt_functions` lists every AVT edge function with the request it takes.
- `avt_call` on `world-still-proxy` with `{projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51", prompt: "test", dryRun: true}`
  → `http_status: 200` and the function's plan.
- `401 credential refused` = wrong or revoked secret; `429` = more than 12 session mints in an hour, wait a bit.

## Report back
The three MCP URLs, which apps are connected, and the `avt_whoami` output.
