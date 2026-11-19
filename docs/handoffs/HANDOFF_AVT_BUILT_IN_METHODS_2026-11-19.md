# HANDOFF: build the proven methods into AVT (19 Nov 2026)

For the engineer agent who takes this next. Three jobs, in this order:

1. **Audit** YSL, Hyenas and Partnership / Cease & Desist: a real accounting of what was spent, what was rework, and
   which method ended up approved for each of the four areas below. $0.
2. **Fix the Treatment writer** so its own text comes out in Fendi's house style. Code, one reviewer, Lovable redeploy.
3. **Build the four methods into the app** so no agent has to rebuild them: the outfit swap, the person matte, the
   light match and the exact-pixel face put-back. Class C: three sign-offs before merge.

Fendi, 19 Nov 2026 (his words, the reason for this handoff): "I would also like you to include the outfit swap,
proper masking method with lighting matching and face repair of exact pixels that we use frequently so that it is
built directly into AVT. for some reason every agent tries to reinvent the wheel on these costing me time and money,
have the agent review each project (YSL, hyenas, partnership/cease and desist) so we can have a real accounting and
robust infrastructure built in based off of real life projects."

And on 17 Nov (`docs/handoffs/PARTNERSHIP_STORM_VERSE_METHOD_PLAN.md:3-4`): "We have already wasted money on proven
methods being ignored."

Every claim here carries a label. VERIFIED = I read the line or ran the command (cited). OBSERVED = read by a
sub-agent of mine on 19 Nov and spot-checked, not re-derived by me. Nothing in this file is LIVE: it is a plan.

---

## 0. Start state (read before anything)

| | |
|---|---|
| Repo, branch for your work | `fendifrost-dot/ai-video-tool`, a new branch from `main` |
| Where this file and the newest notes are | branch `storm-camera-from-footage`, PR #508 (OPEN, not draft, mergeable). VERIFIED 19 Nov: 52 commits ahead of `main`, 1 behind |
| What is only on that branch | this handoff; the "Treatment reads like a plain rap video" row in `docs/PROBLEM_INDEX.md`; lesson 19 in `.claude/skills/avt-music-video-build/SKILL.md`; `scripts/edit/still_face_from_photo.py`, `photo_people_cutout.py`, `still_head_pasteup.py`, `place_still_figure_on_plate.py`; changes to `still_face_putback.py`, `matte_repair.py` and `scripts/edit/blender/*` (storm set) |
| What is already on `main` | `scripts/edit/body_only_swap.py`, `composite_over_plate.py`, `matte_stability.py`, `docs/PROBLEM_INDEX.md` (older), the Thuggpapi reference, `treatment-writer-proxy` |
| Backend | Lovable-managed only. Project ref `qoyxgnkvjukovkrvdaiq`. No `supabase` CLI, no dashboard, no service role, no local SQL. Pass the pre-flight in `docs/AGENT_BOOTSTRAP.md` |
| Money so far | Partnership ledger $58.73 at estimate, rows 1-37 |

**Step 0 (lesson 15: "a policy that lives only in an open PR does not exist").** PR #508 mixes docs (Class A) with
rendering scripts (Class C). Either get it its sign-offs and merged, or open a docs-only PR from `main` that carries
this file, the PROBLEM_INDEX row and lesson 19, and merge that first. Do not start the code work from a `main` that
lacks them.

**`docs/HANDOFF_TEMPLATE.md` does not exist** (VERIFIED: not in the tree, not in git history) though two skills cite
it (`.claude/skills/avt-clothing-swap/SKILL.md:165`, `avt-music-video-build/SKILL.md:60`). Write it (Class A) from
what those lines require: done vs not done with ids and hashes, expected values, a cheap command that tells outcomes
apart, what not to do, what to report, CODED is never LIVE.

## 1. Rules that bind this work

