# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-10-02 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Product / code audit (NO implementation) — 2026-10-02

**Full write-up:** [`docs/handoffs/CURSOR_PRODUCT_CODE_AUDIT_2026-10-02.md`](CURSOR_PRODUCT_CODE_AUDIT_2026-10-02.md)

Requested while Claude owns camera movement / testing. Scope: clothing swap, environments, camera/angles, path to a finished cut. **Security omitted by request.** Audit only — no code changes beyond this handoff.

**Baseline:** `main` @ `fea6ba3`. Complements (does not replace) Claude’s stall audit and lyric-lock plan.

### Verdict (short)

Scripts-lane env/camera/world work is real and advancing. The finish-product gap is: (1) one declared garment policy so Hero Frame stops showing three lanes as equal, (2) bridge scripts → Treatment/Produce (edge proxies have no `src/` callers; look presets CLI-only; ShotSpec camera fields unmapped), (3) close plan B3–B6 / C2–C4 (override, regenerate-from-lyrics, brief fidelity, batch-from-storyboard, transitions on cards).

### Top missed / harden items

| P | Item |
|---|------|
| P0 | Visualiser v2 `scenes[]` ≠ `run_broll_batch` `concepts[]` schema |
| P0 | ShotSpec `framing` / `cameraAngle` / `lens` / `reconstruction` in `ROW_UNMAPPED_FIELDS` |
| P0 | Higgsfield `apiReady: false` while CC DoP/catalogue/Seedance are live |
| P1 | Camera engine still-plate only vs living video plates — document ordered recipe |
| P1 | Look finishing + brief-fidelity not in acceptance chain |
| P1 | Foreground occluder layer for world-around composites |
| P1 | Lane A propagate engine still disabled (ARCH-1); §6 durable queue still open |
| P2 | Plan remainder B3–B7 / C2–C4; hook master cuts; 9:16 plates; tests for gate/camera runners |

### Do not (from this audit)

Reopen chest/sleeve paint · scale Lane A without a Fal flow model · treat Produce Video as the env lane · fold look into the realism verdict · implement from this handoff without Fendi choosing the garment supersede.

---

## Prior Cursor work (Lane H / reconstruct) — frozen pointer

Last reconstruct-oriented Cursor handoff content (2026-09-16) is preserved in git history for this file and in:

- [`docs/reconstruct/PLAYABLE_BROWSER_DECODE.md`](../reconstruct/PLAYABLE_BROWSER_DECODE.md)
- [`docs/reconstruct/PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md`](../reconstruct/PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md)

Live Hero Frame export E2 sample PASS (PR #133 Publish) and playable decode status are unchanged by this audit. Real-media locks remain UNCLAIMED.
