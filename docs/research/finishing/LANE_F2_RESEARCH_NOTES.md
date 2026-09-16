# Lane F2 — finishing-path research notes

**Lane F2 · 2026-09-16 · $0 · no paid Astra · no live Premiere**  
**Work-order:** [#103](https://github.com/fendifrost-dot/ai-video-tool/issues/103) · **Sprint:** [#102](https://github.com/fendifrost-dot/ai-video-tool/issues/102)

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

Companion contract: [RECONSTRUCTED_MASTER_HANDOFF.md](./RECONSTRUCTED_MASTER_HANDOFF.md).  
Lane F baseline (do not rebuild): [ASTRA_PREMIERE_FINISHING_ARCHITECTURE.md](./ASTRA_PREMIERE_FINISHING_ARCHITECTURE.md).

---

## What changed since Lane F (#57)

Lane F answered: *how does an approved AVT **cut** leave the app and get finished in Premiere?*

Sprint 2 Lane F2 answers: *how does a Lane H **reconstructed master** (MP4 + provenance) leave AVT into that same finishing world **without blocking E2E**?*

**[VERIFIED]** Reconstruct E2E PASS 9/9 does not produce `master.mp4` today. Eval `notClaimed` includes `"MP4 encode of clip 76fe7438"` (`src/lib/eval/reconstructVideoEvaluator.ts`). Claiming a Premiere-ready file from that click would be a false wall.

**[DECISION]** Research continues independently of Lane H encode work. The sidecar is valid at `encode_status: "not_claimed"`. Premiere import is a later, optional step.

---

## Path comparison (finishing hosts)

### 1. Premiere Pro + UXP (preferred)

**[VERIFIED]** AVT already ships `premiere_ready/timeline.fcpxml` + relative `approved_clips/` via `src/lib/export/buildPackage.ts`. Premiere UXP stub (`src/lib/automation/premiereUxp.ts`) is still `connect` + `importFcpxml` only — **not implemented**.

**[DECISION]** Reconstructed master is **replacement media**, not a second FCPXML. Ingest with existing `import_media_folder` (or human File → Import). Relink the shot whose `asset_id` is `master_clip_asset_id`.

**[HYPOTHESIS]** Premiere’s media relink UI can attach `master.mp4` to an existing FCPXML clip if filenames/timecode match. Untested on Fendi’s build; a live probe is RED-F3 (panel) or ordinary human editorial (not this lane’s spend).

**[RECOMMENDATION]** Do not wait on a UXP panel to close F2. Human import on a machine Fendi already uses is the production path the moment Lane H encodes.

### 2. DaVinci Resolve (parallel, no harness)

**[VERIFIED]** Export already has `resolve_ready/` as a sibling of `premiere_ready/`. Lane F decided not to build a Resolve harness.

**[DECISION]** Same sidecar, different host string (`"resolve"`). F2 still does not automate Resolve. Color-first finishing stays human.

### 3. Adobe Media Encoder, local preset

**[DECISION]** `queue_ame_export` remains UXP-allowlisted with a **locked local `.epr`**. Allowed only after `encode_status === "encoded"` *if* the export input is the reconstructed master. Cloud AME / Frame.io = RED-F7.

**[HYPOTHESIS]** AME is the right *wrap* (H.264/H.265 delivery) after editorial polish. It is the wrong *reconstruct* tool.

### 4. FFmpeg / in-app MP4 (not F2)

**[VERIFIED]** `docs/timeline_assembly.md` describes in-app final MP4 as designed, not scheduled. Reconstruct E2E currently keeps frames in memory.

**[DECISION]** Encoding the reconstructed master is **Lane H** (artifact owner) or a later export adapter. F2 consumes a file path. Stealing ffmpeg into `src/lib/automation/finishing*` would block or duplicate E2E and violate ownership.

### 5. Remotion

**[VERIFIED]** Remotion scaffold is a **draft preview** (`src/lib/export/remotion/`), not finishing. Lane F already excluded it as a master path.

**[DECISION]** Unchanged. Do not route reconstructed masters through Remotion to look “finished.”

### 6. GPT-6 Astra computer-use (disabled)

**[OBSERVED]** Public Sep 2026 reports still describe Astra as a desktop operator on Premiere / AE, not a Premiere API ([architecture doc](./ASTRA_PREMIERE_FINISHING_ARCHITECTURE.md)).

**[DECISION]** Access via Fendi’s OpenAI API remains **research-only**. This lane did **not** call it (`paidCalls=false`). Harness stays:

```
astra.enabled = false
spend.max_usd = 0
max_astra_steps = 0
```

Astra is **not** on the reconstructed-master critical path. Visual polish (`astra_visual_adjust`) stays RED-F1 / RED-F2 / RED-F10. Using Astra to import FCPXML or “build the sequence from the provenance JSON” is a design failure.

### 7. In-NLE generative plugins

**[OBSERVED]** Runway-in-Premiere / Higgsfield-in-AE / Firefly generative extend are paid restyle surfaces.

**[DECISION]** Forbidden for reconstructed masters. They would undo original-pixel preservation (`original_pixels_preserved_where_unauthorized`). RED-F4/F5/F6.

---

## Recommended production path (after Lane H encodes)

```
Lane H reconstructed_master/master.mp4 + provenance.json
        │
        │  [optional] existing ZIP: premiere_ready/ + approved_clips/
        ▼
Human or UXP: import FCPXML (cut) + import reconstructed_master/ (replacement clip)
        │
        ▼
Local AME / human export → premiere_export asset + finishing_sidecar.json
```

No Astra. No new bucket. No edge proxy. No Pipeline OS edits from this lane.

**Until Lane H encodes:** provenance-only sidecar + unit tests. E2E continues.

---

## What we did not do (on purpose)

| Skipped | Why |
|---------|-----|
| Paid Astra session | `paidCalls=false`; RED-F1 |
| Live Premiere / UXP install | RED-F3; not needed to define the contract |
| ffmpeg mux of `76fe7438` | Lane H ownership; current E2E does not claim MP4 |
| Pipeline OS `review_export` bind | Lane G surface |
| Eval-core changes | Lane E surface |
| New recipe ops / schema v2 | `import_media_folder` already covers ingest |

---

## Evidence used (no recall-as-certification)

| Claim | Label | Source |
|-------|-------|--------|
| Reconstruct E2E PASS 9/9, no MP4 claimed | **VERIFIED** | `docs/reconstruct/E2E_LIVE_SUCCESS_2026-09-15.md`, `docs/reconstruct/live-smoke/e2e-pass.json` |
| Eval lists MP4 encode as not claimed | **VERIFIED** | `src/lib/eval/reconstructVideoEvaluator.ts` `NOT_CLAIMED` |
| Export ZIP already Premiere-ready | **VERIFIED** | `src/lib/export/buildPackage.ts` |
| Pipeline kind `original_master_composite` exists | **VERIFIED** | `src/lib/pipeline/types.ts` (not edited) |
| Astra has no stable Premiere API | **HYPOTHESIS** | public computer-use reports; no live probe this lane |
| Relink-by-asset-id works on Fendi’s Premiere | **HYPOTHESIS** | needs human editorial or RED-F3 |

---

## Spend

**$0.** No computer-use, no Adobe plugin, no paid API, no media egress.
