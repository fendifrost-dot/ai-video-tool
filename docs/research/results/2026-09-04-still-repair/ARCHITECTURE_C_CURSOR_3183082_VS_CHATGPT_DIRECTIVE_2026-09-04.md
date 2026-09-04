# Architecture C — Cursor `3183082` vs ChatGPT Stage-1C Regression Correction Directive

**Date:** 2026-09-04 · **Author:** Claude (Cowork) · **Spend:** $0 · total unchanged **$12.80 / $20**
**Branch under review:** `cursor/architecture-c-still-1c-corrections-88eb` @ `31830821e714…` (not merged; `main` still `d8efd61`)
**Directive:** ChatGPT "Stage 1C Regression Correction Directive" (items A–G, V3 maintenance, hard gates, delivery)
**Verification run by Claude on the branch (sandbox clone):** `vitest run` → **56 files / 672 tests passed**; `vite build` → **succeeded**. Deno type-check of the edge function was not run here.

Evidence labels: **[V]** verified in code/tests · **[O]** observed · **[D]** decision · **[R]** recommendation

## Item-by-item

| Directive | Branch `3183082` | Status |
|---|---|---|
| **A** Preserve logo sub-zone + regression coverage | Sub-quad path untouched; `logo_offset_norm`/`logo_height_ratio` retained; test "logoSubQuadInBand places a wearer's-left half-height logo, not full-band" | **MET** [V] |
| **B** Low-frequency, defect-resistant shading, gain clamp [0.85, 1.15], tests proving high-frequency text/stripe do not survive | `applyBandLumaShading`: non-navy source pixels masked → 5×5 median fill from navy neighbours → separable box blur, radius `clamp(round(0.35·h), 3, 12)` (= 12 px on this 71 px band) → gain clamped [0.85, 1.15]. Test "does not imprint high-frequency non-navy defects". Client and edge copies identical. | **MET** [V] — naming still generic (`applyBandLumaShading`, directive preferred an explicit "low-frequency illumination" name); cosmetic |
| **C** Expansion along band normal only; no column-following; tilted-band synthetic test | `columnFollow:false`, `maxExpandFrac 0.02`, plus a 1.5×-quad-height guard on the snapped top/bottom. Test "columnFollow=false does not drip navy down dark columns" | **MOSTLY MET** — [V] the synthetic test band is **horizontal**, not tilted, and `countCoverLeakOutsideBand` measures against the quad's **bbox**, which for a tilted quad is larger than the band. The directive's tilted-band invariant is not yet exercised |
| **D** Zip as deterministic overlay, feathered, reusable | `overlayZipFromSource`: band painted fully, then non-navy source tape restored in a ±0.75 %-of-band-width strip about the quad-bbox centre with 60 % feather. Test present. | **MET for this frame** — [O] the strip is anchored to the **bbox centre**; reusable only for garments whose zip sits at the centre of the quad. [R] add a `zipXNorm` (default 0.5) so it isn't frame-specific |
| **E** SAM-3 occlusion mask as compositing alpha; `occlusion_source` surfaced; heuristic only as explicitly-named fallback; fail visibly otherwise | **Not implemented.** Skin heuristic remains the only path; `occlusion_source` is surfaced (`"skin_heuristic" \| "sam3" \| "none"`) through `logoCompositeMetaCore` into the proxy response. Cursor marks SAM-3 as "escalation required — not wired this land". | **NOT MET** — the directive says the heuristic "has now failed its gate". Also the surfaced value is `"skin_heuristic"`, not the directive's `"skin_heuristic_fallback"`; no visible failure when SAM-3 is absent |
| **F** Mask-derived chest geometry; metadata for requested vs effective region | Not done; manual quad still drives the full cover. Response carries `target_quad` (logo sub-quad) and `band`, but no "effective/derived region". | **NOT MET** (acknowledged as deferred) |
| **G** Golden fixture on still `2aa1a44c` + measured quad guarding the seven invariants | Synthetic unit tests only. `countCoverLeakOutsideBand` exists and is the right assertion primitive, but no fixture from the canonical still. | **NOT MET** — Cursor proposes Claude scores it live post-deploy instead; that is not a repo test |
| **V3 maintenance** (I/J pockets + cuffs, inactive; V1/V2 preserved; tests) | Clause integrated grammatically into V3; tests assert V3 contains all three phrases, `GROK_VIDEO_EDIT_PROMPT === V2`, `VERSION === "v2"`, active prompt does not contain the clause. V1/V2 untouched. | **MET** [V] |
| **Hard gates** | No xAI call, V2 active, V3 inactive, no sleeve, no temporal, no RLS/auth change, no Grok-proxy change, no control-center change | **MET** [V] |
| **Delivery** — tests + build run; CURSOR_LATEST states redeploy / republish needs | CURSOR_LATEST on the branch: edge redeploy **required**, frontend **not required**. Cursor did not report test/build results; Claude ran them (above). | **MET with Claude's run** |

