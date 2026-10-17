# agent-browser — the AI presses the app itself

Some of the storyboard only runs in a browser: the composite lane renders with WebCodecs, the confirm dialogs
decide what is spent (a press is `composite` or `animate-plate`; see Presses). An AI working through the MCP could write every request but not press those. This folder
closes that gap: a headless Chrome, signed in as the owner for one hour, opens the shot and presses the button; the
app's own code does everything else and the script reports what the page said.

## Run

```
# 1. the sign-in: ask the MCP and save its answer as is
#    avt_browser_session            → agent-browser-session.json
#    (stale tool list: avt_functions {name: "avt_browser_session"} performs it; avt_whoami {browser_session: true}
#     only where the client forwards undeclared arguments)
#    (that name and agent-browser-out-*/ are gitignored; keep them in the scratchpad anyway)
# 2. press
node scripts/agent-browser/avt-press.mjs composite --session agent-browser-session.json \
     --project 764a63d2-93cd-44f3-905f-292f14ab2f51 --shot c047 --dry-run      # the exact request, nothing sent
node scripts/agent-browser/avt-press.mjs composite --session agent-browser-session.json \
     --project 764a63d2-93cd-44f3-905f-292f14ab2f51 --shot c047                # pays the matte, renders, files
```

The board shows the project's ACTIVE variation. `--variation <id>` presses the app's own switcher to the one you
mean and presses it back at the end (`--keep-variation` leaves it switched).

Output: `RESULT {ok, toast, dryRun, dryRun.request, out, lastStage}` on the last line; screenshots, the dialog text and
the console in `--out` (default `_avt_outputs/agent-browser/<time>`, gitignored). Exit 0 only when the page's own
success toast appeared. A real press refuses a session with less life than `--timeout-min` plus 90 s (the MCP
refreshes before handing one out, so a fresh answer has ~an hour) and never waits past the token's life. The app URL
must be https on `*.lovable.app` (or localhost) unless `--allow-any-host` is passed: the token goes wherever the URL
points.

## Chrome

The lane decodes and encodes H.264. Playwright's open-source Chromium has no H.264 (`VideoEncoder.isConfigSupported`
for `avc1.*` answers false; verified 16 Oct 2026), so pass a Chrome that does with `--chrome` or `AVT_CHROME`:
Chrome for Testing (`https://storage.googleapis.com/chrome-for-testing-public/<version>/linux64/chrome-linux64.zip`,
141.0.7390.37 verified) or Google Chrome. Playwright is not a dependency of this repo: the script resolves it from the
repo when present, else from the global install (`npm i -g playwright`, 1.56 verified).

## The sign-in, and what it is not

`avt_browser_session` hands out the owner's ACCESS token only — the same session the MCP already acts with — and
never the refresh token: the browser cannot renew it, so the sign-in ends with the hour, and it cannot rotate the
refresh token out from under `batch-token-proxy`. Each hand-out is a `[browser]` row in `batch_credential_mints`.
The owner is bound to the credential; nothing in the request names a user. Revoking the credential ends the stored session; a
token already handed out stays valid until it expires. A machine-minted session cannot enrol, list or revoke
credentials (the proxy refuses it). Treat the session file as a secret for the hour it lives: keep it in the
scratchpad, never in the repo.

## Presses

| Command | Button | Confirms | Ends with the toast |
|---|---|---|---|
| `composite` | `focus-composite-shot` | `confirm-composite-shot` (`-dryrun`) | "The composite is on this shot as an alternate" |
| `animate-plate` | `focus-animate-plate` | `confirm-animate-plate` (`-dryrun`) | "The plate is being animated — composites of this scene use it when it is done" |
| `montage` | `focus-montage` | `confirm-montage` (`-dryrun`) | "The montage is being shot — it lands on this shot unselected when it is done" |

`animate-plate` sends one 5 s image-to-video of the scene's plate still (~$0.35) and returns as soon as the provider
has it; the server files the clip minutes later as a moving plate of the scene (`avt_select project_assets` with
`metadata_json->>lane = world_plate_video`). A `composite` pressed after that goes over the moving plate; the focus
view says which with `focus-plate-state[data-moving]`.

`dress` puts the scene's outfit on the shot's stretch of the take (the Higgsfield object-swap, every started source
second billed, at least 4 s ≈ $2.72); the result lands on the shot as an unselected alternate. The outfit is the
scene's (`variation_scenes.outfit_key`), so to dress one shot differently give it its own scene.

`montage` re-shoots the performance shot's DRESSED take (its real take when none is dressed) as a fast-cut sequence of
angles and cutaways in the place of the scene's plate, in ONE Seedance 2.5 reference-to-video call (~$2.36 for 5 s
at 720p), filed on the shot as an unselected alternate. `--event` is the scene list, one scene per line, each
optionally with its own window ("2.0-2.7 s: a quick optical zoom onto the polar bear"); without it the dialog's
prefilled four scenes are sent — the orca shape: the place WITHOUT him · HARD CUT him in profile, a hand on something
in the place · HARD CUT tight on the thing · HARD CUT low angle, him leaning on something. Never "straight to camera":
that line made the montages Fendi called pasted (16 Oct 2026). The same shot is `avt_montage` / `montage-shot` on the
MCP, without a browser. There is no "snap back to him" scene: asked for one, the model spends its last frames on it — a two-frame flash
of him (c047 v2) or a frozen half second (the other four) that reads as an inserted still; the montage supplies the
cutaways, the edit cuts back to the pixel-exact composite, and the montage's last `MONTAGE_TAIL_TRIM_SECONDS` are
never used. The prompt shape is Thuggpapi's
(`docs/research/references/THUGGPAPI_SEEDANCE_MONTAGE_PROMPTS_2026-10.md`): one style line, "Show in order", one dash
per scene, deadpan.

## Adding a press

Every button the storyboard offers has a `data-testid` (`focus-*`, `box-*`, `confirm-*`). A new command is: open the
shot the same way, click the testid, wait for the app's own toast. Keep the rule: the script presses, the app decides.


## Swap in a box (region swap)

A piece of his wardrobe swapped inside a box of a clip already on the board — for a piece that is small in a wide
shot (shoes at the far end of a platform), or a frame with other people in it. The page (`/projects/<id>/swap`,
`src/pages/RegionSwapPage.tsx`; also "Swap in a box…" on a performance clip in a shot's Media tab) cuts the box out,
enlarged to the clip's frame, sends it to `dress-clip` as a crop, and — once the job is done — puts the swapped crop
back into the box over the original clip. Everything outside the box stays the original footage.

```
node scripts/agent-browser/avt-press.mjs region-swap --session <s.json> --project <id> --asset <clip id> \
     --box 0.38,0.6,0.24,0.08 [--window 3.3,4.04] [--pieces <id>,<id>] [--dry-run] --chrome <chrome>
node scripts/agent-browser/avt-press.mjs region-putback --session <s.json> --project <id> --asset <clip id> \
     --job <provider job id> --chrome <chrome>
```
