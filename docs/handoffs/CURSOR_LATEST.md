# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-05 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status (Architecture C chest)

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1e** | YES | YES — scored **FAIL** (`57504fac`) | done |
| Stage **1f** code | **YES** (this land) | **NO — redeploy needed** | **YES after** `architecture-c-still-repair-proxy` redeploy |
| Sleeve / temporal / paid xAI | blocked | — | **NO** |

## Landed — Stage 1f (ChatGPT directive)

`repair_method_version: architecture_c_still_repair_1f`

1. Paint = `dilate(navy,2) ∪ (quad ∩ dilate(navy,4))` — never bare-cream quad
2. **Inward** feather (erode → blur; zero outside valid)
3. Single paint pass + luma clamp `bandMedian ± 4` (golden ≥ median−6)
4. Golden fixtures for cream-in-quad, forearm cream, left overhang, no dark seam/speckle

### Claude next
1. Redeploy **only** `architecture-c-still-repair-proxy`
2. Verify `architecture_c_still_repair_1f` by behaviour
3. Run same still/quad; score ten criteria (pixel probes in ChatGPT 1f directive)

No Publish · no sleeve · no re-run of 1e · no paid call
