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
