# Handoff — the agent presses the app itself (avt_browser_session + scripts/agent-browser)

**Why:** Fendi, 16 Oct 2026: "You should be able to press everything in the tool. If you can't press it, then you
need to build the capability." The composite lane (step 6) renders in the browser with WebCodecs; through the MCP an
AI could write every request but not press it. This change lets a headless Chrome, signed in as the owner for one
hour, press the app's own button. The script presses; the app decides.

**State at hand-off (label every line as it stands) — everything below was made live and verified from this session on 16 Oct 02:30–02:50 UTC:**

| What | State | Evidence |
|---|---|---|
| Code: `avt-mcp` tool `avt_browser_session` (+ `avt_whoami {browser_session:true}`), `batch-token-proxy` purpose + machine-session guard + browser refresh bound, `FocusView` button/status, local sign-out, driver, docs | CODED — PR #270 | `vitest` 2853 passed, `tsc --noEmit` clean, `npm ci --dry-run` clean (the lockfile sync for main's red CI rides this PR) |
| Reviews (Class C, auth) | DONE — security and architecture, both "approve with fixes", every fix applied | comments on PR #270 |
| `avt-mcp` + `batch-token-proxy` redeployed through Lovable | **LIVE** (VERIFIED) | proxy: `{"action":"session","purpose":"admin"}` with no credential → `400 purpose must be one of runner, browser` (new code answers before asking for a secret); MCP: `avt_functions {name:"avt-mcp"}` returns the new header text; then PR #271's bridge redeployed, source_sha256 `9f7f5cd0…` |
| Frontend published (new `data-state` on `focus-status`, button visible with its reason, local sign-out) | **LIVE** (VERIFIED) | live chunk `projects._id.storyboard-55Hx7xDU.js` contains `focus-status","data-state":` |
| The hand-out | **WORKS** (VERIFIED) | `avt_functions {name:"avt_browser_session"}` → access token, `expires_in` 2902, `user` = `{id, aud, role, email, is_anonymous}`, `storage_key sb-qoyxgnkvjukovkrvdaiq-auth-token`, no `refresh_token` key; this session's client drops undeclared arguments, so `avt_whoami {browser_session:true}` answered without it (why PR #271 exists) |
| First real press (composite on c047) | **DONE** (VERIFIED from the database) | dry run `RESULT ok` with the exact request; real press `RESULT {"ok":true,"toast":"The composite is on this shot as an alternate"}` after 71 s (matte 18 s, 113 frames composited in 35 s); asset `ccb146c9` filed, sync `804ccb9b` at 82.025, assignment `32a3834b` unselected, spend row `e2b1e9e8`; verdict PASS; ledger row 41 |

## Make it live (Lovable, never a standalone Supabase)

1. **Edge Functions → redeploy** `avt-mcp` and `batch-token-proxy` (AVT project `bd21b544-c7b8-4780-bdde-391ac9d4bfa8`).
   Order does not matter: an old proxy ignores `purpose`; an old MCP has no browser tool.
2. **Publish** the frontend (the driver reads `focus-status[data-state]` and expects the composite button to be
   rendered, disabled with its reason, whenever the shot has a dressed take).

## Verify from real output — never from a claim

| Check | Command | Expected |
|---|---|---|
| MCP has the tool | MCP `tools/list` (reconnect the client) | 12 tools; `avt_browser_session` present; `serverInfo.version` `1.1.0` |
| Hand-out works and is bounded | `avt_browser_session` | `access_token`, `expires_in` **≥ 2100** (35 min: the proxy refreshes first), `user` has exactly `id, aud, role, email, is_anonymous`, `storage_key` `sb-qoyxgnkvjukovkrvdaiq-auth-token`; **no** `refresh_token` key |
| Audit row | `avt_select batch_credential_mints` is not reachable through the MCP (by design); read it in the Lovable SQL editor: `select outcome, reason from batch_credential_mints order by created_at desc limit 3` | newest row's `reason` ends with `[browser]` |
| Purpose validated | `curl -X POST .../functions/v1/batch-token-proxy -H 'x-batch-secret: <cred>' -d '{"action":"session","purpose":"admin"}'` (only if a credential is at hand; never paste one in chat) | HTTP 400 `purpose must be one of runner, browser` |
| Machine session cannot manage credentials | with the browser token as bearer: `{"action":"list"}` to the proxy | HTTP 403 `a machine-minted session cannot manage credentials`; a `denied` row `machine session cannot list credentials` |
| Published bundle carries the UI change | crawl `https://aivideotool.lovable.app/projects` with `Accept-Encoding: identity`, follow the entry to `projects._id.storyboard-*.js`, grep `data-state` next to `focus-status` | present |

## Run it

```
# 1. session: MCP avt_browser_session (stale tool list: avt_functions {name:"avt_browser_session"}) → save the answer
#    verbatim as <scratchpad>/agent-browser-session.json
# 2. Chrome with H.264 (Playwright's Chromium has none): Chrome for Testing 141.0.7390.37 linux64 unzipped in the scratchpad
# 3. dry run (free; the exact request lands in <out>/dry-run-request.json), then the press
node scripts/agent-browser/avt-press.mjs composite --session <scratchpad>/agent-browser-session.json \
  --chrome <scratchpad>/cft/chrome-linux64/chrome --project 764a63d2-93cd-44f3-905f-292f14ab2f51 \
  --variation 358363e6-33ba-48e0-bd88-e80b57ac6b3c --shot c047 --dry-run
node scripts/agent-browser/avt-press.mjs composite ... --shot c047          # pays the matte (~$0.11 for 4.96 s)
```

Expected on a real press: stages `asking for the matte…` → `waiting for the matte… in queue/in progress (m:ss)` →
`downloading the matte…` → `reading the take and the plate…` → `compositing frame N of 149…` → `uploading and
filing…` → toast `The composite is on this shot as an alternate`; `RESULT {"ok":true,…}`; then
`avt_select project_assets` filter `metadata_json->derived_from->>method = composite` → one new `edited_clip`,
`parent_asset_id` = the dressed take, unselected assignments on every shot the dressed take covers.

## Guardrails

- Never commit the session file or the output folder (`agent-browser-session*.json`, `agent-browser-out-*/`,
  `_avt_outputs/` are gitignored). Never paste a token or a credential into chat or a PR.
- The board shows the project's ACTIVE variation: pass `--variation` (c047's dressed take is in candidate 6,
  `358363e6…`); the driver switches back afterwards unless `--keep-variation`.
- Do not add a sign-out press to the driver. Do not widen the driver with app logic: a new press is open-the-shot,
  click-a-testid, wait-for-the-app's-toast.
- If the dry run's `RESULT` is `ok:false` with `the shot offers no Composite over plate`, the shot has no dressed
  take in that variation — dress first (step 5), do not composite something else.

## Report back

The verification table filled from real output, the first press's `RESULT` line, the filed asset id, and the ledger
row for the matte.
