# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-15 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item                                        | On `main`?               | Live / redeployed?               | Ready to test?                                   |
| ------------------------------------------- | ------------------------ | -------------------------------- | ------------------------------------------------ |
| Stage **1i** occlusion                      | YES                      | YES — **LOCKED**                 | do not reopen                                    |
| Stage **1j** ROI compute                    | YES                      | YES — **LOCKED**                 | do not reopen                                    |
| Stage **1k** enclosure / absorb / right-end | YES (`0b12e8c` / PR #64) | **redeploy claimed** (`9366f09`) | **live score BLOCKED** — no user JWT on cloud VM |
| Sleeve / temporal / paid xAI                | blocked                  | —                                | **NO**                                           |

## STAGE 1K LIVE VERIFY — BLOCKED (harness ready)

`repair_method_version` expected: `architecture_c_still_repair_1k`

Work-order: GitHub **#52** (parent **#50**). Lane A only. Paid spend locked.

### What ran

| Probe                                      | Result                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| POST proxy with anon/publishable JWT       | HTTP **401** `unauthenticated` in **1366 ms** — **not 546**            |
| OPTIONS proxy                              | 200                                                                    |
| DB `architecture_c_still_repair_1k` assets | **0** — newest chest still is 1j `fb8117ee`                            |
| Lane E fixture (crop + 1h α)               | **NOT CLEARED 9/11** (FAIL 2 pinstripe remnants, 6 right-end 42 px)    |
| 1j live PNG Lane E extras                  | ghosts 0.607/0.593, right-end 109, sleeve 4×3 = 8 — matches `d3dbe647` |

Exact blocker: cloud VM `.env` has no AVT **user** access token. Proxy `getUser()` rejects the anon key. Do not use service-role.

### Claude next (Cowork / Execution Manager)

```bash
AVT_USER_ACCESS_TOKEN='<signed-in AVT owner JWT>' \
  ./scripts/architecture-c-stage1k-live-verify.sh --skip-calibration
```

1. Refuse if version ≠ `architecture_c_still_repair_1k` (DEPLOYMENT MISMATCH).
2. Score 11 chest criteria from `stage1k-harness/<label>/report.json`.
3. Commit live asset id + latency + table over this blocked report.

Evidence: `docs/research/results/2026-09-04-still-repair/ARCHITECTURE_C_STILL_REPAIR_STAGE1K_RESULT_2026-09-15.md`

### Preserved locks

chest-local α · crease/wedge ownership · hand/face protection · no midY luma>180 lock · left-third coverage · no global SAM-3 change · ROI `dilateAlphaRoi` (1j compute) · no V3 · no paid Grok
