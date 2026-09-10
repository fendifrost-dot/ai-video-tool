# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-10 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1i** | YES (`1ada136` / PR #49) | YES — scored **NOT CLEARED** 6/11 (`21972fcf`, evidence `c6e032b`) | done — **occlusion ownership LOCKED** |
| Stage **1j** code | **YES — this commit** | **NO — redeploy needed** | **YES after** `architecture-c-still-repair-proxy` redeploy |
| Sleeve / temporal / paid xAI | blocked | — | **NO** |

## STAGE 1J ON MAIN — ready for edge redeploy

`repair_method_version: architecture_c_still_repair_1j`

Evidence: `c6e032b` + handoff `c16c4fe`. Occlusion semantics from 1i are **locked** (no reopen).

### Fixes

| # | Defect | Fix |
|---|--------|-----|
| 1 | Close-rejection stripped mid-luma interior AA → outline ghosts (809/866) | Topology rule: close-added mid-luma kept when ≥4 original-seed neighbors (interior); boundary bridges still rejected |
| 2 | HTTP 546 from two full-frame r=12 dilates | `dilateAlphaRoi` on band bbox padded by dilatePx — exact semantics inside band |

### Preserved 1i locks

chest-local α · crease/wedge ownership · hand/face protection · no midY luma>180 lock · left-third coverage · no global SAM-3 change

### Deploy

Redeploy **only** `architecture-c-still-repair-proxy`. No frontend Publish.

### Claude next

1. Redeploy **only** `architecture-c-still-repair-proxy`
2. Canonical $0 still on `2aa1a44c` + measured quad; expect `architecture_c_still_repair_1j`
3. Score 11 chest criteria — confirm no 546 and outline ghosts cleared
