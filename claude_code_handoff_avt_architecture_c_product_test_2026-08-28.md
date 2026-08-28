# Claude / ChatGPT Handoff — Architecture C product test (2026-08-28)

**Date:** 2026-08-28  
**Author:** Cursor cloud agent  
**Audience:** Claude Code, ChatGPT, Fendi — review before the next ~$0.30 product click  
**Repo:** https://github.com/fendifrost-dot/ai-video-tool (`main`)  
**Live app:** https://aivideotool.lovable.app/  
**Lovable project:** `bd21b544-c7b8-4780-bdde-391ac9d4bfa8` · Supabase ref `qoyxgnkvjukovkrvdaiq`

**Read first:**
- `docs/AGENT_BOOTSTRAP.md` + `.deployment/manifest.yml`
- `docs/research/ARCHITECTURE_C_DECISION.md` — **GO WITH DETERMINISTIC REPAIR**
- `docs/research/GROK_RECAP_2026-08_PHASE2_CURSOR_SESSION.md` — P2_corrected evidence
- This file

**Evidence labels:** **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## 0. Executive summary

Architecture C moved from research into a **product test lane** (`grok-video-edit-proxy` + Hero Frame §6 UI). Research spend remains **$0.32** (one billed P2_corrected run). **No product-lane xAI spend has occurred.**

The prior deployment report said *"blockers: none expected."* That was wrong. **Four blockers** were found on live inspection. Two are hard stops; one is a false-negative risk; one is quality.

| # | Blocker | Class | Status (2026-08-28) |
|---|---------|-------|---------------------|
| 1 | Empty garment selector (identity / RLS) | **HARD** | **Diagnosed (H1).** UX warnings in PR #36. Fix = RISK-001 / Class C — no duplicate artists. |
| 2 | `reference_images` sent as `string[]` | **HARD** | **Fixed in PR #36** — `[{url}]` + unit test. Needs merge + edge redeploy. |
| 3 | Default prompt describes wrong garment (track jacket) | **FALSE NEGATIVE** | **Gated in PR #36** — billed runs blocked until Fendi confirms frozen prompt string. |
| 4 | Reference picker sends on-model + flat (R1) | **QUALITY** | **Fixed in PR #36** — flat-only, max 1 (R4 config) at video-edits call site. |

**Do not spend the $0.30 until:** PR #36 merged, edge redeployed, identity visible (Blocker 1), and frozen prompt confirmed (Blocker 3).

---

## 1. Git / deploy state

