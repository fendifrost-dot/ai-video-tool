# Prompt for the next agent — finishing "YSL Ice On" (15 Oct 2026, late)

Copy everything below the line into the next session.

---

You are continuing AVT (repo `fendifrost-dot/ai-video-tool`, Lovable Supabase `qoyxgnkvjukovkrvdaiq`, Lovable project
`bd21b544-c7b8-4780-bdde-391ac9d4bfa8`). Read `CLAUDE.md` first. Lovable is the only SQL and deploy path. Post every
generated clip and still into the chat as soon as it exists. Spend: Fendi said "No cap" on 15 Oct, but every paid call
still goes in `docs/LEDGER_YSL_TESTING_BUDGET.md` with its basis.

## Standing rule from 15 Oct 07:45 UTC (DECISION, Fendi)

"All pass" on the five Chicago dressed windows and the composite integration test; then: **"I'm confident in the
capabilities — no more passing off to me for judgement. You can build freely."** From here the agent judges results
itself against the kill criterion (identity, garment construction, cap/logo, no flicker or morph), keeps posting every
output, and does not gate work on a verdict. Spend stays recorded in the ledger at its basis; alternates only, never
overwriting a selection.

## Fendi's production order (15 Oct) and where each step stands

| # | Step | State | Evidence |
|---|---|---|---|
| 1 | Treatment and lyric timing | DONE on candidate 6 `358363e6-33ba-48e0-bd88-e80b57ac6b3c` (100 shots, 1.5–3 s, cuts on beats; lyric line 52 re-timed; sections/hooks/drops) | `docs/review/production_2026-10-15/PHASE1_TREATMENT_AND_RECUT.md` §0 |
| 2 | Cast and outfits | DONE as data: Mastic jacket + beige/ivory cap for "Chicago, the switch" (70.85–100.36); lambskin coat + Y Varsity cap for "The cold front" (100.36–121.99); trench + confetti shirt + bucket hat for "The clean entrance" (163.31–182.98) | `variation_scenes` for candidate 6; `ib_looks_by_scene/decisions.json` |
| 3 | Shot plan and performance selection | Candidate 6 marks performance shots c041–c047 (Chicago), c048–c054 (grill ECUs), c055–c066 (cold front), c085–c093 (clean entrance). 22 clips carried from candidate 5 (0–70.85 s). | same report, §C |
| 4 | Generate scene assets | PHASE 2 DONE for the empty non-performance shots: realism plates for the three performance locations (unselected, under `worlds/`), 34 stills + 34 Kling clips selected on c019–c021, c024, c027, c036, c038, c040, c067–c084, c091, c094–c100. Plate prompt recipe: `docs/recipes/PLATE_REALISM_PROMPT.md` (Fendi: "they need to look real"). | `docs/review/production_2026-10-15/PHASE2_PLATES_STILLS_DRESS.md`; ledger rows 30–32 |
| 5 | Process only selected performance segments | TOOL LIVE ("Dress this shot", PR #260; 4 s floor fix PR #262). **Cold front and clean entrance dressed in grouped windows (15 Oct night, ledger rows 36–37; recipe doc last section):** coldW3 `1a83a167` (c062–c066), entrW1 `011a1323` (c085–c087), entrW2 `ed28aba0` (c088–c090), entrW3 `51c1156c` (c092–c093) PASS and filed unselected with covered-shot assignments; coldW1 `e09b1a3a` and coldW2 `0e995b73` REJECTED (cap not swapped / cap morph + sleeve patch); re-run cap-first after the 16 Oct top-up (ledger row 38): **coldW2 `82e04339` PASS** (assignments c059–c061), coldW1 `0de457ac` REJECTED (black cap, no Y); coldW1 went a third time with the cap references first (row `81cc8a5e`, ledger row 39) — see "Cold-front re-runs" below. **Chicago fully dressed as unselected alternates:** c042 (`6eea726d`), c047 (`f540b6be`, conformed 4.9551), and after the top-up c041 (`2f55f4fa`), c044 (`6d8043a2`), c045 (`e6788d22`), c046 (`92c15951`), each conformed 4.0039 s, ratio 1.079694, with a derived sync at its song start and `is_primary = false`. Fendi has the side-by-sides; no verdict yet. Cold front (c055–c066, coat) and clean entrance (c085–c093, trench) not dressed. | ledger rows 33–35; `WARDROBE_SWAP_RECIPE.md` "Production: the Chicago windows" |
| 6 | Integrate and finish | **LANE LIVE 16 Oct 00:52 UTC ("Composite over plate"; PR #266 + CC #69, redeployed and published, verified from this session — see "Composite lane: LIVE" below). First production run not yet made (needs a browser press).** Fendi passed the composite test 15 Oct ("All pass"). The 15 Oct recipe (variant D) is `src/lib/composite/pixels.ts`; the matte is Fal `veed/video-background-removal` via CC (the Runway connector has 2 credits). Restage is NOT an approved production method. | `docs/recipes/DRESS_AND_INSERT_WORKFLOW.md` step 6; `PLATE_REALISM_PROMPT.md` last section |
| 7 | Review the assembled sequence | NOT STARTED. No timeline rows for candidate 6. | — |

## Verify first (cheap)

1. **Live build:** crawl `https://aivideotool.lovable.app/projects` chunks (keep the `projects._id.` prefix in chunk
   names — a crawler that strips it fetches 404 pages; fetch with `Accept-Encoding: identity` and grep with `-a`) and
   grep for `Dress this shot` (storyboard chunk) and `Pace and clip lengths` (treatment chunk). Both present on 15 Oct
   04:35 UTC. **The 4 s floor (PR #262, merged `412b11d`, published 06:30 UTC):** the shared chunk
   `storyboard-ysnm7tJT.js` (named from `index-lzvqS7ss.js`) contains `Math.max(Ke,` once in the window planner and the
   cutter's `Math.max(1,b-_)` tail; an older build has `Ke-` guards there instead. No edge function changed in #262.
2. **Tick live:** unauthenticated POST to `/functions/v1/provider-jobs-tick` → 401.
3. **The filed swap:** `avt_select project_assets id=6eea726d-a243-478a-8f4e-09f5b5665b77` → `metadata_json.conformed_duration`
   = 4.0039, `derived_from.method = dressed`; `shot_asset_assignments` on shot `928ff526…` has it with `is_primary = false`.
4. **Candidate 6 timing:** 100 shots, the app conform planner reports 0 moves.
5. **c047 dressed:** `avt_select project_assets id=f540b6be-5e1d-40b5-861e-6c5c08e03a96` → `metadata_json.derived_from.method = dressed`,
   `conformed_duration = 4.9551`, `retime_ratio = 1.052415`; `performance_syncs` row `5f694cb6` derived/confirmed at 82.025;
   `shot_asset_assignments` row `9e3cc233` on shot `be22916e…` with `is_primary = false`.
6. **Higgsfield balance:** submit nothing paid to Higgsfield until a `video-providers-job-status` poll of a fresh request no
   longer answers "Your credit balance is too low". The cheapest probe is to resubmit ONE of the four refused rows (below).

## Higgsfield balance — EXHAUSTED AGAIN 23:43 UTC (was lifted 07:27 UTC: "I topped up higgsfield")

**Current state:** the 07:27 top-up covered the four Chicago re-runs ($13.62) and the six grouped windows ($35.42,
row 36) and then ran out; the two cap-first re-runs (row 37) were refused at intake. The "Cold-front re-runs — BLOCKED"
section above has the resubmit. History of the morning top-up follows.

The four Chicago windows were resubmitted at once (rows `b81e43f8` c041, `532743b8` c044, `c97c854b` c045, `23196396`
c046; requests `6b1e6ea8`, `b7babd92`, `9b9feb5f`, `9407b44b`; ledger row 35). Their results are recorded in
`WARDROBE_SWAP_RECIPE.md` "Production: the Chicago windows" once the tick files them. If the balance ever runs dry
again, the procedure below is the resubmit (the earlier refused rows are `eb1d35ee`, `5465390e`, `2593a6fb`, `459e6977`):

- the 4.004 s cuts are already in Higgsfield's media store — CDN URLs
  `https://d2ol7oe51mr4n9.cloudfront.net/user_3DpOSQeJ4qh1p66uOWhK1Za6ihs/<id>.mp4` with ids `08c08157-7fd6-4d3f-8a61-c446e8c44b5d`
  (c041), `4f433e99-d0fd-4fd7-82c7-ad77a2056ce6` (c044), `2d4a6aa6-d396-4040-86e1-6d20d25a38d8` (c045),
  `e9f0aacc-5f52-47c4-a095-1a18ac3bc8f4` (c046);
- the refused rows `eb1d35ee`, `5465390e`, `2593a6fb`, `459e6977` carry the full `request_payload_json` (prompt, reference
  paths, window, handles, songStart). For each: insert a NEW `provider_jobs` row with the same `request_payload_json` and
  `status queued`, call `proxy-provider-call` → `video-providers-higgsfield-model` with the same body (sign the four
  reference paths from `wardrobe-refs` for 2 h), then `avt_update` the new row's `external_job_id`. Do not reuse the failed
  rows: the tick has finalized them.
- expected: `status queued` on submit, `succeeded` with a `resultUrl` within ~5 min, the tick files an asset with
  `conformed_duration` 4.004 ± 0.01 and a derived sync at 71.215 / 75.885 / 77.855 / 79.82. Cost ≈ $3.405 each at 5 started
  seconds (ledger row 34).

## Cold-front re-runs — DONE: coldW2 PASS, coldW1 CLOSED after five cap failures (16 Oct 01:21–02:00 UTC)

Fendi topped up at ≈ 01:15 UTC ("Topped up"). The resubmit went exactly as written in the previous version of this
section: two NEW rows copying the cap-first request, references re-signed, Higgsfield-store sources, both `running`
within three minutes, filed by the tick within 12–16 minutes.

| Window | Row / request | Asset | Verdict |
|---|---|---|---|
| coldW2 c059–c061 | `c2c869b3` / `420c9d91` | `82e04339` (conformed 8.9591, sync 105.355, unselected) | **PASS** — assignments on c059 (tick), c060, c061 (agent) |
| coldW1 c055–c058 | `486a6d06` / `580d3b05` | `0de457ac` (7.9583, sync 99.46, `rejected`) | REJECTED — black cap, no Y |
| coldW1 third try | `81cc8a5e` / `7c3b60c5` (`recipe-coat-v3-caprefs-first-2026-10-16`, cap images first) | `514901e3` (7.9583, sync 99.46, `rejected`) | REJECTED — ivory mark at the crown apex, front Y only in the last ~1.5 s |

Verify (cheap): `avt_select project_assets id=82e04339…` → `approval_status pending`, `metadata_json.conformed_duration 8.9591`;
`avt_select shot_asset_assignments asset_id=82e04339…` → 3 rows (c059, c060, c061), all `is_primary false`.

Ledger rows 38–39; the recipe doc's "Re-runs" paragraph has the per-frame findings. The reference-order try failed on the Y too, and so did the split into two 4 s windows (ledger row 40: A `d51e37e3`
plain black cap, B `2e45bf14` cap untouched; coat right in both). **coldW1 (c055–c058) stays undressed and is CLOSED
for Genjutsu re-runs** — five runs, five cap failures on one eight-second stretch where he faces three-quarter away
from a low camera; the same recipe held the cap on every front-facing window. The recipe doc's "Re-runs" paragraph
records the decision and the two ways forward (a deterministic cap-logo composite on the coat-right take, or
re-covering the beats from a front-facing stretch). Do not resubmit coldW1 with another prompt.

| Window | Row / request | Asset | Verdict |
|---|---|---|---|
| coldW1 A c055–c056 (4.004 s) | `b2fa6986` / `fe9258ae` | `d51e37e3` (4.0039, sync 99.46, `rejected`) | REJECTED — plain black cap, no Y |
| coldW1 B c057–c058 (4.154 s) | `f6475ae0` / `a1a34737` | `2e45bf14` (4.1539, sync 103.264, `rejected`) | REJECTED — cap not replaced |

## Composite lane: LIVE since 16 Oct 00:52 UTC (VERIFIED from real output)

Code: AVT PR #266 (merged `0e8fabad`; security + architecture reviews recorded on it) + CC PR #69 (merged `43fe8a09`).
Made live through Lovable and verified from this session, not from the agents' claims:

| What | Evidence |
|---|---|
| CC `switchx-restyle` + `fal-queue-poll` redeployed from `43fe8a09` | source_sha256 `e0c1537c…`, `aef2837e…`; anonymous POST → 401 from each (curl from this session) |
| AVT `matte-video-proxy` (new) + `fal-queue-poll-proxy` redeployed from `0e8fabad` | source_sha256 `03ed3b4a…`, `6e1f115c…`; secrets present (`COMPOSE_LOOK_CC_URL`, `COMPOSE_LOOK_PROXY_SECRET`); anonymous POST → 401 from each |
| AVT frontend published (deployment `bb649000-…`) | live entry `/assets/index-BdbvCC2Q.js`; chunk `projects._id.storyboard-B-_Z2s10.js` contains `focus-composite-shot` |

**First production run DONE, by the agent itself (16 Oct 02:47 UTC).** The press that needed a person became a
capability: `avt_browser_session` + `scripts/agent-browser/avt-press.mjs` (PRs #270, #271; handoff
`HANDOFF_AGENT_BROWSER_2026-10-16.md`). c047 composited over the 79th/Lafayette plate: asset `ccb146c9`, matte
`01a1429b` ($0.089, ledger row 41), sync 82.025, unselected on c047 — PASS. The composite is made in the BROWSER
(WebCodecs) — now a headless Chrome for Testing this session drives; the only paid part is the matte
(≈ $0.09 for c047). After it, judge the clip against the kill criterion as for the dressed windows and record a
ledger row with the request id from the asset's `composite.matte`.

The deploy steps, kept for a redeploy:

1. **CC** (`7fce9fc6-fd96-4a31-8a89-649f00298c51`): **Edge Functions → redeploy `switchx-restyle` AND `fal-queue-poll`**.
   Expected: unchanged behaviour for every other caller; `switchx-restyle` answers `400 model_not_allowed` for a model
   outside the list and a queue handle for `veed/video-background-removal`; `fal-queue-poll` answers
   `400 invalid_queue_url` for a status link that is not on `queue.fal.run` (it used to poll it with the Fal key —
   a HIGH the security review found; this redeploy closes it for every AVT lane).
2. **AVT** (`bd21b544-c7b8-4780-bdde-391ac9d4bfa8`): **Edge Functions → redeploy `matte-video-proxy`** (new; it needs
   the same secrets `sam3-segment-proxy` has: `COMPOSE_LOOK_CC_URL`, `SWITCHX_PROXY_SECRET` or
   `COMPOSE_LOOK_PROXY_SECRET`) **and `fal-queue-poll-proxy`** (the same link check); then **Publish** the frontend
   (the button, the dialog, the browser pipeline).
3. **Verify, cheaply:** `curl -s -o /dev/null -w '%{http_code}' -X POST https://qoyxgnkvjukovkrvdaiq.supabase.co/functions/v1/matte-video-proxy -H 'content-type: application/json' -d '{}'`
   → **401** = deployed and refusing an anonymous call; **404** = not deployed. The live bundle check in "Verify first"
   must find `focus-composite-shot` in the storyboard chunk after Publish.
4. **First run:** open c047 (the 4.955 s Chicago window, dressed asset `f540b6be`) full screen → "Composite over plate"
   → the dialog shows the Chicago plate and ≈ $0.089 → Dry run first (console shows the request, nothing sent) → then
   Composite. Expected: the matte returns in 1–3 min; frames composite in the page in under a minute; a new unselected
   alternate appears on c047 labelled "Your take · new background" with `derived_from.method composite`, a derived
   sync at 82.025, and `composite.matte.request_id` set. Post the clip. Ledger row at the matte's list price.
5. **Guardrails:** the lane never selects what it files; the only `provider_jobs` row it writes is the matte's spend
   record (provider `fal`, lane `matte`, no `batchRun` — the tick ignores it; the browser closes it); a rejected
   dressed take is never used; a source over 60 s or 200 MB is refused before spend; one matte per asset at a time;
   a matte left running by a closed tab is picked up on the next press, not paid for again. If the matte comes back with one file only, it is taken as
   the alpha (VP9 path) and will fail to decode — that is a finding (the model ignored `output_codec`), not a reason to
   patch the picker.

## Open decisions (Fendi's; defaults the agent will use if he says nothing)

1. **The switch timing.** The treatment puts the lights-back-on at the vocal entrance (61.01 s); the writer put it at
   72.33 s. Default: keep the writer's placement for now (the approved swap already sits in it); offer one ≈$0.06 pinned
   writer run as candidate 7 only if Fendi wants the switch on the vocal.
2. **The denim look's cap.** It still wears the Y Varsity cap (now also the coat's). Default: leave; the khaki Cassandre cap
   is unused. Changing it would outdate 3 locked viewer boxes.
3. **17 early shots with no media** (c003, c006, c009, c011, c013, c015, c019, c020, c021, c024, c027, c029, c030, c031,
   c033, c036, c038): they straddle candidate-5 cuts. Default: generate them with the realism recipe (≈$0.5 each still+clip).

## Next work, in order

1. **Plates for every performance shot** (c041–c047 Chicago, c055–c066 cold front, c085–c093 clean entrance): one realism
   plate per location designed around the take's camera (chest height, straight on, warm key camera-right). Use
   `world-still-proxy` with `promptVersion plate-real-v2-…`, n=2 at 1k ($0.14 per pair). File unselected.
2. **Dress the performance windows** — after the Higgsfield top-up: first the four Chicago resubmits (BLOCKER section),
   then cold front (coat outfit `0b4ae771`, c055–c066) and clean entrance (trench `d17c59f3`, c085–c093) with the in-app
   action (or the MCP path: plan with `dressWindow`, cut with ffmpeg at ≥ 4.0 s — never 3.95 — upload to Higgsfield media,
   write-ahead row, submit). Group adjacent 1.5–2 s shots so one 4 s run covers 2–3 shots.
3. **Composite** each dressed window over its plate with the lane (step 6, "Composite over plate" in the shot's
   full-screen view) once it is live — Chicago first (c041, c044–c047 over `50fa1ce3`/`b58cab47`, the newest Chicago
   plates; `adaee8ab` is the earlier one), then coldW3 and the three entrance windows. Each run bills ≈ $0.07–0.19 for
   the matte (Fal, list); append a ledger row per run with the request id from the asset's `composite.matte`.
4. **AI B-roll** for the non-performance shots 70.85–201.87 s: still-first (realism recipe) then image-to-video through the
   app's `generateBoxClip` route.
5. **Assemble** candidate 6 into a timeline and post a playable sequence (the song audio) to Fendi.

## Do not

- Do not scale a route Fendi has not passed on a short clip (he passed the composite test on 15 Oct; the lane is the
  scale-up, one shot at a time, each confirmed with its cost).
- Do not restage (not approved). Do not overwrite or unselect a chosen clip; alternates only.
- Do not edit a migration or a job row to make a check pass; a failing check is the finding.
- Do not commit media showing Fendi or the song; the repo is public.

## Report back

The four checks above with their output; every paid call with its basis; which of the open decisions Fendi answered;
any PR. End by writing the next prompt.
