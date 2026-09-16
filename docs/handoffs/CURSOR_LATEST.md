# CURSOR → repo · latest handoff

> **Convention.** This file is always Cursor's most recent handoff. Cursor overwrites it each time it lands work; dated notes live alongside in `docs/`. Claude and ChatGPT: "check Cursor's work" means read this file first, then the commits it names. Claude's side is `docs/handoffs/CLAUDE_LATEST.md`.

**Updated:** 2026-09-16 · **Canonical truth:** GitHub `main` only. Lovable deploys from `main`.

## Ready-to-test status

| Item | On `main`? | Live / redeployed? | Ready to test? |
|------|------------|--------------------|----------------|
| Stage **1m** chest CLEARED 11/11 | YES (PR #73) | YES (`9ed83c01`) | **LOCKED — do not reopen chest paint** |
| Lane B sleeve still **1c** | YES (PR #85 / #86) | YES (`fdb86b18`) | **CLEARED 6/6 — LOCKED** |
| Temporal live activation | YES (`TEMPORAL_LIVE_ACTIVATION_ARMED = true`) | YES — `temporal-propagate-proxy` OPTIONS 200 / JWT only | **YES** |
| Hero Frame `temporalTrackingEnabled` | YES (`true` + `prepareHeroFrameTemporalDispatch` → `explicitArm`) | frontend Publish | **YES** |
| Hero Frame §7 Temporal Run control | YES (PR #95, `782adac`) | frontend Publish | **YES** |
| Temporal `$0` **click** smoke | YES (PR #97) | live product UI | **SUCCESS** — 3 jobs, `paidCalls=false` |
| Lane D original-master live wiring | YES (PR #92) | n/a — in-lib | YES (library) |
| **RECONSTRUCT-1 E2E $0** | YES (PR #99, `58b8a49`) | frontend Publish | **PASS 9/9** — `paidCalls=false`, `frames=5` |
| **Lane D2 reconstruct video QA** | YES (PR #118, issue **#108**) | n/a — in-lib, no Publish | **PASS 15/15** unique-RGB 720×1280 |
| Lane C2 temporal video QA (full clip) | YES (PR #113, issue **#107**) | n/a — in-lib | **READY** — 241-frame metrics, `paidCalls=false` |
| Lane C2 chunked proxy QA + 2nd clip | this PR (#124) | n/a — in-lib | **READY** — ≤24-frame windows, seams YELLOW named |
| Lane R real-media lock placeholders | YES (PR #121, issue **#115**) | n/a — docs/tests | **UNCLAIMED** — REL-2 YELLOW; no invented PASS |

## Lane D2 — Reconstruction video QA

Work-order: GitHub **#108** (parent **#102**, umbrella **#50**, lineage **#100** / **#99**). Isolated `src/lib/reconstruct/**`. **Do not reopen chest 1m or sleeve paint.** No Lovable code edits. No eval / temporal / pipeline / export implementation.

| Field | Value |
|-------|--------|
| `paidCalls` / `grokPerFrame` / `sam3LiveFetch` | `false` |
| Native 720×1280 translating | **PASS 15/15** frames=8 |
| Full-clip 720×1280 @ 24 fps | **PASS 15/15** frames=24 |
| Live-shaped 80×128 × 5 onto 720×1280 | **PASS 15/15** (nearest-neighbor temporal upsample) |
| Unauthorized leaks | **0** |
| Lane H handoff | `reconstruct-lane-h-handoff-v1` — frame RGBA + fps/audio passthrough; **H owns MP4** |
| Escalate / still-golden reopen | **none** |

Write-up: `docs/reconstruct/VIDEO_QA.md`  
JSON: `docs/reconstruct/video-qa/preservation-720x1280.json`

**Publish ≠ edge redeploy.** No UI change → **no frontend Publish required**. No still-repair / temporal / SAM-3 redeploy.

**Not claimed:** live camera pixels of master `76fe7438`, live SAM-3 fetch, still-golden rescore, MP4 encode (Lane H).

## Lane C2 — Temporal video QA (full canonical clip)

Work-order: GitHub **#107** (sprint **#102**, umbrella **#50**). Measurement-only. **Do not reopen chest 1m or sleeve paint.** **Do not raise `maxFrames=24`.**

In-lib `propagateRepair` on a 241-frame synthetic luma stand-in of master `76fe7438` (native 1080×1920 / 59.94 fps / keyframe index 47). JSON schema `temporal-video-qa-v1`: drift / flicker / coverage / occlusion continuity + SAM-3-shaped continuity (`sam3LiveFetch=false`). Authenticated 5-frame `temporal-propagate-proxy` path stays locked (`paidCalls=false`, `explicitArm` required). 241-frame wire clip is still rejected.

Write-up: `docs/temporal/VIDEO_QA.md`  
Schema: `docs/temporal/video-qa/schema.json`  
Emit: `npx tsx scripts/temporal-video-qa.mts`

**YELLOW:** proxy `maxFrames=24` vs canonical 241; live 1080×1920 ingest; Lane E2 should consume this schema; SAM-3 is not live-fetched.

**Not claimed:** live native pixels of `76fe7438`, live SAM-3 fetch, still-golden rescore, MP4 encode, proxy cap raise.

## Lane C2 — Chunked proxy QA + second-clip portability

Work-order: GitHub **#124** (prior **#107** / PR **#113**, sprint **#102**). `src/lib/temporal/**` QA only. **Do not raise `maxFrames=24`.** No Lovable edits.

≤24-frame overlap-1 windows, seed reindexed to local 0, `explicitArm` / `paidCalls=false`, stitched globals. Second clip spec `temporal-qa-second-clip-synthetic` (72 @ 24 fps). **YELLOW:** proxy re-paints CLEARED quads each window — translating seams prove chunking is insufficient without a carried-mask wire field.

**Not claimed:** live native pixels, live SAM-3, `maxFrames` raise, Lovable proxy wire change.

## Canonical IDs (unchanged)

- project `764a63d2-93cd-44f3-905f-292f14ab2f51`
- garment `0feb028f-dc4d-45dc-82ac-e4bbd16054b0`
- original master clip `76fe7438-671d-4428-a7f6-17a45e98c16f`
- still `2aa1a44c-b24a-46bf-890f-13a6fc65b1cc`
- keyframe `v2-still-0.785`
- chest `9ed83c01` / `architecture_c_still_repair_1m` / CLEARED 11/11
- sleeve `fdb86b18` / `architecture_c_sleeve_still_1c` / CLEARED 6/6
