# Prompt for the next agent — finishing "YSL Ice On" (15 Oct 2026, late)

Copy everything below the line into the next session.

---

You are continuing AVT (repo `fendifrost-dot/ai-video-tool`, Lovable Supabase `qoyxgnkvjukovkrvdaiq`, Lovable project
`bd21b544-c7b8-4780-bdde-391ac9d4bfa8`). Read `CLAUDE.md` first. Lovable is the only SQL and deploy path. Post every
generated clip and still into the chat as soon as it exists. Spend: Fendi said "No cap" on 15 Oct, but every paid call
still goes in `docs/LEDGER_YSL_TESTING_BUDGET.md` with its basis.

## Fendi's production order (15 Oct) and where each step stands

| # | Step | State | Evidence |
|---|---|---|---|
| 1 | Treatment and lyric timing | DONE on candidate 6 `358363e6-33ba-48e0-bd88-e80b57ac6b3c` (100 shots, 1.5–3 s, cuts on beats; lyric line 52 re-timed; sections/hooks/drops) | `docs/review/production_2026-10-15/PHASE1_TREATMENT_AND_RECUT.md` §0 |
| 2 | Cast and outfits | DONE as data: Mastic jacket + beige/ivory cap for "Chicago, the switch" (70.85–100.36); lambskin coat + Y Varsity cap for "The cold front" (100.36–121.99); trench + confetti shirt + bucket hat for "The clean entrance" (163.31–182.98) | `variation_scenes` for candidate 6; `ib_looks_by_scene/decisions.json` |
| 3 | Shot plan and performance selection | Candidate 6 marks performance shots c041–c047 (Chicago), c048–c054 (grill ECUs), c055–c066 (cold front), c085–c093 (clean entrance). 22 clips carried from candidate 5 (0–70.85 s). | same report, §C |
| 4 | Generate scene assets | PHASE 2 DONE for the empty non-performance shots: realism plates for the three performance locations (unselected, under `worlds/`), 34 stills + 34 Kling clips selected on c019–c021, c024, c027, c036, c038, c040, c067–c084, c091, c094–c100. Plate prompt recipe: `docs/recipes/PLATE_REALISM_PROMPT.md` (Fendi: "they need to look real"). | `docs/review/production_2026-10-15/PHASE2_PLATES_STILLS_DRESS.md`; ledger rows 30–32 |
| 5 | Process only selected performance segments | TOOL LIVE ("Dress this shot", PR #260). Chicago: c042 (approved look, asset `6eea726d`) and **c047 (asset `f540b6be`, conformed 4.9551 s, ratio 1.052, sync `5f694cb6` at 82.025, assignment `9e3cc233` unselected)** are dressed. **c041, c044, c045, c046 are NOT: refused twice** — first for 3.954 s cuts (provider floor is 4.0 s; tool bug fixed in commit `d0403e4`), then for **"Your credit balance is too low"** (the Higgsfield organisation balance behind CC's key is spent). Cold front and clean entrance not dressed. | ledger rows 33–34; `WARDROBE_SWAP_RECIPE.md` "Production: the Chicago windows" |
| 6 | Integrate and finish | METHOD VALIDATED ON ONE CLIP, NOT YET IN THE TOOL: Runway `remove_video_background` matte + ffmpeg composite over a realism plate (key gradient, inner-edge light wrap, plate defocus, grain). Posted to Fendi 15 Oct; no verdict yet. Restage is NOT an approved production method. | `PLATE_REALISM_PROMPT.md` last section; scratch recipe in this session only |
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

## BLOCKER — Higgsfield balance (Fendi's to lift)

Every Higgsfield call through Control Center (Genjutsu dress runs, Kling clips) is refused until the organisation balance
behind CC's `HIGGSFIELD` key is topped up. Fendi tops it up on the Higgsfield API billing page for that organisation (the
agent never sees or asks for the key). After the top-up, the four Chicago windows are a **resubmit, not a re-plan**:

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
3. **Composite** each dressed window over its plate (matte + ffmpeg as in the recipe); file as `edited_clip` with
   `derived_from.method = composite` and a derived sync (see `scripts/qa/composite_register.py` for the row shape); put it
   on the shot as an alternate. Build this into the tool as a lane only after Fendi passes the first two.
4. **AI B-roll** for the non-performance shots 70.85–201.87 s: still-first (realism recipe) then image-to-video through the
   app's `generateBoxClip` route.
5. **Assemble** candidate 6 into a timeline and post a playable sequence (the song audio) to Fendi.

## Do not

- Do not scale a route Fendi has not passed on a short clip (composite is pending his verdict).
- Do not restage (not approved). Do not overwrite or unselect a chosen clip; alternates only.
- Do not edit a migration or a job row to make a check pass; a failing check is the finding.
- Do not commit media showing Fendi or the song; the repo is public.

## Report back

The four checks above with their output; every paid call with its basis; which of the open decisions Fendi answered;
any PR. End by writing the next prompt.
