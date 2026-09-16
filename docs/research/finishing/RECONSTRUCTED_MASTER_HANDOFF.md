# Reconstructed-master → finishing handoff contract

**Lane F2 · 2026-09-16 · $0 · isolated from Architecture C / Pipeline OS / eval core**  
**Work-order:** [#103](https://github.com/fendifrost-dot/ai-video-tool/issues/103) · stretch [#114](https://github.com/fendifrost-dot/ai-video-tool/issues/114) · **Sprint:** [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102) · **Lineage:** [#57](https://github.com/fendifrost-dot/ai-video-tool/issues/57) / [#50](https://github.com/fendifrost-dot/ai-video-tool/issues/50)

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Verdict

**[DECISION]** Lane H owns the reconstructed-master **artifact** (frames today; playable MP4 when encoded). Lane F2 owns only the **narrow consume contract** that lets Premiere (or a named alternative) ingest that artifact as **replacement media for one approved clip**. Finishing does not recut, reconstruct, restyle, or gate E2E.

**[DECISION]** This contract is **optional post-E2E**. A reconstruct E2E PASS without a finishing recipe, without Premiere, and without an MP4 encode is still a valid Lane H result. Missing finishing must never flip an E2E verdict to FAIL.

**[VERIFIED]** Hero Frame §7 RECONSTRUCT-1 E2E $0 is PASS 9/9 (`paidCalls=false`, `frames=5`) and explicitly **does not claim** an MP4 of canonical clip `76fe7438` ([`docs/reconstruct/E2E_LIVE_SUCCESS_2026-09-15.md`](../../reconstruct/E2E_LIVE_SUCCESS_2026-09-15.md), [`live-smoke/e2e-pass.json`](../../reconstruct/live-smoke/e2e-pass.json) `notClaimed` includes `mp4_of_clip_76fe7438`).

---

## Why this is not the existing ZIP / FCPXML path

Lane F ([#57](https://github.com/fendifrost-dot/ai-video-tool/issues/57)) already documented the **edit-of-record** handoff:

```
timeline_manifest.json + approved_clips/ + premiere_ready/timeline.fcpxml
```

**[DECISION]** Architecture C reconstruction is a **pixel-preserving composite of one master clip**, not a new timeline. Treating the reconstructed master as a sequence to be “built” by Astra or FCPXML would recut work Lane H already decided.

| Package | Owner | What finishing does with it |
|---------|--------|-----------------------------|
| `premiere_ready/` + `approved_clips/` | existing Export page / Lane F | Import sequence; relink approved clips |
| `reconstructed_master/` (this contract) | Lane H produces; F2 consumes | Import **one clip** as replacement media for `master_clip_asset_id` |

Both packages may sit in the same finishing workspace. They are not substitutes.

---

## Non-blocking rule (load-bearing)

```
E2E artifact production  ⊥  professional finishing
```

**[DECISION]** Invariants the validator enforces:

| Field | Required value | Why |
|-------|----------------|-----|
| `blocks_e2e` | `false` | Finishing absence must not fail Lane H |
| `paid_calls` | `false` | Sprint #102 `paidCalls=false` |
| `astra_required` | `false` | Astra stays RED / disabled |
| `finishing.recut` | `false` | Manifest / reconstruct stay source of truth |
| `finishing.regenerate` | `false` | No garment / identity restyle in finishing |

**[DECISION]** `encode_status` may be:

| Status | Meaning | Finishing |
|--------|---------|-----------|
| `not_claimed` | Current E2E: in-memory frames + JSON only **[VERIFIED]** | Dry-run / provenance check only. Do not AME this master. |
| `pending` | Lane H intends an encode; bytes not in the package yet | Same as dry-run |
| `encoded` | `master.relpath` points at a playable MP4 + optional `content_hash` | UXP `import_media_folder` / human import is allowed |

Lane H may later fill MP4 bytes **without** an F2 schema change. F2 must not encode, mux, or call ffmpeg.

---

## Artifact layout (consume-only)

Lane H (or a later export adapter Lane G records, not F2) may drop:

```
reconstructed_master/
  master.mp4                 # present iff encode_status === "encoded"
  provenance.json            # required; this contract
  eval_report.json           # optional; Lane E shape, opaque to finishing
```

**[DECISION]** Finishing never opens reconstruct internals (`src/lib/reconstruct/**` paint/composite), never reopens chest 11/11 or sleeve 6/6 goldens, and never interprets eval criteria beyond `eval_verdict` / `eval_spec_version` strings on the sidecar.

**[VERIFIED]** Pipeline OS already names `original_master_composite` as an artifact kind (`src/lib/pipeline/types.ts`). F2 does **not** edit Pipeline OS. When Lane G later records a reconstructed master, it should point at the same sidecar; F2 does not own that bind.

---

## Provenance sidecar (required fields)

Machine-readable schema: `src/lib/automation/finishingHandoff.ts` (`FINISHING_HANDOFF_SCHEMA_VERSION = 1`). Sample: [`sample_reconstructed_master_handoff.json`](./sample_reconstructed_master_handoff.json).

| Field | Role |
|-------|------|
| `kind` | `"reconstructed_master_handoff"` |
| `source` | `"lane_h"` (producer). Finishing is `"lane_f2"` consumer only. |
| `project_id` | AVT project UUID (**any** project — not an allowlist) |
| `master_clip_asset_id` | Approved clip this master **replaces** (any UUID; demo sample is `76fe7438-…`) |
| `chest_asset_id` / `sleeve_asset_id` | Lineage only; not still-golden reopen |
| `reconstruct_adapter_version` / `reconstruct_e2e_version` | Copied strings from Lane D/H |
| `frame_count` / `temporal_job_count` | Copied counts |
| `original_pixels_preserved_where_unauthorized` | Lane D acceptance bit |
| `eval_verdict` | `"PASS"` \| `"FAIL"` \| `"unscored"` — opaque |
| `eval_spec_version` | Optional string (Lane E `lane-e-reconstruct-video-v1`) |
| `not_claimed` | Copied list; finishing must not claim these either |
| `paid_calls` / `grok_per_frame` / `sam3_live_fetch` | Must be `false` |
| `encode_status` | `not_claimed` \| `pending` \| `encoded` |
| `master` | Relpath + mime when encoded; omitted/empty when not |

Canonical IDs for the sprint **sample** **[VERIFIED]** (copied strings; F2 does not import reconstruct). A second project uses different UUIDs — see [PORTABILITY.md](./PORTABILITY.md).

| | |
|--|--|
| Project | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| Master clip | `76fe7438-671d-4428-a7f6-17a45e98c16f` |
| Chest 1m CLEARED | `9ed83c01-8c7d-4d1b-918f-87b0fc743c50` |
| Sleeve 1c CLEARED | `fdb86b18-d4aa-465e-b73f-1d252709739c` |

**[DECISION]** Validators must not require those values. `createReconstructedMasterHandoff(identity)` takes any UUID identity.

---

## What Premiere (or alternative) is allowed to do

**[DECISION]** `finishing.import_mode` is `"single_clip"` only.

| Allowed | Forbidden |
|---------|-----------|
| Human or UXP `import_media_folder` of `reconstructed_master/` | Astra recut / prompt-built sequence |
| Relink the named `master_clip_asset_id` shot to `master.mp4` | Regenerating garment / identity / Architecture C |
| Existing UXP allowlist: bins, beat markers, LUT already in ZIP, local AME | New ops, generic click/type, cloud encode |
| Human color / titles **after** the reconstructed pixels are locked | Treating eval FAIL as a finishing “fix” (send back to owning lane) |

**[DECISION]** Reuse Lane F v1 UXP ops. Do **not** add `import_reconstructed_master` in this schema. `import_media_folder` already covers ingest. A new op would require a recipe schema bump after review ([CONTROLLED_HARNESS_DESIGN.md](./CONTROLLED_HARNESS_DESIGN.md)).

Sample UXP-only recipe that *also* imports the reconstructed-master folder: [`sample_reconstructed_master_recipe.json`](./sample_reconstructed_master_recipe.json). It is valid only as a dry-run while `encode_status !== "encoded"`.

---

## Alternatives (research, $0)

See [LANE_F2_RESEARCH_NOTES.md](./LANE_F2_RESEARCH_NOTES.md). Headline **[DECISION]**:

| Host | v1 status |
|------|-----------|
| **Premiere Pro + UXP** | Preferred finishing host. Same disabled Astra harness as Lane F. |
| **DaVinci Resolve** | Parallel export target already in `resolve_ready/`. No F2 harness. Same sidecar. |
| **Adobe Media Encoder (local `.epr`)** | Wrap/transcode only after `encoded`. No cloud AME. |
| **FFmpeg / in-app encode** | **Lane H / export**, not F2. F2 must not steal encode. |
| **Remotion** | Draft preview. Not a master. |
| **GPT-6 Astra** | Visual-only, **disabled**, RED-F1/F2/F10. Not required for this contract. |
| **Runway / Higgsfield / Firefly in-NLE** | Forbidden (generative restyle). |

---

## Contract other lanes can depend on

```ts
validateReconstructedMasterHandoff(json) → { ok, errors[] }
createReconstructedMasterHandoff(identity, overrides?) → sidecar  // any UUID identity
bindRecipeToHandoffIdentity(recipe, identity) → recipe
handoffBlocksE2e(json)                  → false | error
finishingRecipeCompatibleWithHandoff(recipe, handoff) → { ok, errors[] }
```

No network. No Premiere. No ffmpeg. No Pipeline OS imports. No reconstruct/eval module imports (string fields only).

Lane H: emit sidecar (+ MP4 later). Lane E: optional `eval_report.json`. Lane G: may *record* an `original_master_composite` / `export_package` ref — F2 does not bind it. Lane R: these unit tests only.

---

## Kill criteria

Stop and redesign (do not “just enable Astra”) if:

1. Finishing is inserted as a required stage of reconstruct E2E.
2. A recipe recuts or replaces media the provenance already identified as the reconstructed master.
3. Finishing calls a generative provider or sets `astra_required: true` / `paid_calls: true`.
4. F2 encodes or muxes the master (ownership theft from Lane H).
5. F2 edits paint, temporal, eval core, or Pipeline OS.
6. A second project requires clip-specific F2 TypeScript or a `76fe7438` allowlist.

---

## Spend

This contract took **$0**. Astra remains disabled. See [RED_ITEMS.md](./RED_ITEMS.md).