- **Classify first** (`docs/ARCHITECTURE_REVIEW.md`). The writer fix is Class B (one reviewer). Anything that touches
  garment swap, face restore, compositing or a job queue is Class C: architecture + product + security sign-off
  before merge, a `RISK_REGISTER.md` entry, conformance to `docs/VIDEO_SWAP_ARCHITECTURE.md`.
- **Deploy chain.** Code on `main` → Lovable **Publish** for the frontend → Lovable **Edge Functions → redeploy** for
  each touched function, named in your report. Publish is not an edge redeploy. SQL only in Lovable's SQL editor.
- **No Grok on anything that ships.** The writer's text model (`grok-4-fast`, text only) is the app's own and is not
  what that rule is about; do not change it in this work.
- **Never a generated lip-sync or a face-altering pass on Fendi.** The put-back's proof line must print 0.
- **Benchmarks are derived from evidence** (`docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md`): the golden fixtures in §4.5 are
  approved assets with Fendi's words on record, not items that "seem right".
- **Media** only under `/Volumes/T7/...`; never iCloud paths. Never commit media of him or the song (public repo).
  Never print a signed URL, token or key.
- **Money.** Dry run first, state the price, add the ledger row in the same commit. Budget for this whole handoff:
  under $5 (§6). Anything above that is Fendi's call.
- **Fendi approves, in his words.** You never mark a result approved. He is not an engineer: report in plain words,
  decide technical matters yourself.

---

## 2. Job 1: the audit (do first, $0)

Deliverable: `docs/audit/METHODS_ACCOUNTING_2026-11.md`, plus a normalised ledger (see 2.3).

### 2.1 Draft figures to verify (OBSERVED, from the ledgers as written; all list-price estimates)

| Project | Ledger total | File | Caveat |
|---|---|---|---|
| YSL "Ice On" | **$638.57**, rows 1-279, 21 Sep - 7 Nov | `docs/LEDGER_YSL_TESTING_BUDGET.md:321` | summary sentence at line 245 still says "≈ $105.45 (rows 1-37)": stale |
| YSL environment phase | **$124.29**, 44 rows | `docs/LEDGER_ENVIRONMENT_BROLL_BUDGET.md:58` | outside the YSL total |
| Hyenas | **$38.24**, 30 calls, 13 Nov only | `docs/LEDGER_HYENAS_2026-11-13.md:21` | about $37 more spent before 13 Nov is in no ledger (prose in the Hyenas handoffs) |
| Partnership | **$58.73**, 37 rows | `docs/LEDGER_PARTNERSHIP_CEASE_DESIST_2026-11-11.md` | "billed: unknown" on every row |

Spend by what it bought (OBSERVED; YSL sorted by provider text because the ledger has no category column):

| | YSL | Hyenas | Partnership |
|---|---|---|---|
| Clothing / object swaps (Genjutsu) | $244.49, 34 rows | $35.36, 13 calls | $7.49 |
| Mattes (`matte-video-proxy`) | $4.00, 30 rows | $0.66 | $0.93 |
| Stills | Grok $10.16, Gemini $0.54 | Gemini $1.89 | Gemini $11.07 |
| Seedance clips | $326.91, 95 rows | none | $38.91 |
| Treatment writer | $0.06 | none | $0.32 |

Rework (ESTIMATE from the result text; the engineer confirms row by row):

| Project | Rework | Of which re-solving something a note already covered |
|---|---|---|
| YSL | about $210 of $632 | rows 159 ($3.41, "You didn't do the clothing swap"), 203-209 (about $17.9, "None of these had clothing swap"), 216, 137-138 (lip-sync, "alters my face and looks crazy"); most of the rest was first-time derivation |
| Hyenas | about $45 of about $75 known | nine swaps $24.48 rejected ("my dog is laying down and you have the hyena standing"), 19 Grok stills + 11 Grok clips $4.57 after Grok was demoted, five stills of him $1.35 ("clearly not me in the face"). Fendi: "We already had a formula that was 100% effective ... refer to the YSL video edit" |
| Partnership | about $23.6 of $58.73 | about $14.6: rows 2, 3, 5 (swap on a take with a fan, on a wrong window, on generated footage), 6-8, 29 (his face from a generated still) |

