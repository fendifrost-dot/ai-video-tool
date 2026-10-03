# Post-production-test hardening tranche — results

2026-10-03 · Claude · main `92dd370` (code `1656a59`, 23 commits after `98249bf`; Lovable's `d0518d6…92dd370` are its
type regeneration and its own copies of the migrations) · published app code `1656a59` · **provider spend: $0.00**.

Fendi's instruction: the frontend production test is accepted; do not run another paid section; harden the PRODUCT
around the structural limits the test exposed — six priorities, worked through without stopping.

## What was built

### 1. Change inside a shot (priority 1)

A shot's own fields say the state it OPENS in. `spec.events[]` says what changes after that, and when:

| field | meaning |
|---|---|
| `at` | seconds from the shot's first frame (the stored time) |
| `trigger` | what the time hangs on: `time`, `lyric` (words sung in the shot), `beat` (the nth beat in the shot) |
| `lighting` `camera` `action` `visual` | at most one short phrase per kind of change (≤ 140 characters) |
| `lightingState` | the key of one of the project's lighting states the light switches to |
| `effect` | a change the EDIT makes, on the clock: `dim`, `blackout`, `lights_up`, `flash`, `fade_out` |

- **The song is the clock.** A lyric or beat trigger is looked up in the lyric timing / beat map every time the event
  is read (`resolveEvents`), never stored as a copy — it stays on its word when the shot is split, merged or re-timed.
  When its words are no longer sung in the shot, it holds its stored time and says so.
- **Two kinds of change, never both for one change of light.** *Directed* change has to be in the footage. An *effect*
  is made by the edit, exactly, on whatever the shot shows (`pictureAt`: brightness, contrast, a white flash; Review
  plays it, the render contract carries it evaluated). A light change that carries an effect is the edit's alone — it
  is not also asked of a generator. A light change asked of the footage while one of the edit's effects is still on
  the picture is pointed out before anything is generated.
- **Honest generation** (`temporal.ts`). What each route can do with a changing shot is data:
  the still = the opening state, said so; Kling / Runway / DoP image-to-video draw one move → the storyboard **refuses**
  to generate a clip of the whole shot and offers the defined alternatives — *split at the beats* (each state becomes
  its own shot, cut on the beat, the new shot pointing at the lighting state it is in), *make the light change an
  effect*, or *in order, not on time* (asked for by name; recorded on the job as `ordered`, never called timed);
  Seedance restaging takes a script with times and is given one — recorded as `timed_script`, **`measured: false`**.
  `generateBoxClip` / `restageShot` require the plan as an argument, and `assertPlanCovers` refuses a plan that says
  "nothing changes" for a shot that does. The Runs page leaves changing shots out of a compiled batch, by name.
- **Storyboard UI.** The card and the full-screen shot show a *Timed beats* strip: a bar the length of the shot with a
  mark per beat, then one line per beat — time, what it hangs on, a coloured label per kind and a few words. The
  editor (per beat: time or sung words or beat number, four phrase fields, lighting state, effect) sits under the
  shot's details; what generating will do with the beats is said there, before anything is spent.
- **The reviewer** (Ask Astra) is told each shot's beats and gets an extra frame just after each change, with the
  edit's effect applied — it sees what Review plays.

### 2. Continuity entities (priority 2)

`continuity_entities` (project-scoped): `kind` location | prop | lighting, `key` (its identity — what shots point
at), `name`, `description` (canonical), `constraints`, `approved_asset_id`, `reference_asset_ids` (rows of
`project_assets`; media is never copied). **Looks are not duplicated**: a shot points at an existing Look through
`wardrobe.lookId`. A shot points at entities from its own record: `spec.continuity { location, props[], lighting }`.

What an entity gives generation, said exactly:
- its **words** — the canonical description and constraints go, identical word for word, into the picture request of
  every shot that points at it (the still model reads no picture; a prop's picture is the reference for the eye, and
  the UI says so);
