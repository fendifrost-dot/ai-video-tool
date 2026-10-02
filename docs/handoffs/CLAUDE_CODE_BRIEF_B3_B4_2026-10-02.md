# Claude Code brief — B3 override · B4 regenerate-from-lyrics + motion template wiring · machine enrolment

**Date:** 2026-10-02 · **From:** Claude (Cowork, AVT owner) · **For:** the Claude Code session · **Baseline:** AVT `main` ≥ `0e2ed9c`

Fendi: "Wire all the adjustments in before any more tests — we'll test everything at once." These three items are yours; the rest of the adjustment list is being done in the Cowork session (coverage warning, occluder layer, 2.5D mattes, 1080p, C2/C4) and Cursor is building the shot compiler under `src/lib/shotCompiler/**` (PR #164 spec, reviewed with amendments in `CLAUDE_LATEST.md`).

**File ownership (so three agents don't collide):** you own everything named below plus `supabase/functions/lyric-visualizer-proxy/**` and new migrations. Do not edit `src/lib/treatment/coverage.ts`, `src/components/treatment/ShotStoryboard.tsx`, `scripts/edit/**`, `scripts/qa/**` (Cowork) or `src/lib/shotCompiler/**` (Cursor). `ShotCard.tsx` is shared: you add the override block only (see B3); the coverage badge lands beside it from the Cowork side — keep your edit inside one clearly delimited JSX block so the two merge cleanly.

Standing rules: mechanistic, data-driven, nothing hard-coded for YSL; no bracket placeholders anywhere; no RLS weakening; no widening of any existing proxy's auth; Lovable chat is deploy-only (Fendi or Cowork sends the deploy message); commits to `main` with the attribution lines your harness gives you.

---

## B3 — per-box manual override of the generated treatment

**Why (Fendi):** "a manual override of the generated treatment inside each storyboard box."

**Fact that shapes the design:** the storyboard renders from the structured treatment (`video_projects.treatment_json` → `structuredTreatmentToShotSpecs`), not from the `shots` table, so an override has to key on the spec id, not a shots row.

1. Migration `supabase/migrations/<ts>_shot_overrides.sql`:
   `public.shot_overrides (id uuid pk default gen_random_uuid(), project_id uuid not null references public.video_projects(id) on delete cascade, spec_id text not null, user_id uuid not null default auth.uid(), direction text, camera_motion jsonb, framing text, transition_in jsonb, required_elements text[], notes text, updated_at timestamptz not null default now(), unique (project_id, spec_id))`.
   RLS owner-scoped exactly like `lyric_lines` (select/insert/update/delete where `user_id = auth.uid()`), grants to `authenticated`. Nothing else touched.
2. `src/lib/queries/shotOverrides.ts`: `useShotOverrides(projectId)` (map by `spec_id`) + `useUpsertShotOverride()` / `useDeleteShotOverride()` (react-query, same style as `lyricLines.ts`).
3. `src/lib/treatment/overrides.ts` (pure, tested): `applyShotOverrides(specs, overrides)` → for each spec with an override, replace only the fields present (non-null) and set `spec.source = "override"` (add that optional field to the ShotSpec zod schema with default `"generated"`). `effectiveTreatment(spec)` = `spec.performanceDirection` after overrides — the compiler and B4 read this, never the raw generated text.
4. `TreatmentBuilderPage.tsx`: `specs` memo becomes `applyCoverageDefaults(applyShotOverrides(structuredTreatmentToShotSpecs(current), overrides), DEFAULT_COVERAGE_PRESETS, lyricLinesQuery.data)` — overrides BEFORE coverage defaults so an explicit override wins and a cleared field is refilled by the planner.
5. `ShotCard.tsx`: an "Override" disclosure under the direction text — textarea for `direction`, select for camera move (the `CAMERA_MOTION_TYPES` enum), select for framing, select for transition preset (`config/transition_presets.json` names — read from `DEFAULT_TRANSITION_PRESET_NAMES` exported by `src/lib/treatment/transitions.ts`, which the Cowork side is adding; until it exists, use the `TransitionSchema` enum), chips for `required_elements`. Save = upsert; "Reset to generated" = delete. A small `overridden` tag on the card header when `spec.source === "override"`.
6. Tests: `overrides.test.ts` (replace only present fields; coverage defaults refill a cleared move; delete restores generated).

## B4 — per-box "regenerate from the lyrics" + the motion template in the generators

**Why (Fendi):** "a per-box generate-a-new-storyboard-prompt specifically matching details from the lyrics"; "we have the ability to bring every lyric to life so we should do so"; and the Opus 5.5 motion-design guide must drive the generators.

1. `lyric-visualizer-proxy` gains two request fields, both optional and additive (no behaviour change when absent):
   `mode: "literal" | "surreal" | "performance" | "all"` (default `"all"` = today's three scenes; `"literal"` = one scene whose every noun is the lyric's noun made physical — the gator boots that snap, the car the kids carry) and `template: "motion_story_v1"` (or any `prompt_templates.name` with `is_seed`), which the function loads from `public.prompt_templates` (service role read, seed rows only) and renders into the system prompt ahead of the existing instructions, filling `{{project.title}}`, `{{look.name}}`, `{{look.preamble}}`, `{{artist.name}}`, `{{artist.description}}` from the request context (never left as braces — strip any unfilled `{{…}}` before sending). Also accept `shot: { start, end, section, framing, cameraMotion }` so the scene is written for that window. Keep the cost gate; the dry run must report the template name it used.
2. `src/lib/treatment/regenerateFromLyrics.ts`: `regenerateShotFromLyrics({ projectId, spec, lyricLines, template })` → the lines inside the spec's window (`lyricsForShot`) → proxy with `mode: "literal"`, `template`, `shot` → returns `{ direction, cameraMotion, framing, requiredElements, renderPrompt }` mapped from the scene (`motion` entrance/primary/secondary/exit joined as one sentence → `direction`; `camera.move` → `cameraMotion.type` via the card enum; `camera.framing` → `framing`).
3. `ShotCard.tsx`: a "From the lyrics" button inside the B3 override block; result lands in the override fields (not saved until the user hits Save), so B3 and B4 share one write path. Disabled with a tooltip when the window has no lyric lines ("Instrumental — nothing to regenerate from").
4. Treatment brief (`TreatmentBuilderPage.tsx` step 1): a "Template" select listing seed `prompt_templates` of category `universal` (query `src/lib/queries/promptTemplates.ts`); when chosen, its rendered body is prepended to `additional_notes` in `draftTreatment()` (data path — `ai-draft-treatment` in Control Center is locked and must not change). Render the same `{{slots}}` client-side from the project's fields; strip unfilled braces.
5. Tests: slot rendering (filled / stripped), scene → override mapping, "all" mode unchanged (snapshot of today's system prompt).

## Machine enrolment (one-time)

`python3 scripts/_lib/auth.py enroll --label "<machine>"` once on the machine that runs the batch scripts (needs a logged-in user JWT at enrol time — your session can read it; the Cowork session cannot). Record nothing but the label in the commit; the credential stays on disk where `auth.py` writes it. Confirm with a `--jwt`-less dry run of `run_world_batch.py` (expect the manifest to open and the first submit to be a dry run, no spend).

## Report back

Commit SHAs; migration file name (Cowork sends the Lovable deploy-only message); the test list and vitest output; one screenshot of a card with an override and the "From the lyrics" result; the dry-run line from the visualiser showing the template name; the enrol confirmation (label only).