By method, across the three (OBSERVED / ESTIMATE):

| Method | Spent | Rework | Times re-derived |
|---|---|---|---|
| Swap | about $312 | about $146 | 2 across projects, 2 inside YSL |
| Matte | about $6 | about $2 | 2 across projects (Hyenas: RVM, SAM by flow, SAM 2; Partnership: local segmenter, colour gate, homography) + the rejected temporal fill repeated once |
| Light match | $1.66 paid (SwitchX twice, two Gemini "blend" passes); the approved methods cost $0 | all of it | 2 |
| Face put-back | $0 for the script; about $10.6 of paid work caused by not using it | all of it | 2 |

**The dollars understate it.** The four methods are local scripts and cost $0 a run; their rework is hours, and no
file records hours. Say so in the audit rather than inventing a number.

### 2.2 What the audit must settle

1. Verify every figure above against the rows; replace ESTIMATE with exact sums and row lists.
2. Per project and per method: the approved script or function, its settings, the approved asset id, Fendi's words,
   and the file:line where that is recorded. Draft (OBSERVED):
   - **Swap.** `dress-clip` (Genjutsu, 720p, window ≥ 4 s) → `scripts/edit/body_only_swap.py`, `AVT_HEAD_ZOOM=4`
     (3 on full body), head fit off. YSL c033 `5482b35b` ("make it the canonical reference for preserving my real
     facial performance during clothing swaps"), c041 `6f4edd50`. Creature or prop: `--base swap`, retime auto
     (Hyenas). Stills: clothes-only Gemini edit of a real photo → `still_face_putback.py`; in a scene the whole head,
     `AVT_FACE_EXACT` (Allen `34bd95ac`, `077a3515`, `14f9d5dd`).
   - **Matte.** `matte-video-proxy` (veed) on the put-back, as delivered → `composite_over_plate.py`. YSL c033
     showroom `8a527bab`; Hyenas verse 0.9 with `--key-dark-box`, Fendi: "Perfect". Photos: `photo_people_cutout.py`.
   - **Light match.** The weakest record. Approved with his words: stills and c009 v3 `b06b32f9` ("I like it",
     `place_him_over_plate.py --gain --contrast`), cover `5b825de7` (`cover_regrade_figure.py`). Blender
     `comp_scene.py` with light measured on the plate is the built-scene method, **but** PROBLEM_INDEX cites showroom
     v9 `436ffebe` as proven while `docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md:8` says "Fendi has not
     judged it" (VERIFIED). On Hyenas he left it to Grokbot: "grokbot can do it in after fx". The audit must list
     which light-match results he has actually approved and correct the index.
   - **Face put-back.** Proof line `max |out-original| on face/hair/skin: 0`; checks `face_check.py`, `mouth_scan.py`,
     `ring_flicker.py`, `hat_geometry.py` (approved range 0.03-0.14).
3. The record's holes, each with a fix or an honest "unknown": no provider bill behind any Higgsfield, Fal or Google
   row (real Higgsfield bills ran 0.51-0.70× list, YSL ledger line 112); Fendi's top-ups never totalled; Hyenas spend
   before 13 Nov unledgered and its swap jobs absent from `provider_jobs`; YSL rows out of order, three duplicate row
   numbers, a different project's cover mixed in, nothing after 7 Nov; no hours anywhere.

### 2.3 Make the accounting automatic (RECOMMENDATION, Class B)

A hand-kept markdown ledger is why this audit is hard. Give every paid row three machine fields: `category` (swap,
matte, still, clip, writer, other), `method` (the PROBLEM_INDEX row or recipe it followed, or `none`), `outcome`
(approved, rejected, superseded, test) with Fendi's words. Source it from `provider_jobs` and `writer_runs`, which
already exist, and show it per project in the app. Then "how much did we spend re-solving the matte" is a query.

---

## 3. Job 2: the Treatment writer (Class B)

### 3.1 What is wrong (VERIFIED in `supabase/functions/treatment-writer-proxy/contract.ts` on this branch)

| Line | Text | Effect |
|---|---|---|
| 263 | "Write its treatment: ONE idea, strong enough to hold the whole song" | one concept, not a twist per line |
| 264 | "Stage it in a small number of places that return, so the video feels like one world" | forbids a new impossible place per line |
| 252 | "Cut it like a real music video ... Of every three shots about two are performance and one is a cutaway" | a regular rap video by rule |
| (none) | nothing asks for a twist, the impossible, deadpan, or a montage | |
| (none) | `video_projects.creative_exemplars` (column exists; YSL has four entries) has no reader in `src/` or `supabase/` | his references never reach the writer |
| `beats.ts` | a beat is pinned to a shot only through `lyric_cue`, the sung words quoted in the treatment; the AI's own treatment quotes none | scenes are shared out in equal blocks (the salad landed at 1:08) |

Fendi's rejection, 19 Nov: "Our treatments are supposed to be in line with the lyrics but produce mostly dynamic
photorealistic results with crazy or viral twists that resemble a hip hop montage prompting similar to how thugpappi
makes his videos in Higgsfield. Your treatment is too basic and honestly boring. Nothing unpredictable or engaging
just a regular rap video that will get overlooked."

The style already exists in the repo, unused by the writer:
`docs/research/references/THUGGPAPI_SEEDANCE_MONTAGE_PROMPTS_2026-10.md`, `MONTAGE_STYLE` in
`src/lib/storyboard/montage.ts:31`, and his hand-written YSL treatment "Interrupted Broadcast". A treatment written
by hand in that shape is on the board now: variation `fa7f6b85` "Montage twists" in project
`0c5c4421-1298-4919-bf62-2764ce7837fa`, source text on the T7 at
`PARTNERSHIP:CEASE & DESIST AVT Edit/work/treatment_v4_montage_twists.txt`. Use it as the worked example.

### 3.2 What to build

1. **A treatment style, default "montage twists" for a music video.** In that style the system prompt asks for: one
   style line for the whole video (handheld, quick optical zooms, 35mm grain, muted warm colour, fast cuts); then per
   sung line or couplet ONE impossible event that answers those words, physically happens in front of the camera,
   and that nobody in the picture reacts to. Places may change every line; what ties the video together is the style
   and a through-line, not a short list of places. Keep today's prompt as a second style ("classic") so nothing else
   regresses.
2. **Lyric cues.** The treatment is written in song order and each scene quotes the words it sits on ("When he raps
   "..." ..."), so `allocateBeats` pins it. Lines with no scene fall back to his performance footage, never to a
   repeat of a neighbouring twist.
3. **The performance share follows the treatment.** Drop the fixed two-in-three in the montage style
   (`TREATMENT_DECIDES` already exists for this). Fendi, 19 Nov: "generate scenes that go with the lyrics and switch
   in my performance shots throughout the video."
4. **Send the references.** Read `video_projects.creative_exemplars` and include it; ship the Thuggpapi patterns as
   the built-in exemplars of the montage style.
5. **What stays sincere is the project's call, not a hardcoded rule.** On Partnership the scenes with Allen (his
   late partner) carry no joke. That was my interpretation, not Fendi's words; give the board a notes line for it,
   do not bake it into the prompt.
6. **Stop one twist filling many shots.** OBSERVED on `fa7f6b85`: shots 56-59 repeat the floating books
   (1:32-1:39), 28-31 hold the radios 6 s, 35-38 the wrestling ring 6.6 s, 70-73 stretch the yell over 2:03-2:16.
7. **Do not throw away a paid run.** An in-place "Rewrite the shots" that fails coverage files nothing after the
   provider was paid (ledger row 35, $0.0844). Offer the result as a candidate board instead.

### 3.3 Done means

- Unit tests in `contract.test.ts` / `beats.test.ts`: the montage prompt carries the style and the cue rule; the
  classic prompt is unchanged; a beat without a cue never spans more than a set number of shots.
- Merged to `main` after one reviewer; Lovable redeploy of **`treatment-writer-proxy`**; Publish if `src/` changed.
- Live check: one writer run on Partnership filed as a **candidate** board (about $0.08). Expected: its `writer_runs`
  row shows the new prompt fingerprint; every first-half scene quotes its words; the money table sits on "Flip
  through green ... salad", not a minute later; at least four in five non-performance lines carry an impossible
  event rather than a literal picture. Post the line → picture table to Fendi. He judges it; you do not.
- Report CODED / DEPLOYED (which function, when) / CHECKED LIVE (run id) separately.

Do not: change the text model; rewrite board `fa7f6b85` in place; write a treatment by hand and call the tool fixed.

---

## 4. Job 3: the four methods inside AVT (Class C)

### 4.1 Why agents keep rebuilding them (VERIFIED by reading the code, 19 Nov)

None of the four runs in the app. Each exists only as an offline Python script, so an agent working in the tool
cannot finish the job there and improvises.

| Method | Proven offline | What the app does today | Missing in the app |
|---|---|---|---|
| Outfit swap with his face kept | `dress-clip` → `scripts/edit/body_only_swap.py` (+ `swap_rate.py`, `face_track.py`, `head_fit.py`, `silhouette.py`, `dressed_4k.py`) | `dress-clip` files the whole-frame Genjutsu output; Region swap (`src/lib/regionSwap/`) blends the box back with a feather | any face protection on video; frame pairing (`--retime`); interpolation to the source rate (`mp4Retime.ts` only rescales timestamps); `--base swap`; the proof |
| Person matte | `matte-video-proxy` (veed) → `composite_over_plate.py`, `matte_repair.py`, `matte_stability.py` | matte + in-browser composite (`src/lib/composite/pixels.ts`, `render.ts`), page must stay open | dark-garment repair, occlusion line, stability check, placement (scale, position, exposure), any foreground that is not the shot's dressed take |
| Light match | `match_grade.py`, `place_him_over_plate.py`, `cover_regrade_figure.py`, `blender/measure_plate_light.py` → `blender/comp_scene.py` | one fixed grade constant (`pixels.ts` `GRADE`, lines 47-62), not measured from the plate | measured exposure and colour from the plate, light that follows the plate, the edge settings |
| Exact-pixel face | `body_only_swap.py`, `still_face_putback.py`, `still_face_from_photo.py`; checks `face_check.py`, `mouth_scan.py`, `ring_flicker.py`, `hat_geometry.py` | stills only: `src/lib/queries/faceRestore.ts` pastes an oval with a 14 px feather, colour-matched, so not exact | all of it on video; the proof and the four checks anywhere |

The gap is already written down five times and never closed: `CLAUDE.md` ("Integration gap"),
`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md:182-195` and `:234`, `docs/recipes/README.md:60-64`,
`docs/recipes/HIS_FACE_IN_ANY_SCENE.md:86-87`, `docs/recipes/DRESS_AND_INSERT_WORKFLOW.md:64`.

### 4.2 The constraint that shapes the design

Edge functions are Deno: they cannot run MediaPipe or OpenCV. The browser has no landmark model
(`package.json` has none). The only worker outside edge functions is **`workers/edit-render/`** (Node 22 + ffmpeg,
Blender on request; claims `edit_renders` rows through `edit-render-worker-api`; its Dockerfile has no Python). The
warp worker is research only and "not invocable in prod" (`RISK_REGISTER.md:225-233`).

RECOMMENDATION (the recipe already proposes it, `FACE_PRESERVING_CLOTHING_SWAP.md:191-195`): give that worker a
Python runtime with the pinned put-back dependencies and the two model files (`selfie_multiclass_256x256.tflite`,
`face_landmarker.task`; copies in AVT storage under
`project-exports .../canonical/body_only_swap_c033_2026-10-18/models/`), and new job types that call the **existing
scripts unchanged**. Port nothing to TypeScript: the scripts are the proven thing, and a rewrite is one more
reinvention. Where the worker runs, and who pays for it, goes in your design note for the architecture reviewer.

### 4.3 What to build: one pipeline, fixed stages, proof on the asset

One job, "Dress and place", reachable two ways: a press on a shot in the app, and one MCP tool for agents. Stages:

| # | Stage | Runs | Preset (from the approved assets) | Gate that must pass before the next stage |
|---|---|---|---|---|
| 1 | Window | worker | cut once, ≥ 4 s; the 720p copy and the working copy from the same frames | frame counts equal |
| 2 | Swap | `dress-clip` (Genjutsu) | dry run and price shown first | job in `provider_jobs`, output conformed |
| 3 | Put-back | worker, `body_only_swap.py` | `AVT_HEAD_ZOOM=4` (3 full body), head fit off, `--base original` for clothes, `--base swap` for a creature or prop, no mp4v intermediate | proof line = 0; face found on all frames (or the count shown) |
| 4 | Checks | worker | `face_check.py` sheet, `mouth_scan.py`, `ring_flicker.py`, `hat_geometry.py` | results filed as assets beside the clip; out-of-range values flagged, not hidden |
| 5 | Matte | `matte-video-proxy` (veed) on the put-back, as delivered | repairs only by name: `--key-dark-box`, `--occlude-y`; never a hold, fill, choke or re-key | `matte_stability.py` (bottom region included) filed; matte and picture paired frame by frame |
| 6 | Place and light | worker, `composite_over_plate.py` / Blender `comp_scene.py` | exposure and colour measured from the plate; edge settings `edge_tween_px 3`, `edge_colour_from_inside_px 1.5`, `edge_choke 0.15`, wrap 0 to 0.15 | before/after strip filed |
| 7 | File | app | the dressed-and-placed clip as a take on the shot | stays **unselected** until Fendi's words are on it |

Rules of the pipeline:

- **A whole-frame Dress output is labelled an intermediate** in the app and through the MCP, and cannot be made a
  shot's primary until stage 3's proof is recorded on the asset.
- **Presets are named after the approved asset they reproduce** (`c033_showroom`, `hyenas_verse_creature`,
  `allen_still_exact`). Any override takes a written reason, stored with the job.
- **Every stage records** model, version, settings, input hashes and seed (the prerequisites in `CLAUDE.md`,
  "LOCKED: Video garment-swap architecture").
- **Durable.** Per-stage status, retry and resume on the existing `provider_jobs` / worker queue; no
  `EdgeRuntime.waitUntil` for the long steps; the page does not have to stay open.
- **Stills get the same treatment**: clothes-only edit → `still_face_putback.py` (or `still_face_from_photo.py` with
  `AVT_FACE_EXACT` for a head in a scene), proof recorded.
- **The motion budget is a pre-check, not a lesson learnt again**: warn before stage 2 when the take has a fan,
  moving cloth or a light sweeping across him (build skill §3; Partnership rows 2 and 5 paid for this).
- **Light match is the least settled stage** (§2.2). Build stages 1-5 and the measured grade first; ship the Blender
  path only for what Fendi has approved in words.

### 4.4 Enforcement at the door agents use

`avt_call` already refuses a Grok generation without his words (`supabase/functions/avt-mcp/contract.ts:181-212`,
called at `index.ts:378`). Put the method guard beside it: a `dress-clip` result returns "intermediate: run the
put-back" with the exact next call; filing a clip of him as a primary without a recorded proof is refused with the
PROBLEM_INDEX row to read. A guard that explains the next step is what stops the improvising; a doc did not.

### 4.5 Golden fixtures (each slice must reproduce one before it merges)

Use stored inputs (the take and the stored Genjutsu output), so reproducing costs $0.

| Fixture | Approved asset | Must reproduce |
|---|---|---|
| Clothing swap + put-back | YSL c033 `5482b35b` (`scripts/edit/reproduce_body_only_c033.sh`) | proof 0; hat geometry inside 0.03-0.14 |
| Matte + composite | YSL c033 showroom `8a527bab`; Hyenas verse 0.9 ("Perfect") | `matte_stability.py` numbers no worse than recorded (leg flicker 5.28 on Hyenas v6) |
| Creature swap | Hyenas verse, `--base swap`, `AVT_HEAD_ZOOM=3` | face found 96/96; proof 0 |
| Still, exact head | Allen `077a3515` / `14f9d5dd` | `max |out-original| inside the hard head mask: 0` |

Freeze them read-only with provenance per `docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md`. The kill criterion in
`CLAUDE.md` applies to anything new on video.

### 4.6 Order of slices

a. Worker with Python + models + one job type: put-back with proof (closes the gap written down five times).
b. Checks filed automatically with every put-back.
c. Matte repair, stability and placement in the composite; composite off the browser.
d. Measured light match.
e. The one-call pipeline and the MCP guard.
f. Docs: `CLAUDE.md` "Integration gap" removed only when (a) is LIVE; PROBLEM_INDEX rows point at the press, not
   the script; recipes updated.

---

## 5. Review and redeploy checklist

| Step | Writer fix (B) | Pipeline (C) |
|---|---|---|
| Design note before code | short | required: where the worker runs, cost, failure modes, RISK_REGISTER entry |
| Reviewers | one | architecture + product + security |
| Tests reported by category (`docs/TEST_TAXONOMY.md`) | yes | yes, plus fixture reproduction |
| Merge to `main` | yes | per slice |
| Lovable Publish | if `src/` changed | yes |
| Lovable Edge Functions redeploy, each named | `treatment-writer-proxy` | `dress-clip`, `avt-mcp`, `edit-render-worker-api`, `provider-jobs-tick`, any new function |
| SQL | none expected | in Lovable's SQL editor only |
| Live check | §3.3 | one end-to-end run on a 4 s window, price stated first |

## 6. Money

| Item | Estimate |
|---|---|
| Audit | $0 |
| Writer live checks | about $0.08 a run; allow three |
| Fixture reproduction | $0 (stored inputs) |
| One end-to-end live run, 4 s window | about $2.72 swap + about $0.07 matte |
| **Ceiling without asking** | **$5** |

## 7. Report back

1. The audit file, with every ESTIMATE above replaced or marked unknown.
2. Per job: CODED (commit), REVIEWED (who), DEPLOYED (which functions, when), CHECKED LIVE (run or job id, expected vs
   seen). Never the word "verified" for something you did not run.
3. Fixture table: reproduced or not, with the printed numbers.
4. Fendi's decisions, listed plainly: the writer's candidate board; which light-match results he approves; where the
   worker runs if it costs money.
5. What you did not do, and why.

## 8. Do not

- Re-test a method that has an approved asset. Reproduce the fixture; do not re-derive it.
- Port the Python to TypeScript, or "improve" a script while moving it.
- Add a temporal hold, fill or flow-carried matte (rejected on YSL c033 room 2 and again on Hyenas v7).
- Use a generated still of him as a video model's face source.
- Open a Supabase dashboard, run the CLI, or ask Fendi to paste SQL.
- Mark anything approved.

---

## Also done on 19 Nov (context, not your job)

LivePortrait was downloaded to the T7 for a test of making Allen nod (not a verified method; results are in
`docs/handoffs/PARTNERSHIP_SHOT_LIST.md`). Its licence file says the bundled InsightFace detection models are "for
non-commercial research purposes only"; a shot that ships would need the detector replaced. It is not part of this
handoff and must not be wired into the app.
