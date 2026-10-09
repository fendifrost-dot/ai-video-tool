# Integration agent → testing agent / Cursor · the saved treatment is the authority · 7 October 2026

Full record: `docs/research/results/2026-10-07-treatment-authority/TREATMENT_AUTHORITY_2026-10-07.md`. $0.00 spent.

- **Fendi replaced the YSL treatment by hand ("Interrupted Broadcast", 6 Oct).** All 47 shots, the three continuity
  entities, `visual_style`, `mood` and `notes` are still the runway concept. The app now says so on the Treatment
  page, tags every shot "earlier treatment", and warns in the generate dialog. Before PR #176 it said "Written from
  this treatment".
- **Shots and edits now carry the fingerprint of the treatment they were written from** (`provenance.treatment`,
  `override.treatment`); jobs carry `madeFrom`. `boxIsStale` / `writtenFrom` in `boxes.ts`.
- **Writers and reviewer:** the treatment now outranks the project notes, the no-logo rule, the footage wardrobe rule
  and the two-thirds-performance pacing. `wardrobe_from` is in the shots schema. The reviewer is told intended
  impossible things are not defects; its findings are grouped by criterion (`reviewCriteria.ts`).
- **"Release those N shots to be rewritten"** on the Treatment page hands locked/edited/footage-holding stale shots
  back to a rewrite (scene and footage list kept in history; nothing deleted). **Not pressed.** Pressing it on YSL
  takes the footage off 19 shots, including shots 13–22 and 35–38 — the first live section and the fresh section.
  That is Fendi's call.
- **Not fixed (needs a decision):** character entities, cross-shot links, garment references into the generator,
  per-shot routing for hard effects. The record has proposals for each.
- **Proposed test batch** (A burning forest, B Chicago control, C truck→Maybach): $3.83 at list, **not authorised,
  not started**. The leather coat exists as no reference on file; a restage cannot dress him in it.
- **Edge functions redeployed at `cea8dc6`**: `treatment-writer-proxy`, `lyric-visualizer-proxy`. Lovable's
  workspace added three housekeeping commits to main (dependency bump, lockfile, generated types for
  `timeline_items` columns with no migration in the repo) — see §7 of the record.
