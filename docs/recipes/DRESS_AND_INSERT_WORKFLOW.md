# Dress and insert: the music-video workflow (started 15 Oct 2026)

This page covers the director's six-step workflow for a music video: what the tool runs by itself, the rules it applies
every time and why, what each step costs, and how to check it.

**Change class: C** (`docs/ARCHITECTURE_REVIEW.md`). The change touches providers (a paid Higgsfield call through
Control Center), timelines (a derived take on the song clock) and orchestration (a server-side job). It needs
architecture, product and security sign-off before merge. The new risk is `DRESS-1` in `RISK_REGISTER.md`.

Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## The six steps

| # | Step | Where | Automated? |
|---|------|-------|------------|
| 1 | Treatment built | Treatment page | yes (writer), director edits |
| 2 | Outfits built; scenes wear them | Storyboard → Wardrobe panel | director decides; the tool resolves each shot's outfit |
| 3 | AI shots generated | Storyboard → Generate image / clip | yes, per shot, after a confirm with the cost |
| 4 | Performance shot selected per scene | Setup (sync) + Storyboard | the synced take is the base layer of every shot it covers |
| 5 | Clothing swap on that performance shot, **only if needed** | Storyboard → shot → **Dress this shot** | yes: cut, swap, conform, file; the director confirms the cost and picks the result |
| 6 | Insert the performance into the AI location, **only if needed** | offline composite | **no** — see below |

The storyboard page shows these steps as a read-only **Workflow** checklist with counts (`src/lib/storyboard/workflow.ts`).
Step 5 shows `dressed / needed` and how many dressed shots are **stale**. Step 6 reads **Integrate (composite)** and is
marked *not automated yet*.

### Step 6 is not automated (DECISION, Fendi, 15 Oct 2026)

- **Restage is not approved for production.** In his words: "The failed restaging tests are not approved production
  methods." The tool does not present restaging as the way to put a performance into an AI location. A dressed take is
  not fed into a restage.
- **Composite (matte over plate) is under validation.** It stays offline (`scripts/qa/composite_take.py`). A composite
  filed on a shot is counted in the checklist and plays in Review. Nothing in the storyboard submits one.

## Step 5: what "Dress this shot" does

The button appears in a shot's full-screen view when all of these hold:

- the shot is a **performance** shot;
- an original take in sync covers it;
- its scene's outfit, or the shot's own exception, has at least one piece.

DECISION: "needed" means the resolved outfit has pieces. A performance shot that should play the take as filmed sets its
wardrobe to **none** on the shot.

1. **Window only.** The shot's own stretch of the take is cut out in the browser, with handles (below), and uploaded as
   `project-clips/<user>/<project>/dress/storyboard_<key>_<ts>_src.mp4`. The whole take is never sent.
2. **References**, chosen deterministically (`dressReferences`), at most **4**:
   - first, the outerwear's **product photo only**. The v1 extra crops (website arrows, a lighter on-model jacket) made
     the edit copy the wrong garment;
   - then the hat, with its other angles while there is room: front, ¾, side, detail. The approved full look sent the
     cap's front, side and detail;
   - then the other pieces' product photos.
   - Pieces that do not fit are named in the confirmation.
3. **Words**, built from the pieces by `buildDressPrompt` (version `DRESS_PROMPT_VERSION`, now `dress-v1`):
   - "Replace ONLY the man's jacket and cap …";
   - each piece's construction, from its `dimensions_description`;
   - "Keep everything else exactly as in the source video …" (the recipe pattern).
4. **Cost, exact, before anything is sent**: billed seconds × $0.681 (720p), e.g. `4 s × $0.681 = $2.724`. The director
   confirms it. A cut that comes out longer than the seconds agreed is refused before upload. **Dry run** builds the exact
   request and record, prints them to the browser console, and cuts, uploads, records and sends nothing.
5. **Durable job.** The `provider_jobs` row is written before the call (write-ahead) and records:
   - the provider's own request id (not Control Center's id, which answers 404 on status);
   - in `settings.dress`, the whole dress record: model and variant, prompt and prompt version, reference storage paths,
     the take, its sync id and numbers, the cut window with handles, the shot window, the song start, the cut's measured
     length, the outfit (id, key, version), the scene, the shot, billed seconds and estimate.

   Closing the page stops nothing.