| Item | SHA / ref | Label |
|------|-----------|-------|
| `origin/main` (tip) | `0e9c3bb` — "Fixed Deno build errors" | **VERIFIED** |
| Architecture C product lane merged | `991bcb2` (PR #34) | **VERIFIED** |
| `video_projects` table hotfix | `6493492` (PR #35) | **VERIFIED** |
| Blocker fixes (open) | PR **#36** `cursor/architecture-c-blockers-7e56` @ `0501684` | **VERIFIED** |
| Deployed edge function source | `6493492` (`grok-video-edit-proxy` redeployed) | **VERIFIED** — Lovable deploy log |
| Live UI synced | `6493492` per Lovable `get_project` | **VERIFIED** |
| Research evidence merged | `fd7b565` (PR #33) | **VERIFIED** |

### Unreviewed bot commits on `main` (ahead of deployed `6493492`)

```
0e9c3bb  Fixed Deno build errors
fc629ea  Changes
```

**[VERIFIED]** Replace `ReturnType<typeof createClient>` with `any` across **10** edge functions (not `grok-video-edit-proxy`). No PR, no review. **Decide deliberately** before redeploying "from current main."

---

## 2. Architecture decision (locked for product test)

**[DECISION] GO WITH DETERMINISTIC REPAIR** — see `docs/research/ARCHITECTURE_C_DECISION.md`.

Production shape:

```
Grok video edit (garment appearance/motion inside mask)
  → SAM-3 garment isolation
  → original master outside garment
  → deterministic branding/geometry repair
```

Do **not** trust Grok for exact branding or pristine master pixels. The product lane ships **raw Grok `edited_clip`** for human review first; compositing is follow-on.

---

## 3. Product lane inventory

| Piece | Path |
|-------|------|
| Edge function | `supabase/functions/grok-video-edit-proxy/index.ts` |
| Config | `supabase/config.toml` → `[functions.grok-video-edit-proxy] verify_jwt = true` |
| Client | `src/lib/queries/grokVideoEdit.ts` |
| Prompt gate | `src/lib/heroFrame/grokVideoEditPrompt.ts` |
| UI | `src/components/video/GrokVideoEditRunner.tsx` on Hero Frame §6 |
| Route | `/projects/$id/hero-frame` |
| Review output | `edited_clip` row → `/projects/$id/review` |

**Manual test URL (YSL):**

```
https://aivideotool.lovable.app/projects/764a63d2-93cd-44f3-905f-292f51/hero-frame
```

Scroll to **§6 · Phase 2 — video garment swap** → **Architecture C — Grok video edit (product test)**.

**Deploy chain:** GitHub `main` ingest → Lovable Publish (frontend) → **separate** Lovable Edge Functions redeploy for `grok-video-edit-proxy` only. Publish ≠ edge redeploy.

---

## 4. Blocker 1 — empty garment selector (HARD) [VERIFIED live]

### Symptom

At the YSL hero-frame URL, **SOURCE VIDEO ASSET** populates (17 options) but **GARMENT (CHARACTER_FEATURES)** shows only "Select…". Same for §6 garment reference and §2 wardrobe dropdown. `/artists` → "No artists yet". `/looks` → "All samples (0)".

Live session: `uid 832fa0bc-1f7e-4586-ab8b-2ac323698ede`, `is_anonymous: true`.

### Code path

```ts
// GrokVideoEditRunner.tsx
const artistId = projectQuery.data?.artist_id ?? undefined;
const garments = useWardrobe(artistId).data ?? [];
const canRun = Boolean(artistId && videoAssetId && wardrobeFeatureId && ...);
```

`useWardrobe` filters `character_features` by `artist_id` + wardrobe `feature_type`s. Zero visible rows ⇒ `canRun` false.

### SQL (service-role, Lovable — 2026-08-28)

**D — RLS lock-down is LIVE:**

- `artists_select_own`, `artists_insert_own`, …
- `Users access own character_features`
- Same pattern on `location_library`, `prop_library`, `artist_looks`

**A — Artists exist:**

| id | name | user_id |
|----|------|---------|
| `8d4a4d22-41c0-43ab-ba99-92750f81e335` | Fendi Frost | `3ca10935-8c3d-4479-9a0c-8bfe8050840c` |
| (+ 4 smoke-test artists, same owner) | | |

**B — YSL project:**

| field | value |
|-------|-------|
| `id` | `764a63d2-93cd-44f3-905f-292f51` |
| `title` | YSL (Ice On) |
| `artist_id` | `8d4a4d22-41c0-43ab-ba99-92750f81e335` |
| `user_id` | `3ca10935-8c3d-4479-9a0c-8bfe8050840c` |
| `artist_row_exists` | 1 |

**C — Wardrobe rows for Fendi Frost artist:**

| feature_type | count |
|--------------|-------|
| `wardrobe_outerwear` | 3 |
| `wardrobe_top` | 3 |
| `wardrobe_bottom` | 3 |
| (+ face, hair, style_reference, etc.) | |

**SL jacket row** `0feb028f-dc4d-45dc-82ac-e4bbd16054b0`:

- Label: "Saint Laurent Track Jacket - Mastic Cotton Navy Stripe" (name is misleading — garment is stand-collar, not track)
- `reference_images`: `on_model` + `front` (flat product shot)

### Verdict: **H1 — RLS + identity split** [VERIFIED]

Data exists under `user_id = 3ca10935-…`. Anonymous session `832fa0bc-…` cannot see `artists` / `character_features` under owner-scoped RLS. Correlation is exact: tables touched by RISK-001 Part A are empty in UI; `video_projects` / `project_assets` still read fine.

**Not H2** — wardrobe rows exist; benchmarks used explicit paths, but the `character_features` row for the SL jacket is populated.

### Fix path

- **Do not** create duplicate artists or wardrobe rows.
- **RISK-001 / PR #17** identity consolidation — Class C review gate.
- Short-term for Fendi: sign in as the **owning account** (`3ca10935-…`), not anonymous.
- PR #36 adds UX: "artist not visible to this account" / empty wardrobe warnings.

---

## 5. Blocker 2 — stale xAI schema (HARD) [VERIFIED in benchmark]

Pre-#36 code:

```ts
reference_images: referenceUrls,  // string[] — 422s on current xAI API
```

Working shape (P2_corrected 422→200 transitions in this project):

```ts
video: { url: videoUrl },
reference_images: referenceUrls.map((url) => ({ url })),
```

**PR #36:** `supabase/functions/_shared/grokVideoEditRequest.ts` + `grokVideoEditRequest.test.ts`.

**Also drift elsewhere (not fixed in #36):** `grok-video-research-proxy` reference_to_video mode still sends `string[]`; CC `video-providers-grok-generate` — logged open defect.

---

## 6. Blocker 3 — wrong default prompt (FALSE NEGATIVE) [VERIFIED]

Shipped default (removed in PR #36) described a **navy Saint Laurent track jacket with white side stripes** — wrong garment.

**Actual garment** (all reference images + benchmarks): **Saint Laurent Mastic Cotton Stand-Collar Jacket** — mastic/cream body, navy stand collar, navy chest band with SAINT LAURENT lettering, navy sleeve/side panels. No white stripes. No ribbed cuffs. No front zip. Not a track jacket.

Fendi's standing rule: **"Do not substitute a similar Saint Laurent track jacket."**

**PR #36 gates billed runs:**

- `src/lib/heroFrame/grokVideoEditPrompt.ts` → `GROK_VIDEO_EDIT_PROMPT_READY = false`
- Edge returns `400 prompt_required` on billed calls without prompt
- `dryRun` still works for $0 reachability smoke

**Awaiting:** Fendi confirmation of exact string from `GROK_RECAP_FOUR_STEP_VERDICT.md` §"Step 1 & 2" (external recap artifact — not in repo). **Do not paraphrase.**

Benchmark prompt elements that must be in the frozen string:

- A3′ concrete construction prose
- A3″ full-outfit scope
- Explicit brand-isolation clause (suppressed Ralph Lauren pony leak 3-for-3 in image benchmark)

---

## 7. Blocker 4 — reference config (QUALITY) [VERIFIED benchmark]

Pre-#36: `pickGrokGarmentReferencePaths(..., max=2)` with on-model-first sort (R1 config).

R4/R5 reference-configuration results:

| Config | Collar | Chest band |
|--------|--------|------------|
| R1 — on-model first + flat | cream fold-over ❌ | broken |
| R5 — flat first + on-model | cream fold-over ❌ | poor |
| **R4 — flat ONLY** | **navy, upright ✅** | **continuous ✅** |

**PR #36:** `pickGrokVideoEditReferencePaths()` — excludes on-model, max 1 flat ref, lane-specific at `grok-video-edit-proxy` call site. Does **not** change `sortRefsForFullLookGarment` (VTON / full-look lanes unchanged).

---

## 8. Research evidence (frozen — do not re-spend to re-prove)

| Item | Value |
|------|-------|
| Clip asset | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| SL jacket `character_features` | `0feb028f-dc4d-45dc-82ac-e4bbd16054b0` |
| P2_corrected request | `ed27462b-39c6-9fe6-9d6b-e3a6475809c0` |
| P2_corrected cost | **$0.32** |
| Output | `project-exports/research/grok-recap-2026-08/probe-ed27462b-….mp4` |
| Visual scorecard sum (axes 1–10) | 20/30 |
| MAJOR FAILURE (edit vs regen) | **NO** |
| Research proxy | `grok-video-research-proxy` (research only) |
| Product proxy | `grok-video-edit-proxy` (product lane) |

Tests A3 / B1 (billed): **not executed** — JWT stale in cloud; user approved skipping back to research harness.

---

## 9. Identity map (for reviewers)

| Identity | UUID | Role |
|----------|------|------|
| Durable owner | `3ca10935-8c3d-4479-9a0c-8bfe8050840c` | Owns artists, wardrobe, YSL project |
| Anonymous live session | `832fa0bc-1f7e-4586-ab8b-2ac323698ede` | Sees projects/assets; **cannot** see artists/wardrobe |
| Fendi Frost artist | `8d4a4d22-41c0-43ab-ba99-92750f81e335` | Linked to YSL project |
| YSL project | `764a63d2-93cd-44f3-905f-292f14ab2f51` | Product test target |

Storage path prefix `832fa0bc-…/` on master video reflects uploader uid history — cuts against naive "never the same person" but RLS is keyed on `user_id` column, not storage path prefix.

---

## 10. Suggested order of work (for next agent)

1. **Review PR #36** — schema fix, R4 refs, prompt gate, UX warnings.
2. **Merge #36** → redeploy **only** `grok-video-edit-proxy`.
3. **Fendi confirms frozen prompt** → set `GROK_VIDEO_EDIT_PROMPT` + `GROK_VIDEO_EDIT_PROMPT_READY = true` → merge → redeploy edge.
4. **Resolve Blocker 1** — sign in as owner **or** RISK-001 identity consolidation (Class C). No duplicate rows.
5. **Decide** on bot commits `fc629ea` / `0e9c3bb` before any broad edge redeploy.
6. **Fendi clicks "Run Grok video edit"** — the next ~$0.30 should be the product test, not another agent benchmark.

---

## 11. Out of scope

- A3/B1 research harness revival (unless explicitly re-requested)
- SAM-3 + master composite implementation (follow-on after promising raw edit)
- Aleph 2 / compatibility-gate / ARCH-DEFECT-002
- Widening `grok-video-research-proxy` auth
- Standalone Supabase dashboard / CLI
- New prompt engineering — Blocker 3 restores frozen prompt only

---

## 12. Review checklist (Claude / ChatGPT)

Please verify:

- [ ] PR #36 `reference_images: [{url}]` matches live xAI `/v1/videos/edits` contract
- [ ] `pickGrokVideoEditReferencePaths` correctly implements R4 (flat-only, no on-model leak)
- [ ] Prompt gate prevents billed runs with wrong garment text
- [ ] UX warnings accurately describe H1 without suggesting duplicate data creation
- [ ] Identity consolidation path is correctly scoped to RISK-001 / Class C
- [ ] Bot `any` typing commits on `main` are called out before next redeploy
- [ ] No scope creep into research spend or architecture change without Class C sign-off

**Return to Fendi:** merge recommendation on #36, any security/correctness blockers, and whether the frozen prompt gate is sufficient until the exact string is confirmed.