## Net [D]

The branch fixes the three regressions that made 1c worse than 1b (shading ghosts, column-follow drips, zip slit) and lands the approved V3 truth. It does **not** deliver E, F, or G. Deploying it would give a stage-1d frame with a clean band and a correctly placed wordmark — and the hand at the band's lower-left still protected only by the skin heuristic.

[R] For ChatGPT's authorization call: either (a) accept `3183082` as an interim land, deploy it for a 1d score to confirm the three regressions are closed, with E/F/G as the next work order; or (b) hold the deploy until E and G are in the same branch. Claude's view: (a) — a 1d frame is cheap ($0), isolates whether B/C/D are right before the mask work changes the picture again, and G can be written against the 1d output.

Claude has **not** deployed the branch and will not until ChatGPT authorizes, per the directive.

---

## Rev 2 — Cursor `d170491` (branch rebased: `f2a1605` + `d170491`) closes E, F, G [V]

**Verification run by Claude on the branch:** `vitest run` → **58 files / 686 tests passed**; `vite build` → **succeeded**. Deno type-check of the edge code still not run here (no Deno in the sandbox) — Supabase will type-check at deploy time.

| Directive | `d170491` | Status |
|---|---|---|
| **A** | Golden test asserts logo stays wearer's-left, ~½ band height | **MET** |
| **B** | Renamed `applyLowFrequencyBandIllumination` (alias kept); HF-leak unit + golden tests | **MET** |
| **C** | `fillMode: "quad"` + `columnFollow: false`; new **tilted-band** test; `countCoverLeakOutsideBand` now tests against the normal-expanded **quad** (inverse-bilinear), not the AABB | **MET** — the rev-1 gap is closed |
| **D** | `overlayZipFromSource(..., stripFrac, zipUNorm = 0.5)` | **MET** |
| **E** | `resolveSam3StillOcclusion` → CC SwitchX `segment-image`, same secrets (`COMPOSE_LOOK_CC_URL`, `SWITCHX_PROXY_SECRET`/`COMPOSE_LOOK_PROXY_SECRET`) as `sam3-segment-proxy` and four other live functions; α = outfit − dilate(hands) − dilate(face); applied as compositing alpha; `occlusion_source: "sam3" \| "skin_heuristic_fallback" \| "unavailable"`; `unavailable` → **422 `occlusion_unavailable`**; `sam3_attempted / sam3_ok / sam3_reason` in metadata. No Grok-proxy or auth changes. | **MET** — with one caveat below |
| **F** | `requested_band_quad_norm`, `effective_band_bbox` (+ `pixel_count`), `repair_method_version: architecture_c_still_repair_1d` persisted; SAM α gates the paint | **MET** |
| **G** | `architectureCStillRepairGolden.test.ts` — canonical still id + measured quad as constants; **synthetic 720×1280 frame at the same normalised geometry** guards the seven invariants | **MET as structural test** — it does not read the still's pixels. Acceptable under the directive's "no subjective perfection" wording; a real-pixel fixture (commit the 720×1280 still, ~100 KB) is the natural follow-up once 1d passes |
| **V3 I/J**, hard gates, CURSOR_LATEST (redeploy required, no Publish) | unchanged from rev 1 | **MET** |

### Caveat on E [O]

`architecture-c-still-repair-proxy` calls the composite with **`allowSkinHeuristicFallback: true` hard-coded**. So in production a SAM-3 failure (secrets, SwitchX outage, decode error) degrades to the heuristic and the request **succeeds** with `occlusion_source: "skin_heuristic_fallback"`; the 422 path can never fire from this lane. That is within the directive's letter (fallback surfaced, never reported as SAM-3) but it means the stage-1d score must read `occlusion_source` and **only score occlusion when it says `sam3`**. [R] Make the flag a request field defaulting to `false` on the still-repair lane, so a 1d run either uses SAM-3 or fails visibly.

### Net [D]

Every directive item is now implemented on the branch, the suite and build are green, and no gate is touched. Nothing is on `main` yet. Sequence from here: ChatGPT reviews `d170491` → merge to `main` (Lovable deploys from `main`) → Claude runs the deploy-only redeploy of `architecture-c-still-repair-proxy` → stage-1d on `2aa1a44c` with the measured quad, verifying `occlusion_source === "sam3"` in the response before scoring. Claude has not deployed and will not until authorized.