- its **picture** — a location's approved picture is the place every performance shot set there is restaged into
  (before any image of the shot's own), and the confirmation shows it.
A request built for a shot that points at entities WITHOUT them is refused (`boxShot`, `restageShot`). A lighting
state is one description used by shots (the light the shot opens in) and by beats (an event that switches to it says
the state's words and stores only the pointer). Both writers are handed the project's entities and may point shots at
them by key; a key the project does not have is dropped, never invented.

UI: a *Continuity* panel on the storyboard (entities by kind, description, constraints, pictures with the approved one
marked, "Used by shots …", draw reference pictures with the price asked first); per shot, a *Continuity* block
(place, light, look, props) that says what generating takes from them; chips on the card.

### 3. Treatment version history (priority 3)

`treatment_versions` + a `BEFORE UPDATE` trigger on `video_projects`: whenever the treatment text or its notes, mood
or visual direction change, the row being replaced is kept (text, who wrote it, the notes beside it, the whole
record) — whoever writes: the app, a script, a SQL editor. The app labels the write (`generate` / `edit` / `delete` /
`restore`). Treatment page: **Current | Versions**; a version opens to read and is restored with one update — which
the trigger records in turn. The current treatment stayed current; nothing was reconstructed.

### 4. Background provider jobs (priority 4)

Audit and design: `docs/PROVIDER_JOB_LIFECYCLE.md`. Before: the browser polled the provider, asked the server to save
the clip, and attached it — nothing moved with the page closed. Now: `pg_cron` (every minute) →
`kick_provider_jobs()` (only when a job is unfinished) → `pg_net` → edge function **`provider-jobs-tick`** →
`claim_provider_jobs()` → `_shared/jobProgress.ts`: ask the provider → save the clip → file a restaged take as a take
in sync → put it on its shot → `finalized_at`. A page that is open asks for a tick and reads rows; it does none of the
work. Image jobs: the server call writes the pictures on the job's row; if the page is gone the server finishes the
job with the pictures on the shot unselected and unchecked, and the stacked-panels check runs when the storyboard is
next opened. A clip's image is now its own job. Provenance, cost authorization, retry, ingestion and assignment are
preserved (the server's assignment plan is held equal to the app's by a test).

### 5. Treatment → timed storyboard (priority 5)

One form for "change inside a shot" from a model (`_shared/timedBeats.ts`), used by both writers
(`treatment-writer-proxy` for the board, `lyric-visualizer-proxy` for one shot) and read into the shot's own events in
one place (`writtenBeats.ts`). A writer is told most shots are one state; a beat is kept only when it lies inside its
shot; it hangs on words only when they are sung there. The director's own beats are never overwritten by a rewrite.
The treatment stays prose. Nothing was resurrected: one treatment, one storyboard, one shot record, optional timed
direction inside it.

### 6. Review / render boundary (priority 6)

`docs/RENDER_CONTRACT_AND_BOUNDARY.md`. The canonical records contain everything a render needs. The **render
contract** (`renderContract.ts`, written by Export as `storyboard_timeline.json` v2) is made from the timeline Review
plays by the player's own functions: per shot, in output frames, the original file, where its picture starts, how many
frames hold / play / hold, and the edit's effects already evaluated. A **renderer** that executes it
(`scripts/render/render_contract.py`, ffmpeg) is built and tested. It is **not hosted**: the app's servers cannot run
ffmpeg, the hosted compose endpoint AVT already uses cannot execute a source range, a fit or an effect, and a
page-owned render is what priority 4 removed. Export shows the contract and says the app does not render. The
smallest architecture that closes it (one container, the same scheduler pattern) and the two decisions it needs from
Fendi are in the document.

## Validation

| | result |
|---|---|
| Vitest, whole suite | 178 files passed, 1 skipped · **1,989 tests passed** (was 1,840) |
| TypeScript (`tsc --noEmit`) | clean, before and after Lovable's regenerated types |
| Production build | passes |
| Python (`scripts/edit`, `lyrics`, `_lib`, `render`) | **39 passed** (31 + 8 renderer tests on real ffmpeg) |
| Storyboard E2E (real app in Chromium, stand-in backend) | **PASS**, 0 samples off the song clock, 21 new checks |
| Migrations on a real Postgres (in-process), each applied twice | applied; trigger, claim, grants and backfill behave as designed |
| Edge functions type-checked with a Deno shim | clean |

Focused tests asked for:
1. intra-shot timed events — `src/lib/storyboard/events.test.ts` (41), `TimedBeats.test.tsx` (10), `writtenBeats.test.ts` (8);
2. continuity entity reuse — `src/lib/continuity/entities.test.ts` (19), `Continuity.test.tsx` (9);
3. treatment version restore — `src/lib/treatment/versions.test.ts`, `TreatmentPage.test.tsx`, and the E2E run (edit → kept → restore → kept);
4. a provider job surviving the client disappearing — `src/lib/providerJobs/jobProgress.test.ts` (28): the app's real
   runner submits, no client code runs again, the server's code finishes the job;
5. the Review / render contract — `src/lib/storyboard/renderContract.test.ts` (9: every frame at 10, 24 and 30 fps) and
   `scripts/render/tests` (8).

## Live (production) checks — no provider call, no spend

- Migrations: the three tables / trigger / columns / schedule exist; `pg_net` installed. 109 existing jobs all marked
  finished, their `updated_at` untouched. `job_runner_config` and `claim_provider_jobs` are closed to `anon` and
  `authenticated`.
- Scheduler: `cron.job_run_details` shows `provider-jobs-tick` succeeding every minute in ~4 ms (no network call when
  idle). From the database, through `pg_net`: the function answers **401 `bad_cron_key`** to a wrong key, **401
  `missing_credentials`** to none, and **200 `{ok:true, scope:"all", claimed:0}`** to the scheduler's own key (the key
  never left the database).
- Treatment trigger: fired inside a transaction that was rolled back on purpose, on a smoke-test project —
  versions 0 → 1, kept as `context`, 2,067 characters and the whole record; nothing was left behind.
- YSL, read-only: the project's treatment, notes, 47 shot records and assignments have the same checksums as before
  the tranche. The published app shows 46 shots, the Continuity panel (empty), Current | Versions (empty, read through
  RLS without error), and Export's contract: *46 shots · 201.87 s · 6,056 frames at 30 fps · 1080×1920; shot 46 has
  nothing on it; shots 1, 13, 15, 45 hold a frame; 4 shots declare a transition, every one renders as a cut.*
- The hook, on its real window and lyric timing (shot `c017`, 62.75–66.67; "cut the lights on" sung at 63.16, "This
  ice on" at 63.94 — read with SELECTs, nothing written): two beats hung on those words land at 0.41 s and 1.19 s;
  the shot reads as *opens as lit → the light dies → ice is the only light + push-in*; restaging would be given a timed
  script (unmeasured); a one-move clip route refuses and offers split / in order; split at the beats cuts at 63.94 and
  the new shot points at the ice-key lighting state; with the blackout made by the edit instead, the contract carries
  8 picture runs for the shot and one piece of direction (the push-in) for the footage.

Not exercised live (would need a paid job): the server moving a real clip from "rendering" to its shot. It is proven
on the real decision code with in-memory tables; the first real generation after this tranche is its live proof.

## What changed for other lanes

- `lyric-visualizer-proxy` (contract + schema): additive — `timed_beats` on a single scene written for a storyboard
  shot, and a sentence when the project state carries `continuity`. Mode `all` is byte-identical (the golden test holds).
- `treatment-writer-proxy`: each shot returns `timed_beats` and `continuity` (both empty for a plain shot).
- `ingest-provider-job`: its saving code moved to `_shared/ingestClip.ts`, unchanged but for linking an already
  stored clip instead of downloading it twice.
- `world-still-proxy`: optional `jobRowId`.
- `media.ts` `renderPlan` (v1) is gone; `renderContract.ts` replaces it. `storyboard_timeline.json` is version 2.
- Control Center: not edited.
