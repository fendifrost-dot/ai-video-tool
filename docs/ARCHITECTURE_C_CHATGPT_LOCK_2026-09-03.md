# Architecture C — ChatGPT lock after V2 (2026-09-03)

**Status:** DECISION (ChatGPT). Binding for Cursor until Fendi issues the still-first execution directive.  
**Source:** ChatGPT review of [`claude_code_handoff_avt_architecture_c_v2_after_test_2026-09-03.md`](../claude_code_handoff_avt_architecture_c_v2_after_test_2026-09-03.md) + Fendi paste 2026-09-03.  
**Class:** A (decision record). No runtime change. No paid xAI call.

Evidence: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Locked direction

**[DECISION]** Freeze Frozen Prompt **V2**. No V3. No additional Grok spend.

**[DECISION]** Reject garment-data → prompt-compiler → another $0.32 test. Structured garment info may later describe **deterministic repair geometry**, not Grok prose.

**[DECISION]** Paid-call verdict: **`SKIP`** — $0 additional xAI spend.

**[DECISION]** Architecture C shape (cleaner, evidence-backed):

```
Grok V2 = identity-preserving garment foundation
  → deterministic product-truth repair
  → temporal propagation
  → SAM-3 / original-master reconstruction
```

That is **materially different** from asking Grok to get every garment detail right. Stop that pattern.

---

## Sequencing (ChatGPT adjustment)

Cursor’s still-first order stands. One adjustment:

**[DECISION]** Do **not** introduce a generalized structured-garment JSON schema yet. Prove `chest_band`, `logo_zone`, and `sleeve_panel` on the still with the **smallest product wiring around existing `placeDetail`**. Durable schema comes **after** those three primitives work and reveal what they need.

| Order | Gate | Stop if fail |
|-------|------|--------------|
| **1** | Deterministic repair on **one still** — V2 frame **t = 0.785 s**. Repair `chest_band` + `logo_zone`: solid navy from flat ref + deterministic SAINT LAURENT wordmark. | Do **not** build tracking around a bad repair. |
| **2** | `sleeve_panel` on the **same still**. Keep `detectStub`. Manual quads only on **visible upper-arm** geometry (arms crossed entire clip — do not claim armhole→cuff). | Same still must pass before tracking. |
| **3** | Temporal propagation of **approved** quads across V2 (optical flow / placement propagation). No per-frame Grok. | Only after still passes. |
| **4** | SAM-3 + composite onto original master `76fe7438-…` | **Next architecture gate**, not folded into this implementation quietly. |

---

## In / out of scope

**In**

- Wordmark gibberish → `logo_zone`
- Cream pinstripe on navy chest band → `chest_band` cover
- Wrong sleeve geometry (horizontal ring) → manual `sleeve_panel` on visible upper arm
- Cream pinstripe on sleeve rings if it sits in the sleeve-panel repair region

**Out**

- Hanging dark hem artifact — unless a legitimate repair region naturally covers it
- Longer silhouette / crop length — not a branding/geometry disguise for garment regeneration
- V3 prompt, prompt compiler, paid Grok
- Generalized repair JSON schema before the three primitives prove out

---

## Cursor hold

**[DECISION — Fendi, 2026-09-03]** Proceed authorized. Cursor implements still-first product wiring (`architecture-c-still-repair-proxy` + Hero Frame §7) with **hard stop before temporal tracking**. No V3, no spend.

Until still passes human review: no temporal propagation, no SAM-3 master composite.
