# Handoff — composite v2: the director's notes on the first five, answered (16 Oct 2026)

**Why:** Fendi on the first five Chicago composites (c041, c044, c045, c046, c047 over the still plate `b58cab47`):
c041/c046/c047 good but "completely still… unnatural — some activity needs to be happening within these shots, aside
from me rapping"; c045 "okay, still no movement"; c044 "no good — the end of the shot… drift… the outline of me
becomes white… pasted in."

## State at hand-off — every line as it stands, with its evidence

| What | State | Evidence |
|---|---|---|
| **c044's cause** | **VERIFIED** (16 Oct 03:50 UTC) | Replayed v1's alpha pairing on the real take and matte with the app's own parser (`probeVideo` + `shownAt`): 89 frames each at identical times, but the matte's header length is 4.0489 s against the take's 4.0039 s; v1 normalised each clock to its header, so from frame 45 on the matte ran ONE FRAME AHEAD (43 of 89 mispaired; frame 84 took matte 85). On the filed frame 84 the box left of his cap holds 192 white-wall pixels under matte 86 and 0 under matte 84. The recipe itself, run offline on the correctly paired frame, has no rim. |
| Code: recipe v2, frame-by-frame pairing, handheld camera, moving plate, "Animate the plate", driver press | **MERGED** — PR #273, squash `14159730` | `vitest` 2881 passed, `tsc` clean, `npm run build` clean; security review (approve, two hardenings applied `1ab13fb`) and architecture review (approve with fixes, all applied `1f66c7c`) are comments on the PR |
| `provider-jobs-tick` redeployed through Lovable (it bundles `_shared/jobProgress.ts`) | **LIVE** (VERIFIED) | Lovable agent, DEPLOY ONLY from `14159730`: `source_sha256 428cf5dcc7c08adda160f5b6971d468c112a00c3477443cdf20ca75d125136bf`; unsigned `POST {}` → 401 `missing_credentials` from the function's own code |
| Frontend published | **LIVE** (VERIFIED) | live chunk `Acceptance-BH45aPrE.js` carries `plate-composite-v2-2026-10-16`, `handheld-v1-2026-10-16`, `alpha_pairing`; `projects._id.storyboard-CiA6T8SM.js` carries `focus-animate-plate`; the v1 string is absent from every chunk reachable from the storyboard |
| The moving plate of 79th & Lafayette | **FILED and judged PASS (agent)** | pressed headlessly on c047 (04:31 UTC; dry run first); job `ed606bf3`, request `e6d9acd1`, CC estimate 35 ¢; asset `7cc8e934` (5.04 s, 1080×1920, 7.46 MB) with `lane world_plate_video`, `scene_title "Chicago, the switch"`, `plate_motion.still_asset_id b58cab47`, usable, **no** shot assignment; camera lock measured: top-band mean abs diff 1.6/255 between frames 0 and 100 (whole frame 8.5: the traffic); expressway traffic, the signal changing, a walker in the distance, the walkway empty. Ledger row 43. |
| The five composites re-pressed over the moving plate | see **Run results** below | |

## Run results (fill from real output only)

RUN_RESULTS_PLACEHOLDER

## Verify from real output — never from a claim

| Check | How | Expected |
|---|---|---|
| The moving plate is a plate of the scene | `avt_select project_assets` filter `metadata_json->>lane = world_plate_video`, project `764a63d2` | one row `7cc8e934`, `plate_motion->>still_asset_id = b58cab47`, `usable true`; `avt_select shot_asset_assignments` filter `asset_id = 7cc8e934` → **0 rows** |
| A v2 composite records what it did | `avt_select project_assets` filter `metadata_json->composite->>version = 2` | `composite.recipe.version plate-composite-v2-2026-10-16`, `composite.camera.version handheld-v1-2026-10-16`, `composite.alpha_pairing index`, `composite.plate_video_asset_id 7cc8e934`, `composite.plate_frames` > 0; file name `…_<dressed8>_b58cab47m7cc8e934_<seed>.mp4` |
| Nothing was selected | `avt_select shot_asset_assignments` filter `asset_id` = each new composite | every row `is_primary false` |
| Live code | crawl `https://aivideotool.lovable.app/projects` (`--compressed`), follow `index-*.js` → `projects._id.storyboard-*.js` and its imports | `plate-composite-v2-2026-10-16` present, `plate-composite-v1-2026-10-15` absent |

## Run it again

```
# session: MCP avt_functions {name:"avt_browser_session"} → <scratchpad>/agent-browser-session.json (an hour; never in the repo)
node scripts/agent-browser/avt-press.mjs animate-plate --session … --chrome … --project 764a63d2-93cd-44f3-905f-292f14ab2f51 \
  --variation 358363e6-33ba-48e0-bd88-e80b57ac6b3c --shot c047 [--dry-run]     # ≈ $0.35; one per scene
node scripts/agent-browser/avt-press.mjs composite … --shot c047 [--dry-run]   # ≈ $0.09–0.11 matte; goes over the moving plate once filed
```

A composite pressed BEFORE the moving plate is filed goes over the still (the dialog says which; the dry run's
`plateVideo` is null). The focus view's `focus-plate-state[data-moving]` says whether the scene has a moving plate.

## Guardrails

- Do not re-animate a plate the scene already has unless the director rejects it: `videoPlatesOf` takes the newest
  usable one, so a second clip silently replaces the first for every later composite.
- Do not select any composite: the director chooses. Everything here is filed `is_primary false`.
- Do not edit the recipe constants to taste. `RECIPE.version` and `CAMERA.version` are recorded on every filed row;
  a change is a new version with its own test and its own note in `docs/recipes/PLATE_REALISM_PROMPT.md`.
- The old tick (before `428cf5dc…`) would have finalised a finished plate job as a plain library clip, and the new
  tick never revisits a finalised job: if a moving plate ever shows as `generated_clip` with no `lane`, it was filed by
  the old code — animate again, do not patch the row by hand.
- Never commit the session file, the output folders, or any clip of Fendi (the repo is public).

## Report back

The run-results table filled from the database (asset ids, `alpha_pairing`, `plate_frames`, seconds), the director's
verdict per shot, and ledger rows 43–44.