6. **On the server** (`provider-jobs-tick`, every minute):
   - ask the provider until done;
   - download the result (only from the provider's CDN, https, no redirects);
   - **conform** it to the cut's length;
   - store it;
   - file it as a **derived performance take, method `dressed`**, with `derived_from` = parent take, window, song start,
     job id, retime ratio and the dress record;
   - add a derived `performance_syncs` row (offset = the song time of the cut's first frame, the parent's drift);
   - put it on its shot **unselected, as an alternate**. What the shot shows changes only when the director selects it.

## The rules, and why

### Handles

The defaults are 0.5 s head and 0.75 s tail, minimum. They are set in one place, `src/lib/storyboard/dress.ts`.

- Why (OBSERVED on every run so far): the last ~0.5 s of the swap's output often has a soft or smeared face. The tail
  handle keeps that half-second outside the part of the cut the shot plays.
- **Pacing.** Most final cuts are 1.5–2 s. The swap takes at least **4 s** of source and bills **every started
  second**. After the minimum handles, the window therefore grows to fill the seconds that are billed anyway, split
  between head and tail and clamped to the take. That extra costs nothing. A 1.75 s shot gets ≈0.98 s head and ≈1.23 s
  tail in a 3.95 s cut.
- The cut is planned **0.05 s under** the whole second (`DRESS_BILLING_GUARD`), so a frame of rounding never starts
  another billed second.
- Where the take ends close to the shot, the handle is short, and the confirmation says so.

### Retime (speed conform)

- Why (OBSERVED on 1 Oct and on runs C, `678a62a8` and `71ff19f4`): the swap returns its clip about **7 % fast**, 3.71 s
  at 24 fps for a 4.00 s source at 59.94 fps.
- VERIFIED (15 Oct, frame comparison on `71ff19f4` against its 4.004 s source): the speed-up is **uniform**, not a trim
  at either end — the output's frame at 3.62 s matches the source at 3.92 s, and the output at 1.85 s matches the source
  at 2.00 s (both ≈1.08×). The 1 Oct run measured 1.0005× after conform (`scripts/edit/match_grade.py`). A uniform
  container retime is therefore the right correction.
- The measured ratio is recorded on the asset and must fall in **0.9–1.2**; outside that the clip is saved but not placed
  on the song, with a note, because the provider did something other than run fast.
- Nothing downstream stretches a clip:
  - the render contract plays each file at its own rate and holds the last frame;
  - Review only nudges the playback rate for a few hundredths of drift.
- So the **file** must be the source's length. `supabase/functions/_shared/mp4Retime.ts` is a lossless container
  retime:
  - it changes each kept track's `mdhd` timescale, so the sample durations (`stts`), reorder offsets (`ctts`) and
    edit-list media times all scale together;
  - it rewrites `mvhd`, `tkhd` and the edit-list segment lengths;
  - no frame is re-encoded, added or dropped, and `mdat` is untouched.
- Audio is dropped, because the song is the sound. The audio `trak` is renamed to `free`, so no byte offset moves.
- The asset records `output_duration`, `conformed_duration`, `conformed_to` and `retime_ratio`.
- A clip that does not measure within 0.01 s of its source after the retime is **never filed in sync**. The job retries,
  then gives up with the reason.
- A conform that refuses (not an MP4, a bad ratio, hostile bytes) still **stores the raw bytes**, linked to the job with
  `conform_error`, so a paid result is never stranded on the CDN. The job is failed with the reason and the raw clip
  stays in the project's library, never placed on the song.
- VERIFIED (15 Oct, in the agent sandbox, on an ffmpeg-made 720×1280 H.264 + AAC clip of 89 frames at 24 fps, 3.708 s,
  with B-frames, `ctts` and an edit list), after `retimeMp4(…, 4.004)`:
  - `ffprobe` reads one video stream, 89 frames and 4.0039 s;
  - there is no audio stream;
  - `ffmpeg -f null` decodes every frame without an error.
- NOT verified: playback of a retimed file in Chrome and Safari, and a real swap output. The first import is that check.

### Current or stale (it only flags)

Each dressed take records its chain of inputs:

> scene → outfit (id + version) → take, sync, window with handles → prompt version and references → the dressed asset →
> its shot.

`dressStaleness` marks it **stale** with the reason when any of these hold:

- the outfit's version moved;
- the scene now wears another outfit, or none;
- the shot's stretch of the take moved outside the dressed cut (handles included);
- the take's sync changed;
- the dress words have a newer version. This check is skipped for an imported, approved swap.

It **never** regenerates or spends. The shot's view lists each dressed take as current or STALE, and the checklist
counts the stale ones.

## Costs

| What | Rate | Example |
|------|------|---------|
| Object-swap, 720p | $0.681 per started source second, 4 s minimum | 1.5–2 s shot → 4 s → **$2.724** |
| 3.3 s shot | 4.55 s with handles → 5 s | **$3.405** |
| 1080p (not wired; recipe RECOMMENDATION to test once) | $1.632 per source second | — |
| Conform, filing, staleness, checklist | free | — |

HYPOTHESIS: whether the provider bills a 4.004 s source as 4 s or as 5 s. The tool avoids the question by cutting
0.05 s under a whole second. The billed amount is the provider's invoice. No run has been checked against it.

## Filing a swap that already finished (no spend)

`planDressImport` (pure) and `importFinishedDress` (browser) write a `provider_jobs` row that is already `succeeded`.
Filing the same request id twice in a project returns the first row (`existed: true`) and inserts nothing. It
carries the provider's request id, the result URL and a whole dress record. The server then files it exactly like a
swap the tool submitted: it downloads, conforms, files, syncs and adds the take as an alternate. No provider is asked to
make anything.

To file the approved Mastic + beige cap swap:

- Higgsfield request `71ff19f4-0944-43fa-8371-677c5f9557e8`;
- output `https://d3u0tzju9qaucj.cloudfront.net/45ee058b-986d-49f2-adc9-280bbafe42a2/88283b9f-4545-4c68-9d40-1f4f63d557f7.mp4`;
- cut from asset `cc76f6a3`;
- file it against the **master take** that `cc76f6a3` was cut from:
  - window: take 72.673–76.677 s;
  - `cutAssetId: cc76f6a3`;
  - `sourceSeconds`: the cut's measured length, 4.004 s.

What `cc76f6a3` is (OBSERVED from the repo's own notes, not read from the database):

- the app's own 4.0 s cut of take shot 19, made on 3 Oct;
- 1080×1920, 59.94 fps;
- take 72.673–76.677 s = song 73.526–77.53 s;
- registered as a project asset by hand, not by a restage job.

Nothing in the code writes `derived_from` on a cut registered that way. HYPOTHESIS: it has none. Check its
`metadata_json` before filing.

## How to verify

Code (no spend):

- `npx vitest run src/lib/storyboard/dress.test.ts src/lib/storyboard/dressSubmit.test.ts src/lib/storyboard/dressFiling.test.ts src/lib/storyboard/workflow.test.ts supabase/functions/_shared/mp4Retime.test.ts`
- These cover the handles and the billed seconds, the exact cost, the reference order, the prompt, staleness, the
  dry run, write-ahead, the retime (measured by the app's own MP4 reader, `mdat` byte-identical, audio dropped with no
  offset moved), and the server filing a dressed take unselected with its derived sync.

Live, after the edge functions are redeployed (`provider-jobs-tick`, `ingest-provider-job`, `avt-mcp`) and the
frontend is published:

1. Import the approved swap (above). Within ~1 minute its job row has `finalized_at` set and `progress_note` null.
   `result_asset_id` points at an asset with:
   - `footage_role = 'performance'`;
   - `metadata_json.derived_from.method = 'dressed'`;
   - `conformed_duration` within 0.01 s of `4.004`;
   - `output_duration` ≈ `3.71`;
   - `retime_ratio` ≈ `1.08`.

   Expected rows:
   - one `performance_syncs` row for that asset: `method = 'derived'`, `status = 'confirmed'`, `offset_seconds` = the
     master's offset + 72.673;
   - one `shot_asset_assignments` row on shot 19: `role = 'performance'`, `is_primary = false`.
2. Open shot 19. The dressed take is listed as "Your take · dressed" and "current". The shot still shows what it showed
   before.
3. Download the stored file and check it with `ffprobe -show_entries format=duration:stream=codec_type,duration`:
   - **one** video stream;
   - duration 4.004 s (±0.01);
   - no audio stream.
4. In Review, select it and play shot 19 against the song. Lips should stay on the words across the shot. This is
   Fendi's check, not an agent's.

If step 1 ends with a `progress_note`, that note is the finding. Do not edit the row to make it pass.

## Not built here

- **Step 6 automation.** Composite stays offline, and restage is not approved.
- **The brand layer and face restore** (recipe steps 3–4) are not wired into the dress lane.
- **A UI for the import.** It is a function, for the parent or an operator.
- **A per-shot override of the handles.** The constants are in one place, and the function takes overrides.
