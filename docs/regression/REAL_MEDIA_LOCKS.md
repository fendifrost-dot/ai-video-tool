# Real-media locks — UNCLAIMED placeholders

**Lane R** issue [#115](https://github.com/fendifrost-dot/ai-video-tool/issues/115) · parent [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102)  
**Class:** A (docs/tests). `paidCalls=false`. `sam3.liveFetch=false`.  
**Taxonomy:** Real-Media-Benchmark = **0** until an owning lane fills evidence.

Machine table: [`tests/regression/real-media-locks.json`](../../tests/regression/real-media-locks.json).  
Contract: `npm run test:regression` (includes `tests/regression/real-media-locks.contract.test.ts`).

Do **not** invent PASS. Fixture click-smoke and RECONSTRUCT-1 5-frame E2E $0 are **not** these gates.

## Checklist

| Lock | Owner | Issue | Status | Verdict |
|------|-------|------:|--------|---------|
| Full-clip temporal QA (241 frames / 4.02s on `76fe7438`) | C2 | [#107](https://github.com/fendifrost-dot/ai-video-tool/issues/107) | **UNCLAIMED** | — |
| Original-master preservation video asserts (720×1280 / full clip) | D2 | [#108](https://github.com/fendifrost-dot/ai-video-tool/issues/108) | **UNCLAIMED** | — |
| Playable MP4 provenance to `76fe7438` | H | [#111](https://github.com/fendifrost-dot/ai-video-tool/issues/111) | **UNCLAIMED** | — |
| SAM-3 consume evidence (`liveFetch=false`, Stage 1h / caller-supplied) | D2 (H consumes) | [#108](https://github.com/fendifrost-dot/ai-video-tool/issues/108) / [#111](https://github.com/fendifrost-dot/ai-video-tool/issues/111) | **UNCLAIMED** | — |
| E2 video QA JSON (`lane-e2-video-qa-v1`) vs real reconstructed MP4 | E2 | [#105](https://github.com/fendifrost-dot/ai-video-tool/issues/105) | **UNCLAIMED** | — |

## What already exists (not these locks)

| Evidence | What it is | What it is not |
|----------|------------|----------------|
| Temporal click smoke #96 | Authenticated `paidCalls=false` dispatch, **5-frame synthetic luma** | Full-clip temporal QA |
| RECONSTRUCT-1 #100 | E2E $0 **PASS 9/9**, `frames=5`, unique-RGB stand-in | 720×1280 original-master video / MP4 |
| Chest 1m / sleeve 1c goldens | Still CLEARED 11/11 and 6/6 | Video-level QA |
| PLAYABLE live export 2026-09-16 ~1:19 AM CT | Hero Frame **Export playable reconstruct $0** after PR #129 Publish: compose SUCCESS (8-frame window) + E2 **INCOMPLETE 2/9** `fail=0` `mp4=produced` `stillGoldensReopened=false`. Gate MP4 remains committed `playable-76fe7438/reconstructed.mp4` (`sha256` `71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b`) | Decoded-frame E2 PASS (`frames=0` at that click); live 241-frame/1080 ingest; **CLEARED real-media gate final** — locks stay **UNCLAIMED** |
| PLAYABLE live export 2026-09-16 ~2:05 AM CT | Hero Frame **Export playable reconstruct $0** after PR #133 merge `7dc04ad` + Lovable frontend Publish: compose SUCCESS + E2 **PASS 3/9** `fail=0` `skip=6` `frames=8` `mp4=produced` `stillGoldensReopened=false` `browserDecode=webcodecs` liveSample maxFrames=8 of source=72. Gate MP4 sha256 **unchanged** `71f54599be288a7359b125f8f3acec14f3ec4d7b444bc79500712fec99d6029b` | Live click of the **72-frame code default** (needs later Publish); live 241-frame/1080 ingest; 2nd-clip live Export; raising edge `maxFrames`; **CLEARED real-media gate final** — locks below stay **UNCLAIMED** |

## Live observation that does **not** claim a lock

**[OBSERVED]** 2026-09-16 ~1:19 AM America/Chicago (~06:19 UTC): authenticated click after #129 merge `f5f7d8a` + Lovable frontend Publish. Verbatim toast in [`docs/reconstruct/PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md`](../reconstruct/PLAYABLE_EXPORT_LIVE_INCOMPLETE_2026-09-16.md). Encode-first INCOMPLETE (`frames=0`).

**[OBSERVED]** 2026-09-16 ~2:05 AM America/Chicago (~07:05 UTC): authenticated click after #133 merge `7dc04ad` + Lovable frontend Publish. Verbatim toast in [`docs/reconstruct/PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md`](../reconstruct/PLAYABLE_EXPORT_LIVE_PASS_2026-09-16.md). Live WebCodecs **sample** of the gate MP4 → E2 **PASS** `frames=8` `fail=0`. That is **not** a full-clip 72-frame score and **not** a CLEARED real-media gate.

`tests/regression/real-media-locks.json` is **unchanged** (`status: UNCLAIMED`, `verdict: null`). Do not invent PASS.

## How an owning lane claims

1. Land evidence on **that lane's** surface (JSON + docs). Do not ask Lane R to mark PASS.
2. Edit `tests/regression/real-media-locks.json`: `status: "CLAIMED"`, `verdict: PASS|FAIL|INCOMPLETE`, `evidence.path` + `evidence.issue` + `evidence.paidCalls: false`.
3. UNCLAIMED rows must keep `verdict: null`. The contract test fails if anyone writes PASS onto an UNCLAIMED row.

Lane R will not implement C2/D2/E2/H/G2/F2 product modules to fill these.

## Related YELLOW (docs only)

Lane C notes-copy vs product flag: [`OWNERSHIP.md`](OWNERSHIP.md) + RISK_REGISTER **REL-2**. Do not edit `src/lib/temporal/livePrep.ts` from Lane R.
