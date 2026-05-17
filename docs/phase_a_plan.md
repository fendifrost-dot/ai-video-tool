# Phase A plan — Virtual Production OS reframe

## Goal

Turn AVT from "AI video generator" into a **Virtual Production OS** by adding three foundational systems: granular Character DNA, song intelligence, and a storyboard data model that Phase B can build a UI on top of.

## Workstreams and order of operations

1. **Schema first, code second.** Land all five SQL migrations before any UI work. The new tables get RLS from the start. The `artist_assets` data migration is non-destructive — copy into `character_features`, leave the old table reads in place until the new UI is fully wired.
2. **Character DNA UI replaces the asset grid.** Tabbed taxonomy (face / teeth / hands / tattoos / jewelry / hair / body), labeled sub-pose slots per tab, per-slot upload + primary + locked + reinforce-on-drift toggles. The existing `Reference360Uploader` collapses into the Face tab. The legacy `ArtistAssetGrid` stays mounted in a "Legacy" collapsible section during the dual-write window so nothing visually disappears.
3. **Compiler extends to plural references.** `CompiledPrompt.referenceImagePath` (singular) stays; we add `referenceImagePaths: string[]`, populated from the locked `character_features` per type that are relevant to the shot. Existing consumers (`GenerateButton`, provider formatters) keep working off the singular field — we update them to consume the plural in a follow-up step inside Phase A.
4. **Song intelligence.** Client-side Web Audio API analysis runs on the project page after audio upload (see `song_intelligence.md` for rationale). Results write to `song_analyses`. The UI card visualizes the energy curve + beats + drops + sections + Re-analyze button. The existing manual `video_projects.bpm` integer field becomes a derived display from `song_analyses.bpm` when present, with the manual field as a fallback.
5. **drift_flags wiring.** `useSaveClipReview` computes a `drift_flags` JSONB array on save based on which of face/wardrobe/lighting scores fell below 7. Pure client-side computation; no edge function needed yet.

## Schema migrations (in apply order)

| # | File | What |
|---|---|---|
| 1 | `20260517_phase_a_character_features.sql` | `character_features` table + indexes + RLS |
| 2 | `20260517_phase_a_song_analyses.sql` | `song_analyses` table + index + RLS |
| 3 | `20260517_phase_a_storyboards.sql` | `storyboards` + `storyboard_nodes` + indexes + RLS |
| 4 | `20260517_phase_a_generation_feasibility.sql` | `generation_feasibility` table + index + RLS |
| 5 | `20260517_phase_a_clip_reviews_drift_flags.sql` | `clip_reviews.drift_flags` column |
| 6 | `20260517_phase_a_migrate_artist_assets.sql` | One-shot copy of `artist_assets` → `character_features` |

All are idempotent — `create table if not exists`, `add column if not exists`, `drop policy if exists` before create. Each goes through Lovable's chat one at a time, verified before the next runs.

## Data migration mapping

`artist_assets.asset_type` → `character_features.(feature_type, label)`:

| old asset_type | new feature_type | new label |
|---|---|---|
| face_front | face | neutral |
| face_3q_left | face | three_quarter_left |
| face_3q_right | face | three_quarter_right |
| face_left | face | side_profile_left |
| face_right | face | side_profile_right |
| face_top | face | looking_up |
| face_bottom | face | looking_down |
| mouth_open | face | mouth_open |
| mouth_closed | face | neutral_mouth_closed |
| expression | face | smiling |
| body | body | silhouette_front |
| hair | hair | natural |
| tattoo | tattoos | arm_left |
| wardrobe | body | wardrobe_legacy |
| jewelry | jewelry | chain |
| other | body | other_legacy |

`is_primary_reference` → `is_primary`. `metadata_json` carries a `migrated_from_asset_id` pointer so we can reverse if needed.

## UI changes

- `ArtistDetail.tsx`: replaces direct mount of `Reference360Uploader` + `ArtistAssetGrid` with new `<CharacterDNATabs artistId={artist.id} />`. Old grid remains under a "Legacy reference library" collapsible.
- New components in `src/components/artists/`: `CharacterDNATabs.tsx`, `FeatureSlotGrid.tsx`, `FeatureSlot.tsx`, `featureTaxonomy.ts`.
- New query module `src/lib/queries/characterFeatures.ts`.
- `ProjectOverview.tsx`: gains `<SongAnalysisCard projectId={project.id} />` between project info and the existing sections. New module `src/components/projects/SongAnalysisCard.tsx` + `src/lib/songAnalysis/` (analyzer, types, query hooks).
- `PromptBuilder.tsx`: updated to pull locked features in addition to the legacy locked asset, pass both to the compiler.
- `ScorecardForm.tsx` (or its save callsite): computes drift_flags before insert.

## Backward compat

- `referenceImagePath` (singular) remains on `CompiledPrompt`. When new locked features exist, `referenceImagePath` is set to the first one in the priority order (face → hands → jewelry → tattoos → hair → body) so legacy consumers behave the same. `referenceImagePaths` (plural) contains the full list.
- `video_projects.bpm` stays. The compiler's project variable bag prefers `song_analyses.bpm` when available, falls back to `video_projects.bpm`.
- The `artist_assets` table is not dropped in Phase A.

## Tests

- `compiler.test.ts`: new cases for `referenceImagePaths` with multiple locked features, with no features, and the legacy `lockedReferenceAssetPath` fallback.
- `driftFlags.test.ts`: pure function tests for score → flags array.
- `featureTaxonomy.test.ts`: completeness check that every sub-pose label per type matches the canonical list.

## Out of scope (deferred to Phase B/C)

- Storyboard UI (graph view, drag-to-snap on beats).
- The drift feedback loop itself (auto-reinforcement of references when drift_flags fire repeatedly).
- `generation_feasibility` population — schema only.
- Replacing the manual BPM field's UI; we keep it visible until the analyzer is proven on multiple songs.
