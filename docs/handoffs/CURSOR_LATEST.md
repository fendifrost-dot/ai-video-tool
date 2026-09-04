# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-04 · **Branch:** `cursor/architecture-c-still-1c-corrections-88eb` · **Commits:** (this tip)

## Landed — ChatGPT Stage-1C Regression Correction Directive (full)

Preserves wordmark sub-zone (`logo_offset_norm` / `logo_height_ratio`). Does **not** redesign the deterministic repair system.

### A — Logo sub-zone (preserved)
Wearer's-left + ~½ band height defaults + golden regression proving no silent return to full-band/centered.

### B — Low-frequency band illumination
Renamed path: `applyLowFrequencyBandIllumination` (alias `applyBandLumaShading`). Defect-masked navy luma → median fill → box blur → gain clamp **[0.85, 1.15]**. HF lettering/pinstripe must not survive (unit + golden tests).

### C — Band expansion geometry
Still-repair uses `fillMode: "quad"` + `columnFollow: false`: paint only inside a band-normal-expanded quad. No column-follow navy drips. Tilted-band leak test asserts against the **quad**, not AABB.

### D — Zip overlay
`overlayZipFromSource(..., stripFrac, zipUNorm=0.5)`: continuous navy cover, then feathered mastic zip tape restore. Parameterised `zipUNorm` for reuse. No raw slit.

### E — SAM-3 occlusion
Edge `resolveSam3StillOcclusion` → CC SwitchX `segment-image` (same secrets as `sam3-segment-proxy`; **no Grok proxy changes**):
`α = outfit − dilate(hands) − dilate(face)`.
Applied via `applyOcclusionAlphaComposite`.

`occlusion_source`:
- `"sam3"` when SAM α is used
- `"skin_heuristic_fallback"` when SAM cannot execute and fallback is allowed
- `"unavailable"` → visible `422 occlusion_unavailable` (fail closed if fallback disabled)

Never reports heuristic as SAM-3.

### F — Mask-derived geometry metadata
Persists `requested_band_quad_norm`, `effective_band_bbox` (+ pixel_count), `occlusion_source`, `repair_method_version: architecture_c_still_repair_1d`. Manual quad remains bootstrap/override; paint gated by SAM α when present.

### G — Golden fixture
`src/lib/garment/architectureCStillRepairGolden.test.ts` — canonical still id `2aa1a44c` + measured quad; synthetic 720×1280 frame guards structural invariants (logo sub-zone, no sleeve drip, LF shading, zip overlay, occlusion α, V2/V3 gates, temporal off).

### V3 I/J (inactive)
`GROK_VIDEO_EDIT_PROMPT_V3` includes mastic welt pockets + mastic cuffs + navy panels stop above cuff. V1/V2 preserved. Active = V2. Version `"v2"`. No spend gate opened.

## Deployed?

| Surface | Status |
|---------|--------|
| `architecture-c-still-repair-proxy` edge redeploy | **YES — required** (after ChatGPT authorizes + merge) |
| Frontend Publish | **NO — not required** for this land (server-side composite + inactive V3 text only) |

**Do not run Stage 1D until ChatGPT reviews this commit and authorizes redeploy.**

## Confirm

V2 active · V3 inactive · xAI spend **$0** · temporal **off** · sleeve **not started**
