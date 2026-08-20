# Claude Handoff — Music Cover Flight (Google Flow / Omni Flash)

**Date:** 2026-08-20
**Author:** Cursor (Grok 4.6 cloud agent)
**Audience:** Claude — stay in the loop; do **not** rebuild this, do **not** wire a Flow/Veo API, do **not** treat this as wardrobe/video-swap work.
**Repo:** https://github.com/fendifrost-dot/ai-video-tool
**Branch:** `cursor/cover-flight-guide-6781` (not on `main` yet)
**PR:** https://github.com/fendifrost-dot/ai-video-tool/pull/20
**Live app:** https://aivideotool.lovable.app/ (does **not** have this until Lovable **Publish** from a merge to `main`)
**Source spec:** [@by.jadla Music-Cover Flight Guide (Notion)](https://literate-aurora-778.notion.site/MUSIC-COVER-FLIGHT-GUIDE-3bff0dc2f65480a680f7f16c8c133e75)

**Read first:**
- `docs/AGENT_BOOTSTRAP.md` + `.deployment/manifest.yml` — pre-flight (canonical repo / Lovable / no standalone Supabase)
- `AVT_MEMORY_HANDOFF.md` — hard rules still apply (no sandbox image pipelines)
- This file — what shipped, what it is **not**, what to do next

---

## 0. Your assignment

Fendi asked Cursor to incorporate the Music-Cover Flight Guide into AVT. That work is **built, committed, pushed, and sitting on PR #20**. Your job if you pick this up:

1. **Know it exists.** Do not start a second Cover Flight studio.
2. **Do not invent a Google Flow / Omni Flash API.** There isn't one we can call. This is the existing **manual-workflow** pattern (copy prompt + annotated still → run in the provider UI). `VeoProvider.apiReady` stays `false`.
3. **Do not mix this with the LOCKED wardrobe pipeline.** Cover Flight is camera-POV over a **flat 2D music cover**. It is not VTON, not Grok garment-truth, not Phase 2 propagation, not SwitchX.
4. After merge: Lovable **Publish** frontend only. **No edge redeploy. No SQL.**
5. If Fendi wants a live Flow run, help him use the in-app tool + labs.google/flow. Do **not** process covers in the Claude sandbox.

Deliverables back to Fendi only if asked: PR review notes, publish confirmation, or a live Flow smoke (annotated PNG + prompt pasted into Omni Flash / Single Continuous).

---

## 1. Evidence labels (do not flatten these)

| Claim | Label |
|-------|--------|
| Cover Flight UI + prompt compiler exist on branch `cursor/cover-flight-guide-6781` at `c225fff` | **VERIFIED** — `git log` + files listed in §4 |
| PR #20 is open against `main` | **VERIFIED** — https://github.com/fendifrost-dot/ai-video-tool/pull/20 |
| Production build succeeded in the Cursor cloud agent | **VERIFIED** — `npm run build` green this session |
| 613 automated tests / 47 files on this branch | **VERIFIED** — `npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'` |
| Split is **576 unit + 37 mocked-integration** (0 / 0 / 0 live) | **VERIFIED** — taxonomy rule `vi.mock` / `vi.stubGlobal`; four files, 37 cases (see §8). An earlier 582 / 31 split in this handoff was **wrong** — total coincidentally still 613 |
| Feature is live on `aivideotool.lovable.app` | **HYPOTHESIS** — false until merge + Lovable Publish |
| Omni Flash will honour the red line / white arrows on a real cover | **HYPOTHESIS** — needs a human Flow run; no provider-live test exists |
| Google Flow has a callable API we should wire | **DECISION** — no. Manual workflow only |
| This is Class B (feature/UI), not Class C | **DECISION** — no storage/auth/provider-key/wardrobe/timeline surface |

---

## 2. What it is (product)

AVT now has a **Cover Flight** project page that implements the two-line system in-app instead of “markup on your phone”:

| Guide | Meaning |
|-------|---------|
| **Red line** | Where the camera flies (one continuous route, curves, endpoint) |
| **White arrows** | Where the camera looks (2–3 along the line: start → middle → end) |
| **Guides vanish** | Production marks only. The model must erase them and keep the cover a **flat, unchanged picture** |

Workflow the UI encodes:

1. Pick a project still **or** a local image (square 1:1 recommended).
2. Draw the red path and white arrows, **or** apply a preset (Horizontal / Circle loop / Diagonal).
3. Edit the `[INSERT PATH]` description (auto-filled from geometry + optional key elements).
4. **Copy prompt** + **download annotated PNG**.
5. Open [labs.google/flow](https://labs.google/flow) → **Omni Flash** → upload annotated cover → paste prompt → **Single Continuous** → generate.

IP warning (copied from the guide): real-artist/album covers can get flagged — use an invented scene in the cover’s style if Flow blocks. Never describe a **visible** drone; POV camera + “no vehicle visible” only.

---

## 3. What Cursor shipped

| Commit | What |
|--------|------|
| `e71896c` | Feature: lib + annotator + page + route + sidebar + overview next-step copy |
| `c225fff` | Prettier + named `CoverFlightRoute` so the hooks lint rule does not fire |

**Not shipped (on purpose):**

- No Google Flow / Veo / Gemini generate call
- No new edge function
- No SQL / new table / new asset_type / new bucket
- No prompt_templates seed row (would need Lovable SQL; compiler lives in code)
- No save-annotated-PNG-to-storage (download locally to avoid a Class C storage write)

---

## 4. Code map

| Path | Role |
|------|------|
| `src/lib/coverFlight/prompt.ts` | Universal Omni Flash template + `compileCoverFlightPrompt` / `compileCoverFlightFromGuides` |
| `src/lib/coverFlight/geometry.ts` | Normalized 0..1 path, presets, auto path-description, validation (2–3 arrows) |
| `src/lib/coverFlight/draw.ts` | Canvas overlay + `renderAnnotatedCover` PNG export |
| `src/lib/coverFlight/*.test.ts` | **29 unit** tests (pure; no fetch/Supabase) |
| `src/components/coverFlight/CoverFlightAnnotator.tsx` | Pointer draw (red stroke) + arrow place/rotate |
| `src/pages/CoverFlightPage.tsx` | Cover picker, presets, prompt copy, PNG download, Flow instructions |
| `src/routes/projects.$id.cover-flight.tsx` | `/projects/$id/cover-flight` |
| `src/components/ProjectSidebar.tsx` | Nav item **Cover Flight** (icon: Navigation) |
| `src/routeTree.gen.ts` | Regenerated route tree (do not hand-edit unless the plugin misses it) |

Entry in the app: open any project → left rail **Cover Flight**.

Prompt template constant: `COVER_FLIGHT_PROMPT_TEMPLATE` in `src/lib/coverFlight/prompt.ts`. Only the `[INSERT PATH: …]` block is filled per cover. The HARD RULE, “guides vanish”, and “No vehicle, no drone, no camera body is ever visible” stay in the template.

---

## 5. Chain of command (this change)

| Question | Answer |
|----------|--------|
| Repo | `fendifrost-dot/ai-video-tool` (canonical). Not Control Center. |
| Merge target | `main` via PR #20 |
| Change class | **B** — one reviewer. Docs in this file are Class A. |
| SQL | **None.** Do not open a dashboard. Do not run `supabase` CLI. |
| Edge redeploy | **None.** Publish ≠ needed for edge here because nothing in `supabase/functions/` changed. |
| Frontend live | After merge: Lovable **Publish** from `main` |
| Secrets | None added. Flow runs in Google’s UI under the user’s Google AI Pro plan. |
| Sister project | Do **not** edit `fendi-control-center` for this. |

---

## 6. Hard rules this feature must not break

These are already encoded in the compiled prompt. If you edit the template, keep all of them:

1. Artwork is a **single flat static 2D picture** in every frame. Nothing inside it moves, separates, morphs, or gets re-animated. No added objects.
2. Red line + white arrows are **production guides**, not scene elements — remove before animation.
3. Never write a physical drone/vehicle/camera body into the prompt as a visible object. “Drone flight waypoints” is waypoint language only; the motion block already says no vehicle is visible.
4. All cover processing for a **live Flow run** happens in Flow, not in the Claude sandbox. AVT only draws guides in the browser canvas and compiles text.
5. Do not fold this into Hero Frame / VTON / Grok garment-truth. Different job.

---

## 7. Deploy / verify (after merge — not before)

- [ ] PR #20 reviewed (Class B: one reviewer) and merged to `main`
- [ ] Lovable **Publish** from `main` ≥ `c225fff` (or the merge SHA)
- [ ] Confirm **no** edge functions were queued for redeploy (none should be)
- [ ] Live: open a project → **Cover Flight** appears in the rail
- [ ] Smoke: local or project still → Circle loop preset → 3 arrows → Copy prompt (placeholder gone) → Download PNG (red + white visible)
- [ ] Optional human Flow run: Omni Flash + Single Continuous. Report whether guides vanished and the cover stayed flat. That result is **OBSERVED**, not a benchmark.

If Cover Flight is missing on live after publish: the publish did not include the merge — check Lovable’s Git SHA, do not “rebuild” the feature.

---

## 8. Test health (this branch — PR #20 head)

**613 automated tests across 47 files: 576 unit, 37 mocked-integration, 0 provider-live, 0 real-media-benchmark, 0 deployment-smoke.**

Correction (2026-08-20, Claude then Cursor re-ran the taxonomy rule): an earlier draft of this handoff said **582 / 31**. The **total (613)** was right; the **split was wrong**. Applying `docs/TEST_TAXONOMY.md` (`vi.mock` / `vi.stubGlobal` or a multi-module React render):

| File | Cases | Why mocked-integration |
|------|------:|------------------------|
| `src/lib/providerJobs/api.test.ts` | 18 | mocks Supabase + storage; stubs `fetch` |
| `src/lib/video/dispatchScrubProxy.test.ts` | 11 | mocks Supabase `functions.invoke` |
| `src/components/library/MultiAngleGallery.test.tsx` | 2 | component render + storage mocks |
| `src/lib/queries/wardrobeVideoFramesGate.test.ts` | 6 | mocks Supabase + auth; stubs `fetch` (PR #19, already on this branch) |
| **Total** | **37** | |

`613 − 37 = 576` unit. Cover Flight added **29 unit** cases under `src/lib/coverFlight/` (pure; no I/O double). The three zeros are unchanged — the suite still proves **none** of: a live Flow call, a real cover animation, or a deployed RLS check.

Automated **deployment-smoke = 0**. Any manual post-deploy smokes stay **outside** this 613 headline; they do not become a fifth automated category by being mentioned.

When this PR merges, `docs/TEST_TAXONOMY.md` must read **576 / 37 / 613** (47 files), not 582 / 31 and not the 2026-08-05 539 / 31 / 570 snapshot.

Reproduce:

```bash
npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'
npx vitest run src/lib/coverFlight --exclude '**/.claude/worktrees/**'
rg -l 'vi\.mock\(|vi\.stubGlobal\(' src supabase --glob '*.test.ts*' | grep -v worktrees
npm run build
```

`npm run lint` on the **whole repo** is already red from pre-existing Prettier debt (~3300 errors). New Cover Flight files were prettier-cleaned; do not “fix the world” in this PR.

---

## 9. Do not do these

| Temptation | Why stop |
|------------|----------|
| Add a `gemini` / Flow provider `generateVideo` | No API. `apiReady: false` is correct. |
| Save annotated PNG into `project-assets` / a new bucket | Storage write → Class C. Download is enough. |
| Seed a `prompt_templates` row | Needs Lovable SQL; the compiler is code. |
| Generate the fly-through in Claude’s sandbox | Violates AVT asset-pipeline rule. |
| Use this as the video garment-swap path | LOCKED architecture is Grok keyframe + propagate, not cover-flight. |
| Open supabase.com or run `supabase` CLI | FALSE wall. This change has no schema. |
| Work from an archived clone | Canonical repo only. |

---

## 10. Suggested next work (only if Fendi asks)

Keep these **out** of an opportunistic drive-by:

1. Persist last guides per project in `metadata_json` on an existing still (still Class B if no new bucket).
2. Human Flow smoke on a **non-IP** invented cover; record OBSERVED result, do not certify a benchmark.
3. If Google ever ships a real image-to-video API that accepts this prompt, wire it as a new provider method with Class C review (keys + spend).

Until then: the tool is **annotate + compile + copy**. That is the product.

---

## 11. Session prompt (paste at start)

```
You are on AVT (ai-video-tool), not Control Center.

Cover Flight is already built on branch cursor/cover-flight-guide-6781 / PR #20.
Read claude_code_handoff_avt_cover_flight.md before touching anything named cover, Flow, Omni Flash, or music-cover.

Do not rebuild it. Do not add a Flow API. Do not mix it with Hero Frame / VTON / Grok garment.
No SQL, no edge redeploy. After merge: Lovable Publish only.
```
