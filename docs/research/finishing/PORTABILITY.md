# Second-clip / second-project finishing portability

**Lane F2 stretch · 2026-09-16 · $0 · Astra disabled**  
**Work-order:** [#114](https://github.com/fendifrost-dot/ai-video-tool/issues/114) · **Sprint:** [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) · **Core handoff:** [#103](https://github.com/fendifrost-dot/ai-video-tool/issues/103) / [PR #110](https://github.com/fendifrost-dot/ai-video-tool/pull/110)

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Verdict

**[DECISION]** The reconstructed-master handoff is **identity-parameterized**. F2 does not ship clip-specific TypeScript for YSL / `76fe7438`. A second existing project plugs in by filling four UUID fields and using the **same** folder names and UXP ops.

**[VERIFIED in code]** `validateReconstructedMasterHandoff` accepts any UUID `project_id` / `master_clip_asset_id` / chest / sleeve ids. There is no allowlist of the sprint demo. Factory: `createReconstructedMasterHandoff(identity)`.

**[VERIFIED in fixtures]** A synthetic second master (`F2_SECOND_CLIP_HANDOFF_IDENTITY`) validates with the same schema as the demo sample. IDs are **not** live assets; they prove portability without Lane H encoding a second clip.

---

## What is constant (do not fork)

| Surface | Same for every project |
|---------|------------------------|
| Sidecar `kind` / schema v1 | `reconstructed_master_handoff` |
| Locks | `paid_calls=false`, `astra_required=false`, `blocks_e2e=false` |
| Import mode | `single_clip` — `import_media_folder` of `reconstructed_master/` |
| Relpaths | `reconstructed_master/master.mp4` + `provenance.json` (never `…/76fe7438.mp4` as a schema requirement) |
| Jail | `/Volumes/T7/avt-finishing/<project_id>/` via `finishingWorkspaceRootForProject` |
| Astra | disabled until RED |

**[DECISION]** Do **not** add `src/lib/automation/finishingHandoffYsl.ts` (or any per-clip module). Binding a recipe is `bindRecipeToHandoffIdentity(recipe, identity)`.

---

## What changes per project (data, not code)

| Field | Where |
|-------|--------|
| `project_id` | sidecar + recipe |
| `master_clip_asset_id` | sidecar only (the approved clip Premiere/Resolve relinks) |
| `chest_asset_id` / `sleeve_asset_id` | sidecar lineage strings |
| `workspace_root` | recipe; derived from `project_id` |
| Export ZIP | that project's existing `premiere_ready/` + `approved_clips/` (Export page) |

The sprint demo IDs remain a **sample** ([`sample_reconstructed_master_handoff.json`](./sample_reconstructed_master_handoff.json)). They are not required for validation.

---

## How a second existing project imports (no new F2 code)

Lane H (or a human) emits the sidecar with **that** project's UUIDs. F2 only validates.

### Premiere

1. Unzip **that** project's AVT export (existing ZIP / FCPXML path).
2. Place `reconstructed_master/` next to `approved_clips/` (same relative names as the demo).
3. Copy [`sample_reconstructed_master_recipe.json`](./sample_reconstructed_master_recipe.json) → `bindRecipeToHandoffIdentity(recipe, identity)` (or edit `project_id` + `workspace_root` by hand).
4. Human or UXP: `import_fcpxml` + `import_media_folder` `approved_clips` + `import_media_folder` `reconstructed_master`.
5. Relink the sequence clip whose asset id equals `master_clip_asset_id`.
6. Do not recut. Do not enable Astra. Do not AME until `encode_status === "encoded"`.

**[HYPOTHESIS]** Premiere relink-by-filename works when `master.mp4` replaces the approved clip file. Untested on Fendi’s build (RED-F3 if a panel is installed). Human import is enough.

### Resolve (no F2 harness)

1. Same `reconstructed_master/` folder + sidecar (`finishing.host: "resolve"`).
2. **No** Premiere UXP recipe (`finishingRecipeCompatibleWithHandoff(null, handoff)`).
3. File → Import the folder (or `resolve_ready/` ZIP sibling). Relink the named clip.
4. Color stays human. Same $0 / no-Astra locks.

### AME / human

Local wrap after encode only. Same sidecar. No clip-specific F2 code.

---

## Fixtures

| File | Identity |
|------|----------|
| [`sample_reconstructed_master_handoff.json`](./sample_reconstructed_master_handoff.json) | Sprint demo (YSL / `76fe7438`) — sample |
| [`fixtures/second_clip_handoff.json`](./fixtures/second_clip_handoff.json) | Synthetic second project / master |
| [`fixtures/second_clip_recipe.json`](./fixtures/second_clip_recipe.json) | Matching Premiere recipe (`project_id` bound) |

---

## Kill criteria (portability)

1. Validator starts requiring `76fe7438` or the YSL project UUID.
2. A second project needs a new F2 TypeScript module.
3. Folder layout is renamed per clip (`reconstructed_master_<clipId>/` as a schema requirement).
4. Astra / paid calls turned on to “make the second clip work.”

---

## Spend

**$0.** No second live encode. No Premiere session. No paid Astra.
