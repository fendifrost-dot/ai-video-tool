# Lane F — Astra / Premiere finishing (research)

**Work-order:** [GitHub #57](https://github.com/fendifrost-dot/ai-video-tool/issues/57)  
**Umbrella:** [GitHub #50](https://github.com/fendifrost-dot/ai-video-tool/issues/50) lane 6  
**Date:** 2026-09-15  
**Class:** A (docs + isolated unit tests). Does **not** touch Architecture C, proxies, Control Center, or timeline/export engines.

This folder is the ownership surface for Lane F. Other lanes should treat it as a **contract**, not a runtime dependency.

| Doc | What it is |
|-----|------------|
| [ASTRA_PREMIERE_FINISHING_ARCHITECTURE.md](./ASTRA_PREMIERE_FINISHING_ARCHITECTURE.md) | Practical finishing architecture (what AVT owns vs Premiere vs Astra) |
| [CONTROLLED_HARNESS_DESIGN.md](./CONTROLLED_HARNESS_DESIGN.md) | Minimum controlled computer-use / UXP harness |
| [RED_ITEMS.md](./RED_ITEMS.md) | Items that need Fendi approval **before** any paid or external action |
| [sample_finishing_recipe.json](./sample_finishing_recipe.json) | Example allowlisted recipe (UXP-only, Astra disabled) |

**Code contract (type-only + validator, no I/O):**

| Path | Role |
|------|------|
| `src/lib/automation/finishingRecipe.ts` | Recipe schema + allowlist validator |
| `src/lib/automation/finishingHarness.ts` | Harness config; Astra runner **disabled by default** |
| `src/lib/automation/premiereUxp.ts` | Existing v1 stub (unchanged behavior) |

**Lane state:** READY (architecture + harness plan documented; no paid action taken).
