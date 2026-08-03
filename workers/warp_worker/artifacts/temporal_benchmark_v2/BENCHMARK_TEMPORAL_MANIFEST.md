# Canonical Temporal Benchmark — `avt_wardrobe_temporal` v2.0.0

Supersedes benchmark_frozen_2026-08-01 (single-frame; kept immutable). **Complete: False**.

Every experiment from here uses exactly these assets. Version bumps only on regeneration.

| component | status | path | detail |
|---|---|---|---|
| source_clip | ✅ | `/Volumes/T7/AVT VIDEO CLIPS/benchmark_frozen_2026-08-01/benchmark_1080p_clip.mp4` | 1080p H.264 benchmark clip |
| source_frames | ✅ | `/Volumes/T7/AVT VIDEO CLIPS/benchmark/wardrobe-swap-v1/frames` | 16-bit near-lossless source frame sequence |
| kolors_sequence | ⛔ PENDING | `benchmark_temporal_v2/kolors_seq/` | per-frame Kolors VTON output for the whole clip |
| grok_anchors | ✅ | `/Volumes/T7/AVT VIDEO CLIPS/benchmark_frozen_2026-08-01/grok_anchor_frame_00134.jpg` | approved Grok garment-detail anchor(s) (frame 134 frozen) |
| sam_mask_sequence | ⛔ PENDING | `benchmark_temporal_v2/sam_seq/` | per-frame per-region SAM-3 masks for the whole clip |
| forward_flow | ✅ | `/Volumes/T7/AVT VIDEO CLIPS/benchmark_temporal_v2/flow` | per-step forward dense flow (float32) |
| backward_flow | ✅ | `/Volumes/T7/AVT VIDEO CLIPS/benchmark_temporal_v2/flow` | per-step backward dense flow (float32) |
| confidence_maps | ✅ | `/Volumes/T7/AVT VIDEO CLIPS/benchmark_temporal_v2/flow` | per-step fwd/bwd-consistency confidence + occlusion |
| propagation_window_distribution | ✅ | `/Volumes/T7/AVT VIDEO CLIPS/benchmark_temporal_v2/analysis/propagation_window.json` | per-anchor reach + shot distribution |
| adaptive_anchor_plan | ✅ | `/Volumes/T7/AVT VIDEO CLIPS/benchmark_temporal_v2/analysis/adaptive_anchor_plan.json` | adaptive placement (replaces fixed cadence) |
| immutable_single_frame_frozen_set_v1 | ✅ | `/Volumes/T7/AVT VIDEO CLIPS/benchmark_frozen_2026-08-01` | superseded but kept immutable |

## PENDING components — runbook (not fabricated)

### kolors_sequence
Generate per-frame Kolors: for each source frame, call the AVT edge fn wardrobe-video-swap-proxy (Phase-2b per-frame path) with FRAME_SWAP_FAL_MODEL=fal-ai/kling/v1-5/kolors-virtual-try-on via CC switchx-restyle fal-run, transferMode jacket_only, the wardrobe feature = the SL bomber. Needs: authenticated Supabase user (bearer), benchmark clip uploaded as a project_asset, CC allowlist + SWITCHX_PROXY_SECRET, Fal account not blocked. Output = project-exports swapped frames -> download to benchmark_temporal_v2/kolors_seq/frame_%05d.png. NOT runnable from the local worker (AVT holds no FAL_KEY; Fal is reached only via CC/edge).

### sam_mask_sequence
Generate SAM-3 masks: call sam3-segment-proxy (fal-ai/sam-3/video) on the benchmark clip with prompts for each region (torso, left_sleeve, right_sleeve, collar, stripe_logo, hands_arms). Needs the same authenticated edge/CC/Fal path. Output = per-frame per-region masks -> benchmark_temporal_v2/sam_seq/<region>/frame_%05d.png. NOT runnable from the local worker.

## Checksums (analysis + manifest layer)

Flow artifacts have their own `SHA256SUMS.txt` (956 files). Aggregate here:

- `flow_manifest.json` — 71d58aef49806e92…
- `SHA256SUMS.txt` — 477233b327ae6c23…
- `analysis/propagation_window.json` — 989891fe240a871d…
- `analysis/adaptive_anchor_plan.json` — 176675bca86be0b6…