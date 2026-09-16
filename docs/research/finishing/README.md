# Lane F / F2 — Astra / Premiere finishing (research)

**Work-order (F):** [GitHub #57](https://github.com/fendifrost-dot/ai-video-tool/issues/57)  
**Work-order (F2):** [GitHub #103](https://github.com/fendifrost-dot/ai-video-tool/issues/103) · sprint [GitHub #102](https://github.com/fendifrost-dot/ai-video-tool/issues/102)  
**Umbrella:** [GitHub #50](https://github.com/fendifrost-dot/ai-video-tool/issues/50) lane 6  
**Date:** 2026-09-16  
**Class:** A (docs + isolated unit tests). Does **not** touch Architecture C, proxies, Control Center, Pipeline OS, eval core, or timeline/export engines.

This folder is the ownership surface for Lane F / F2. Other lanes should treat it as a **contract**, not a runtime dependency. **Finishing must not block E2E artifact production.**

| Doc | What it is |
|-----|------------|
| [ASTRA_PREMIERE_FINISHING_ARCHITECTURE.md](./ASTRA_PREMIERE_FINISHING_ARCHITECTURE.md) | Practical finishing architecture (what AVT owns vs Premiere vs Astra) |
| [RECONSTRUCTED_MASTER_HANDOFF.md](./RECONSTRUCTED_MASTER_HANDOFF.md) | **F2** narrow handoff: Lane H reconstructed master → Premiere / alternative |
| [LANE_F2_RESEARCH_NOTES.md](./LANE_F2_RESEARCH_NOTES.md) | Premiere / Resolve / AME / Astra alternatives; $0, Astra disabled |
| [CONTROLLED_HARNESS_DESIGN.md](./CONTROLLED_HARNESS_DESIGN.md) | Minimum controlled computer-use / UXP harness |
| [RED_ITEMS.md](./RED_ITEMS.md) | Items that need Fendi approval **before** any paid or external action |
| [sample_finishing_recipe.json](./sample_finishing_recipe.json) | Example allowlisted recipe (UXP-only, Astra disabled) |
| [sample_reconstructed_master_handoff.json](./sample_reconstructed_master_handoff.json) | Provenance sidecar (`encode_status: not_claimed`) |
| [sample_reconstructed_master_recipe.json](./sample_reconstructed_master_recipe.json) | UXP recipe that imports `reconstructed_master/` (no AME until encoded) |

**Code contract (type-only + validator, no I/O):**

| Path | Role |
|------|------|
| `src/lib/automation/finishingRecipe.ts` | Recipe schema + allowlist validator |
| `src/lib/automation/finishingHandoff.ts` | Reconstructed-master sidecar validator; does not block E2E |
| `src/lib/automation/finishingHarness.ts` | Harness config; Astra runner **disabled by default** |
| `src/lib/automation/premiereUxp.ts` | Existing v1 stub (unchanged behavior) |

**Astra access [DECISION]:** available via Fendi's OpenAI API for **research documentation only**. No billed computer-use, no live Premiere session, no key in this repo. Spend still requires a RED yes on [#57](https://github.com/fendifrost-dot/ai-video-tool/issues/57) / [#103](https://github.com/fendifrost-dot/ai-video-tool/issues/103).

**Lane state:** F READY (architecture + harness). **F2 READY** (handoff contract + $0 validators). Does not block AVT engineering or Lane H E2E.
