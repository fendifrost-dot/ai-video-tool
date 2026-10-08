# Original performance footage across variations · 8 October 2026

**No paid generation. No top-up. No subscription.** One migration is pending Lovable.

Evidence labels are [`CLAUDE.md`](../../CLAUDE.md)'s: **VERIFIED** (proven — cited) / **OBSERVED** (seen, not
proven) / **HYPOTHESIS** (needs a named test).

---

## 1 · Root cause

The reported defect was "original uploaded performance footage does not carry into a different variation in a
usable way". It splits into two findings, and only the second is a defect.

### The take and its sync DO carry — VERIFIED

`project_assets` and `performance_syncs` carry **no `variation_id`** (`supabase/migrations/20261007120000_video_variations.sql`
added it to `shots`, `shot_asset_assignments`, `continuity_entities`, `treatment_versions`, `provider_jobs` and
`timeline_manifests` — deliberately not to those two). `useProjectAssets` and `useTakeSyncs` filter on
`project_id` alone. `boxMedia` then re-derives coverage for **each variation's own boxes** from the project's
sync and offers it as the base layer (`src/lib/storyboard/media.ts`). So a variation created later inherits every
take and its synchronization with nothing copied.

Checked against the live rows, through the shipped modules, by
`scripts/qa/footage_inheritance.mts --rows <snapshot>`:

```
take hero_clip_hd_1080.mp4  190.34 s  sync manual/manual +0.8538 s → covers song 0.85–191.19 s
Paris Black Runway                 47 shots, 17 footage rows of its own, 46 reached
Interrupted Broadcast              43 shots,  0 footage rows of its own, 42 reached
Interrupted Broadcast · cand 2     43 shots,  0 footage rows of its own, 42 reached
Interrupted Broadcast · cand 4     43 shots,  0 footage rows of its own, 42 reached
Interrupted Broadcast · cand 5     43 shots,  0 footage rows of its own, 42 reached
```

The one unreached shot in each is `c043`, song 194.12–201.87 s — **past the end of the recording** (191.19 s), so
correctly empty rather than holding a frozen last frame. `c042` is clamped to 190.34 s and reported partial.

### What was actually missing — VERIFIED

**There was nowhere to put a variation's decision about an inherited take.** Three facts, each provable:

1. `shot_asset_assignments.source_in_seconds/out` exist and are variation-scoped, but for `role = 'performance'`
   `boxMedia` **overwrote them from the sync on every read**. The table's own column comment says so: *"Null for
   a performance take: its range is derived from the box's song window through performance_syncs, every time."*
   A trim written there was discarded. **All 200+ live rows have both columns null**, and no code path wrote them.
2. **No exclusion.** A synced take is offered under every shot it covers, so "no row" cannot mean "not used
   here" — it already meant "nobody decided". There was no way to express a deliberate no.
3. In Paris Black Runway the performance coverage was built by **restaging**, not by cutting: 17 derived
   `project_assets` rows, each its own `confirmed` sync, each assigned to one PBR shot. Those are excluded from
   the base layer by design (`if (asset.derivedFrom) continue`) and their assignments are PBR's. So in
   Interrupted Broadcast the director saw one raw 190 s file and had to re-restage shot by shot — exactly the
   "available for deliberate reuse" state the brief rejects.

> The media and the sync were shared, as they should be. The **cut** had no home.

---

## 2 · What was built

| | |
|---|---|
| `src/lib/storyboard/footageEdit.ts` | the pure core: `takeCoverage`, `planFootageEdit`, `editOf`, `coverageLabel`, `isSyncedTake`. `takeRangeForBox`, `isUsableSync`, `TakeRange` and `FRAME_SLACK` moved down here (re-exported from `media.ts`) so the dependency runs one way. |
| `src/lib/storyboard/media.ts` | `boxMedia` resolves a performance assignment through it and carries the provenance on the item (`sync` / `trimmed` / `excluded` / `emptied` / `unsynced` / `uncovered`). |
| `supabase/migrations/20261008140000_footage_edits.sql` | `trim_head_seconds`, `trim_tail_seconds`, `excluded`; a trim-is-a-length check; an excluded-is-never-primary check; `duplicate_variation` carrying all three. |
| `src/components/storyboard/FootageEdit.tsx` | the controls, on an offered take as well as an assigned one. |
| `scripts/qa/footage_inheritance.mts` | the read-only inspector above. Submits nothing, writes nothing. |

### A trim is seconds of the SHOT, not seconds of the file

This is the load-bearing decision. A trim must not be able to break sync, so it is stored as the number of
seconds of the shot taken off each end and mapped to file time through the sync on every read. It therefore
**narrows** what the shot uses and can never **slide** the footage; it stays correct when a sync offset is later
corrected, or the shot is moved, split or merged. Storing the derived file seconds would let a corrected sync
and a stored range disagree with no way to tell which was meant. Proved by
`footageEdit.test.ts` §2 "survives a corrected sync".

### Exclusion is a row

`excluded = true` is the record of a decision; **no row** still means nobody decided. The UI says which it is
("inherited · this variation has made no cut" vs "this variation only"), and an excluded take is shown with the
way back rather than vanishing — *"A decision, not an absence — the take is still in the project and still
synced, and another variation is unaffected."*

### Split needed nothing

Splitting a shot already exists (`boxes.ts planSplit`) and shots are variation-scoped, so a split re-derives two
correct take ranges from the sync on its own. No footage-level split was added, and none is needed.

### Playback and export needed nothing

`videoStateAt` already reads `sourceIn` / `sourceOut` / `leadIn`, so a head trim becomes `lead_in` frames and a
tail trim `ran_out` frames in `renderContract` and in `SequencePlayer` — VERIFIED by reading both, not by
running an export.

---

