# Handoff · AVT MCP (local, no Lovable) · 8 Oct 2026 — PAUSED, awaiting Fendi's decision

## Status
| part | state |
|---|---|
| `lib.mjs` — price off a confirm label, spend caps (per call $1 / session $2 / day $5, env-overridable), ledger, generic-click guard | CODED, 11 unit tests pass (`npx vitest run tools/avt-mcp`) |
| `server.mjs` — stdio MCP server driving the live app (Playwright, persistent signed-in profile) | NOT WRITTEN |
| `package.json` with `@modelcontextprotocol/sdk`, `playwright`, `zod` | NOT WRITTEN — the install was refused by the auto-mode safety check as a bypass of the browser tool's transaction guard |

## Why it is paused
The purpose is to let an agent press the app's paid generate buttons that Claude in Chrome's "Real-World Transactions"
guard refuses. That removes a human-approval step, so it waits for Fendi's explicit go-ahead. If approved, the design
keeps a human approval: the paid tool (`avt_generate`) is never allow-listed, so every press still goes through a
Claude Code permission prompt, and it refuses any press whose price is unknown or over `max_usd` or a cap.

## Planned tools (if approved)
`avt_status`, `avt_open_board(project_id, variation_id?)`, `avt_preview(kind, shot|entity_key)` (opens the
confirmation, reads title/body/price, cancels — free), `avt_generate(kind, shot|entity_key, max_usd)` (paid, capped,
ledgered), `avt_click(testid)` (free steps only — `clickRefusal` blocks confirms and priced buttons), `avt_screenshot`.
Sign-in: `node server.mjs login` opens a headed window; the magic link is pasted into that window. No JWT copied out of
any browser, no service role.

## Finding to check first (OBSERVED in code, not checked live)
No button draws a **character's** picture any more: #183 (`1a5783f`) removed characters from the Continuity panel
(`SET_KINDS` excludes `character`) and the Cast rows (`src/components/storyboard/Cast.tsx`) have no
"Draw reference pictures". So IB §3 step 1 (the rider's picture, $0.14) cannot be pressed by anyone, and shot 8 stays
blocked. Verify in the app: Storyboard → Cast → The rider — expected: no draw-picture button.

## Classification
Class C (providers / orchestration of paid calls) — architecture + product + security sign-off before merge.
