# Architecture C — decision (2026-08-28)

**Experiment:** `grok-recap-2026-08` + product lane `grok-video-edit-proxy`  
**Cumulative Grok spend (research):** **$0.32** / $6.00 ceiling  
**Tests A3 / B1 (billed):** Not executed this session — cloud JWT stale; see below.

Evidence labels: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**

---

## Verdict: **GO WITH DETERMINISTIC REPAIR**

**Confidence:** **Medium-high** for a **product test**; **low** for autonomous full-length production without compositing.

### Why not plain GO

**[OBSERVED]** P2_corrected visual scorecard: 20/30 on axes 1–10. Garment direction correct (navy track + white sleeve stripes) but **logo/typography illegible at 720p** (axis 9 = 1). Collar/zip/construction approximate, not product-pinned.

**[VERIFIED]** Output is 720×1280 / ~3.7s vs 1080×1920 / 4.02s source — structural downscale per recap spec.

### Why not NO-GO

**[VERIFIED]** xAI accepts combined `video` + `reference_images` on `/v1/videos/edits` (P2_corrected, request `ed27462b-…`).

**[VERIFIED]** **MAJOR FAILURE (edit vs regenerate): no** — identity, pose, closet/background preserved vs source frame at t≈2.235s.

**[DECISION]** Typography/logo belongs in the **deterministic brand layer**, not generative Grok — consistent with project policy and user direction.

**[RECOMMENDATION]** SAM-3 garment-region isolation + composite onto **original master** outside the garment mask is the required production shape; Grok supplies motion + coarse garment appearance inside the mask only.

---

## Evidence table

| Claim | Label | Source |
|-------|-------|--------|
| API accepts video + reference_images (correct `video.url` schema) | VERIFIED | `P2_corrected_edits_video_plus_reference_images.json` |
| Generation completes; output persisted | VERIFIED | `project-exports/research/grok-recap-2026-08/probe-ed27462b-….mp4` |
| Edit character (not full regen) | VERIFIED | `P2_corrected_visual_scorecard.json` axis 11 |
| Identity / background preservation strong | OBSERVED | scorecard axes 1, 6 |
| Garment micro-detail production-ready | OBSERVED **no** | scorecard axes 8–9 |
| Long-prompt A3 vs terse P2 | **Not run** | JWT blocker |
| Reference-to-video B1 | **Not run** | JWT blocker; not required for Architecture C gate |

---

## Product test (shipped this branch)

| Piece | Path |
|-------|------|
| Edge function | `supabase/functions/grok-video-edit-proxy` (user JWT, corrected payload) |
| Client | `src/lib/queries/grokVideoEdit.ts` |
| UI | `src/components/video/GrokVideoEditRunner.tsx` on Hero Frame §6 |
| Review | Inserts `edited_clip` → `/projects/$id/review` |

**Deploy:** GitHub `main` ingest + Lovable **Edge Functions → redeploy `grok-video-edit-proxy` only**.

**Manual product test:** YSL project → Hero Frame → Architecture C panel → benchmark clip + SL track jacket → Run → Review board.

---

## Deferred (not blockers for product test)

- SAM-3 video mask + master compositing (Class C)
- `edit_video` mode fix in research proxy (`video_url` → `video` object) — product proxy uses correct shape
- B1 ref2video benchmark (alternative path, not Architecture C)
