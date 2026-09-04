# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-04 · **Branch:** `cursor/stage-1d-verify-anchor-research-88eb` · **Commits:** (this tip)

## Track A — Stage 1D live verification

**Status: BLOCKED** before execution.

- Prepared canonical payload (clean still `2aa1a44c`, measured quad, `logo_chest`, no skin-fallback flag).
- Live UI + direct edge call returned **HTTP 403** `project_forbidden` (session JWT ≠ project owner).
- No Stage 1D asset created; DB still shows `f7c7b524` as latest `logo_chest` child of the clean still.
- Visual scorecard **NOT RUN**.
- **Chest ready for sleeve?** **NO**.

Also [V]: PR #40 tip `bb2d75f` (fail-closed SAM-3) is **not** on GitHub `main` (`0614b06`). Claimed Lovable redeploy SHA cannot be confirmed from this environment.

**Unblock:** owner-authenticated re-run (Fendi/Claude) with fail-closed defaults; accept only `occlusion_source:"sam3"` or 422 `occlusion_unavailable`.

Doc: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1D_RESULT_2026-09-04.md`

## Track B — Grok Build anchor API research

**Capability class: VERIFIED YES** — `POST /v1/images/edits` + `images[]` (multi-source still edit).  
**Same-as-consumer Build quality/identity: UNKNOWN.**

- AVT already wires this (`xaiImageEdits`, `grok-image-garment-proxy`, `grok-resolution-test`).
- Smallest probe designed; **not executed**; no paid call.
- Docs.x.ai multi-image page: up to **five** refs; AVT safe cap remains **3**.

Doc: `docs/research/results/2026-09-04-grok-build/GROK_BUILD_ANCHOR_API_RESEARCH_2026-09-04.md`

## Deployed?

| Surface | Required now? |
|---------|----------------|
| Edge redeploy | **NO** from this docs-only land. Stage 1D still needs owner run after fail-closed tip is live. If Lovable has not actually synced/redeployed PR #40 fail-closed tip, redeploy `architecture-c-still-repair-proxy` once that tip is in the Lovable project. |
| Frontend Publish | **NO** |

## Confirm

V2 active · V3 inactive · xAI spend **$0** · temporal **off** · sleeve **not started** · no provider/reference-to-image experiment executed
