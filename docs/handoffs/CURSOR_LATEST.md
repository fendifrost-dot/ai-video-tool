# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1i** occlusion | YES | YES — **LOCKED** | do not reopen |
| Stage **1j** ROI compute | YES | YES — **LOCKED** | do not reopen |
| Stage **1k** enclosure / absorb / right-end | YES | YES — **scored live** | **NOT CLEARED 7/11** |

## STAGE 1K — canonical live score (score-only)

Work-order: GitHub **#52** (parent **#50**). Repair **not** re-run.

| Field | Value |
|-------|--------|
| Asset | **`c9c4efee-6bd2-450f-a9e4-b70fb9b722bb`** |
| `repair_method_version` | `architecture_c_still_repair_1k` |
| Gate | **NOT CLEARED — 7 / 11** |
| PASS | 1, 3, 5, 7, 8, 10, 11 |
| FAIL | 2, 4, 6, 9 |
| Ghost ratios (unfiltered) | combined **0.195**, left **0.042**, right **0.273** |
| Right-end cream→navy | **41** (1j 109; fixture 42) |
| Sleeve 4×3 | **0** (1j 8) |
| Cream→navy C4 | **19** / 1-px raise (1j 71 / 3-px; fixture 0) |

vs 1j `fb8117ee` **5/11**: C5 and C8 now PASS. vs fixture **9/11**: live extra FAILs are C4 and C9-right.

Lane E 1j rescore of the same PNGs is 5/11, matching the human 1j table. Decoder: ImageScript (edge), not ffmpeg JPEG.

Full scorecard: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1K_RESULT_2026-09-15.md`

### Preserved locks

chest-local α · crease/wedge ownership · hand/face protection · no midY luma>180 lock · left-third coverage · no global SAM-3 change · ROI `dilateAlphaRoi` (1j compute)

### Next

Hold paint. ChatGPT rules on C2/C4/C6/C9-right. No V3. No paid Grok. No CC. No proxy auth widen.

### Prior blocked probe (PR #65, superseded by the live score above)

Anon/publishable JWT POST to `architecture-c-still-repair-proxy` returned HTTP **401** `unauthenticated` in **1366 ms** (not 546). Cloud VM had no user JWT. Harness remains on `main`: `scripts/architecture-c-stage1k-live-verify.sh`, `src/lib/eval/liveVerify.ts`, `docs/research/results/2026-09-04-still-repair/stage1k-harness/`.
