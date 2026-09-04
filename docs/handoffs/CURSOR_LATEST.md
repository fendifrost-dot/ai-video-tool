# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-04 · **Branch:** `cursor/architecture-c-still-1c-corrections-88eb` · **Commits:** (this tip)

## Landed — ChatGPT Stage-1C + ONE BLOCKING CORRECTION (SAM-3 fail-closed)

Preserves wordmark / LF shading / quad fill / zip / V3 I/J from `d170491`. This tip closes the ChatGPT merge blocker:

### SAM-3 completeness (BLOCKER fix)
`resolveSam3StillOcclusion` / `buildCompleteSam3OcclusionAlpha` require **outfit + hands + face**.
- hands fail → `ok:false`, reason `sam3_hands_failed` — **never** `"sam3"`
- face fail → `sam3_face_failed` — **never** `"sam3"`
- outfit-only / partial → **never** `"sam3"`

### logo_chest / Stage-1D fail-closed policy
`LOGO_CHEST_OCCLUSION_POLICY.allowSkinHeuristicFallbackByDefault = false`
`logoChestOcclusionGate`: if SAM incomplete and fallback not explicitly opted in →
**HTTP 422 `occlusion_unavailable`**, `asset_persisted: false`, **before** composite/upload/`project_assets` insert.

Body opt-in only: `allowSkinHeuristicFallback: true` (non-gated contexts). Stage-1D must not pass it.

`occlusion_source` semantics:
- `"sam3"` — complete mask only
- `"skin_heuristic_fallback"` — only when explicitly permitted
- `"unavailable"` / 422 — fail-closed path

### Unchanged (do not regress)
Low-frequency shading · quad-only expansion · zip overlay · logo sub-zone · V3 I/J inactive · V2 active · temporal off · sleeve not started

### Docs
Fixed stale sentence in `ARCHITECTURE_C_STILL_REPAIR_POST_DEPLOY_VERIFY_2026-09-04.md` that claimed SAM-3 was deferred.

### Claude handoff (origin/main rev 6)
Claude already noted the fallback caveat on `d170491`; this tip closes it. Local checkout of `CLAUDE_LATEST` may lag until rebase/merge — authoritative tip is `origin/main` rev 6.

## Deployed?

| Surface | Status |
|---------|--------|
| `architecture-c-still-repair-proxy` edge redeploy | **YES — required** after ChatGPT re-review + merge |
| Frontend Publish | **NO — not required** |

**STOP — no Stage 1D / no live run / no paid calls until ChatGPT re-reviews.**

## Confirm

V2 active · V3 inactive · xAI spend **$0** · temporal **off** · sleeve **not started** · no live Stage 1D
