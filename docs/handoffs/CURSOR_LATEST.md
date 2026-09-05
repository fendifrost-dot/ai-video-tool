# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-05 · **Branch:** `cursor/architecture-c-still-1c-corrections-88eb` · **Head SHA:** `b360e276b4a9e78f12041b358bee303b9cf60ab9`

## ChatGPT verdict: APPROVE — MERGE PR #40

Reviewed tip includes blocker fix `bb2d75f` (fail-closed SAM-3). Do **not** merge the older `d170491` tip alone.

**PR:** https://github.com/fendifrost-dot/ai-video-tool/pull/40  
**Tests:** 694 passed · **build ok** · no paid call · no Stage 1D in this land

## After merge — ONLY this deploy step

| Action | Required? |
|--------|-----------|
| Lovable → **Edge Functions → redeploy `architecture-c-still-repair-proxy`** | **YES** |
| Frontend Publish | **NO** |
| Manual GitHub merge by Fendi (routine) | Prefer platform merge of approved PR #40; Lovable syncs Cursor commits — then edge redeploy |

## Then Stage 1D (owner session)

Canonical inputs unchanged:
- still `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`
- quad `[[0.30,0.530],[0.87,0.533],[0.87,0.585],[0.30,0.582]]`
- `logo_chest`, **no** `allowSkinHeuristicFallback`

Accept only:
- `occlusion_source: "sam3"` + new still to score, **or**
- HTTP **422** `occlusion_unavailable` / `asset_persisted: false`

No heuristic · no sleeve · no temporal · no paid Grok

## Fail-closed policy (merged tip)

`"sam3"` only if outfit+hands+face all succeed; else `sam3_hands_failed` / `sam3_face_failed` / etc. Canonical logo_chest defaults skin fallback **off** → 422 before composite/upload/`project_assets` insert.

## Confirm

V2 active · V3 inactive · temporal off · sleeve held · xAI spend $0 pending Stage 1D
