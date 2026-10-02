# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-10-02 (rev C — shot compiler compiled handoff) · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Shot compiler — compiled handoff for Claude review → Cursor implement

**Spec:** [`docs/plans/SHOT_COMPILER_COMPILED_HANDOFF_2026-10-02.md`](../plans/SHOT_COMPILER_COMPILED_HANDOFF_2026-10-02.md)

Fendi green-lit compiling Grok’s shot-compiler handoff with Cursor’s product/CC audit. **Keep** routing/prompt locks/phrase model; **reject** Movez / NLE-replacement noise; **merge** scripts-lane consolidation, catalogue in `providerJobs`, look presets, gate handoff, living-plate / world-around routes. **No implementation yet** — Claude reviews, then Cursor builds phases 1–2.

## Product / code audit (NO implementation) — 2026-10-02

**Full write-up:** [`docs/handoffs/CURSOR_PRODUCT_CODE_AUDIT_2026-10-02.md`](CURSOR_PRODUCT_CODE_AUDIT_2026-10-02.md) (§4b = Control Center)

Scope: clothing swap, environments, camera/angles, **AVT↔Control Center endpoints**. **Security omitted.** Audit only — no AVT product code, no CC edits.

**Baseline:** AVT `main` @ `fea6ba3`; CC read-only @ `3bfc770` (`fendi-control-center`). Complements Claude’s stall audit and lyric-lock plan.

### Verdict (short)

Scripts-lane env/camera/world work is real; CC already hosts the live catalogue (DoP, Kling, Genjutsu, Seedance 2.5, image_edit). Finish-product gap: (1) one garment policy, (2) bridge scripts → Treatment/Produce **and** expose catalogue (not only DoP) in `providerJobs`, (3) CC footguns (job-result host, cost estimates, fal-run allowlist), (4) plan B3–B6 / C2–C4.

### Top missed / harden items

| P | Item |
|---|------|
| P0 | Visualiser v2 `scenes[]` ≠ `run_broll_batch` `concepts[]` |
| P0 | ShotSpec camera fields in `ROW_UNMAPPED_FIELDS` |
| P0 | Higgsfield `apiReady: false` + Prompt Lab maps only to DoP, not catalogue |
| P0 | CC `fal-run` allowlist has no optical-flow model → Lane A stays disabled |
| P1 | CC `job-result` missing api-host fallback (status has it; result does not) |
| P1 | Cost envelopes inconsistent (DoP null; Seedance output-only; Genjutsu duration vs source) |
| P1 | AVT allowlists `image-providers-grok-edit` but CC has no such function |
| P1 | Camera still-plate vs living plates; brief-fidelity missing; foreground occluder |
| P2 | Plan remainder B3–B7 / C2–C4; dwpose not allowlisted; balance preflight |

### Do not (from this audit)

Reopen chest/sleeve paint · scale Lane A without a CC-allowlisted Fal flow model · treat Produce Video as the env lane · fold look into the realism verdict · edit CC without an explicit lock lift · implement from this handoff without Fendi choosing the garment supersede.

---

## Prior Cursor work (Lane H / reconstruct) — frozen pointer

Last reconstruct-oriented Cursor handoff content (2026-09-16) is preserved in git history for this file and in:

- [`docs/reconstruct/PLAYABLE_BROWSER_DECODE.md`](../reconstruct/PLAYABLE_BROWSER_DECODE.md)
- [`docs/reconstruct/PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md`](../reconstruct/PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md)

Live Hero Frame export E2 sample PASS (PR #133 Publish) and playable decode status are unchanged by this audit. Real-media locks remain UNCLAIMED.