## 3 · The repair of the existing YSL variations

**No data repair was needed, and none was done.** The original take already reaches 42 of 43 shots in every
Interrupted Broadcast variation (§1). The repair the brief asked for was a **capability** repair, which is the
code above. Specifically:

* Paris Black Runway: **not touched**. Its 17 restage assignments, its treatment, board, cast and generated
  assets are as they were. The new columns default to "nothing decided", which is what every existing row means.
* The active variation: **not changed**.
* No footage entry was duplicated and no edit was reset — there were no footage edits in the database to reset,
  because there was no way to make one.
* Repeatable: the migration is idempotent and needs no backfill, because the defaults *are* the correct values.

**HYPOTHESIS, named:** that re-creating PBR's shot-by-shot performance coverage in another variation is now
cheaper by trimming the inherited take than by restaging it 17 times. The controls exist and are tested; nobody
has yet cut a full variation with them. The test is: cut 5 consecutive shots of Interrupted Broadcast from the
inherited take and compare against the restaged equivalents.

---

## 4 · Checks

| # | asked | result |
|---|---|---|
| 1 | new variation: takes appear, sync retained | **VERIFIED** — live inspector, 42/43 shots in 4 IB variations with **0 footage rows of their own**; `footageEdit.test.ts` §1 pins it with the real numbers |
| 2 | trim / section removal persist | **VERIFIED in tests** — pure core §2–3, UI §"a take this variation has cut", DB test §3. **Not yet exercised in the browser** (the migration is unapplied) |
| 3 | isolation | **VERIFIED** — `footageEdit.test.ts` §4 (same song second, two variations, trim and exclusion each confined); `footage_edits_test.sql` §3 in Postgres |
| 4 | duplication carries the edit, then diverges | **VERIFIED** — `footage_edits_test.sql` §4: the duplicate inherits 0.5/0.4, editing it to 2.0 leaves the source at 0.5, and `project_assets` stays one row |
| 5 | assign an inherited range to a shot, Review uses it | **VERIFIED by construction, not by playing it** — Review reads `boxMedia`'s `showing`; the same item the panel edits. Reading `videoStateAt`/`renderContract` shows the range flows through. Nothing was rendered. |
| 6 | timing / source-frame mapping | **VERIFIED for source seconds** — song 15.68 s → take 14.8262 s at +0.8538 s, asserted to 4 dp; a trim moves the file in-point by exactly the trim. **29.97 and lip-sync by ear: NOT verified** — the one take is the only footage, `drift_ppm` is 0 on every live row, and no audible check was made. |
| 7 | async isolation | **VERIFIED for the data model, not for a live job** — `provider_jobs.variation_id` was added by #179 and is set at submission; a footage edit writes only `shot_asset_assignments`, which a running job does not re-read. No job was run. |
| 8 | export resolves the submitted variation's edits | **VERIFIED by construction** — `renderContract` is built from `boxMedia` for the variation's own boxes and assignments. No export was produced. |
| 9 | existing work preserved | **VERIFIED** — nothing was written to the live database at any point in this work. Every live call was a `select`. |

**Nothing here was proven by a type-check or a test count.** Checks 5, 7 and 8 are marked *by construction*
precisely because they were read, not run.

---

## 5 · Deployment

1. **Lovable applies `supabase/migrations/20261008140000_footage_edits.sql`** (DEPLOY ONLY). It replaces
   `duplicate_variation()` — the body is the one from `20261007170000_cast_members.sql` with one insert
   column-list changed. **Copy it; do not retype it.**
2. **Frontend publishes from `main`** — *after* step 1. The panel reads three columns that do not exist until
   then; before the migration it reads them as "nothing decided" and the trim controls would silently fail to
   save.
3. **No edge function changed.** No redeploy of any function is needed from this work.

Coordinate step 2 with the wardrobe agent so one publish does not land without the other's merge.

---

## 6 · Where Fendi opens it

**Storyboard → a shot → focus view → the performance take → "trim in / trim out", "Leave this take out of this
shot", "Back to the synced coverage".** It is on the take whether or not the take has been put on the shot, which
is the change: in Interrupted Broadcast every shot from song 0.85 s to 191.19 s already has
`hero_clip_hd_1080.mp4` under it, and those controls are now what make it a cut rather than a preview.

---

## 7 · Scope kept out, and the seam with wardrobe

Wardrobe and Look propagation belong to another agent. **No wardrobe file was touched.** The seam this work
leaves for it, stated so neither of us implements the other's half:

* A source take keeps its footage connection no matter what the shot needs. `footage_role = 'performance'` and
  the sync are untouched by any wardrobe decision, and nothing in this change can replace a take with generated
  performance.
* The live take's own `metadata_json.shows` reads *"a woodland-camouflage short-sleeve military shirt with a
  small flag patch on the chest, a navy baseball cap, glasses, a short beard, dark jeans"*. The Interrupted
  Broadcast treatment calls for different clothes. **That conflict is real and is not resolved here**: this
  change neither forces the take's original clothes onto a new scene nor silently swaps the take out. Routing it
  — compositing, a garment swap, or an explicit "this shot needs a wardrobe change" requirement — is the wardrobe
  agent's, and `isSyncedTake` plus `BoxMediaItem.edit` are the hooks to read.

## 8 · What this does NOT do

* **No footage-level split.** Splitting the shot does the job (§2) and a split of a take inside one shot has no
  meaning in this model.
* **No multi-take coverage UI.** The model supports many takes per shot (a row each); there is one take in this
  project, so no chooser was built for a case that cannot be exercised.
* **No automatic carry of restage work between variations.** Deliberate: a restaged clip is one shot's picture in
  one creative direction. The brief says carry the original footage, *not* the old treatment or generated
  material.
* **No backfill.** The defaults are correct for every existing row.
