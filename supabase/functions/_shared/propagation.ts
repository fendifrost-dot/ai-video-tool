// Lane A — propagation engine abstraction (LOCKED architecture §3, step 2).
//
// Pure helpers, no Deno / DOM globals (vitest-testable).
//
// THE HONEST BOUNDARY. The locked lane PROPAGATES an approved Grok keyframe's
// garment across intermediate frames — warping REAL solved pixels via optical
// flow (RAFT / EbSynth-style) or a video-native model — rather than re-sampling
// each frame independently (that is Phase 2b, the boiling baseline). AVT's edge
// runtime is Deno serverless: it CANNOT run RAFT / EbSynth / FFmpeg optical flow
// locally. So the propagation step, like every other heavy compute in AVT
// (Grok, VTON, ffmpeg-compose), must call an EXTERNAL model.
//
// This module makes the propagation engine ENV-SELECTABLE and REVERSIBLE — the
// same pattern as FRAME_SWAP_FAL_MODEL / VIDEO_COMPOSE_FAL_MODEL. It does NOT
// invent a flow model. When no real engine is configured, the pipeline BLOCKS
// with a precise "what this needs" error instead of faking temporal
// consistency. See the deploy report + README for exactly what to wire.
//
// CONFIRMED 2026-07-28 (docs/LANE_C_LUCY_VIDEO_VTON.md JOB 2): Fal hosts NO dense
// optical-flow / warp / EbSynth-style keyframe-propagation endpoint with usable
// outputs. RIFE/FILM/AMT are frame INTERPOLATION and expose only frames, never a
// flow field; Wan-VACE / Wan-Motion / Kling motion-control are generative
// re-synthesis (pose/depth control, not pixel-warp). So the "fal-flow" mode has
// NO real Fal model to point PROPAGATION_FAL_MODEL at today — the propagation
// worker must be CUSTOM (RAFT/GMFlow + warp, or EbSynth) OUTSIDE Fal. The
// "disabled" block below is therefore the honest steady state on Fal, not a gap
// awaiting a model id. (fal-ai/sam-3/video masks can still feed a region-locked
// composite; RIFE can only smooth fps AFTER a real propagation pass.)
//
// Modes:
//   "fal-flow"        — Fal-hosted optical-flow / warp / EbSynth-equivalent model
//                       via CC `fal-run` (PROPAGATION_FAL_MODEL, allowlisted on
//                       CC). THE INTENDED LANE-A ENGINE once such a model is
//                       wired. Shapes: original frame + bracketing keyframe(s).
//   "fal-v2v"         — video-native VTON / video-to-video (Lane B) reached
//                       through the same fal-run transport, kept here so the
//                       benchmark (§5) can swap engines without new plumbing.
//   "nearest-keyframe"— DIAGNOSTIC ONLY. Emits the nearest approved keyframe for
//                       each intermediate frame — NO warp, NO temporal solve. It
//                       exists to exercise the full status/reassembly plumbing
//                       end-to-end before a real flow model exists. It WILL
//                       visibly "pop" at keyframe boundaries; that pop is the
//                       diagnostic, never a shippable result.
//   "disabled"        — no engine configured. The propagate step blocks and
//                       reports what it needs. Default when nothing is set.

export type PropagationMode = "fal-flow" | "fal-v2v" | "nearest-keyframe" | "disabled";

export const PROPAGATION_MODES: readonly PropagationMode[] = [
  "fal-flow",
  "fal-v2v",
  "nearest-keyframe",
  "disabled",
] as const;

export interface PropagationEngine {
  mode: PropagationMode;
  /** Fal model id for the fal-* modes (must be in CC's fal-run allowlist). */
  falModel?: string | null;
}

/** Minimal env accessor so this stays pure/testable (inject Deno.env.get). */
export type EnvGet = (key: string) => string | undefined;

/**
 * Resolve the propagation engine from env — reversible: unset everything and it
 * returns { mode: "disabled" }, i.e. no behaviour change vs. before Lane A.
 *
 *   WARDROBE_PROP_ENGINE  — one of PROPAGATION_MODES. If unset, defaults to
 *                           "fal-flow" when PROPAGATION_FAL_MODEL is present,
 *                           else "disabled".
 *   PROPAGATION_FAL_MODEL — Fal model id for the fal-* modes.
 */
export function resolvePropagationEngine(env: EnvGet): PropagationEngine {
  const falModel = env("PROPAGATION_FAL_MODEL")?.trim() || null;
  const raw = env("WARDROBE_PROP_ENGINE")?.trim() as PropagationMode | undefined;
  let mode: PropagationMode;
  if (raw && (PROPAGATION_MODES as readonly string[]).includes(raw)) {
    mode = raw;
  } else {
    mode = falModel ? "fal-flow" : "disabled";
  }
  return { mode, falModel };
}

/** Does this engine actually produce propagated output (vs. block)? */
export function isEngineActive(engine: PropagationEngine): boolean {
  if (engine.mode === "disabled") return false;
  if (engine.mode === "fal-flow" || engine.mode === "fal-v2v") return !!engine.falModel;
  return true; // nearest-keyframe needs no model
}

/** Fal-backed modes that require an external model id + CC allowlist entry. */
export function engineNeedsFalModel(mode: PropagationMode): boolean {
  return mode === "fal-flow" || mode === "fal-v2v";
}

/**
 * Precise, actionable reason the engine cannot run — null when it can. Surfaced
 * to the caller so a blocked job says exactly what to wire, never fakes output.
 */
export function engineBlockReason(engine: PropagationEngine): string | null {
  if (engine.mode === "disabled") {
    return (
      "propagation_engine_disabled: set WARDROBE_PROP_ENGINE + PROPAGATION_FAL_MODEL " +
      "(a Fal optical-flow/warp/EbSynth-equivalent model, allowlisted on CC fal-run)"
    );
  }
  if (engineNeedsFalModel(engine.mode) && !engine.falModel) {
    return (
      `propagation_engine_${engine.mode}_missing_model: set PROPAGATION_FAL_MODEL ` +
      "to a Fal model id (must be in CC's fal-run allowlist)"
    );
  }
  return null;
}

export interface PropagationArgs {
  /** The ORIGINAL footage frame being dressed (signed https URL). */
  originalFrameUrl: string;
  /** Approved keyframe at or before this frame — the primary flow source. */
  prevKeyframeUrl: string;
  /** Approved keyframe at or after this frame (optional; enables 2-sided warp). */
  nextKeyframeUrl?: string | null;
  /** Blend position 0..1 within [prev, next] (from keyframePlan). */
  t: number;
  garmentDescription?: string;
  engine: PropagationEngine;
}

/**
 * Build the CC POST body for propagating one intermediate frame.
 *
 * fal-flow / fal-v2v → a `fal-run` on the configured model. The input carries
 * the original frame plus the bracketing approved keyframe(s) and the blend
 * weight; the exact key names a real model expects will need one adjustment
 * when the model is chosen (same caveat as buildFrameSwapBody's fal-run path).
 * Non-engine modes (nearest-keyframe / disabled) do not call CC — the caller
 * handles them directly — so this throws for them.
 */
export function buildPropagationBody(args: PropagationArgs): Record<string, unknown> {
  const { originalFrameUrl, prevKeyframeUrl, nextKeyframeUrl, t, garmentDescription, engine } =
    args;
  if (!engineNeedsFalModel(engine.mode)) {
    throw new Error(`buildPropagationBody: mode ${engine.mode} does not call an engine`);
  }
  const model = engine.falModel?.trim();
  if (!model) throw new Error("buildPropagationBody: missing PROPAGATION_FAL_MODEL");
  if (!originalFrameUrl || !prevKeyframeUrl) {
    throw new Error("buildPropagationBody: missing original frame or previous keyframe URL");
  }
  return {
    action: "fal-run",
    model,
    input: {
      // Original footage frame — flow target / composite base.
      frame_url: originalFrameUrl,
      // Approved keyframe(s) whose garment pixels are propagated.
      source_keyframe_url: prevKeyframeUrl,
      target_keyframe_url: nextKeyframeUrl ?? prevKeyframeUrl,
      blend: Math.min(1, Math.max(0, t)),
      description: garmentDescription ?? "",
    },
  };
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && v.trim().startsWith("https://");
}

/** Pull the propagated-image URL from an engine result, tolerating shape variance. */
export function extractPropagatedImageUrl(result: Record<string, unknown>): string | null {
  const image = result?.image as { url?: string } | undefined;
  if (isHttpsUrl(image?.url)) return image!.url!.trim();
  if (isHttpsUrl(result?.image_url)) return String(result.image_url).trim();
  if (isHttpsUrl((result as { warped_url?: string })?.warped_url)) {
    return String((result as { warped_url?: string }).warped_url).trim();
  }
  const images = result?.images as Array<{ url?: string }> | undefined;
  if (Array.isArray(images) && isHttpsUrl(images[0]?.url)) return images[0]!.url!.trim();
  if (isHttpsUrl(result?.url)) return String(result.url).trim();
  return null;
}

/** Zero-padded, ext-aware name (§6 #3: record the TRUE encoding, not always .jpg). */
export function propagatedFrameName(index: number, ext: "jpg" | "png" | "webp" = "jpg"): string {
  return `${String(index).padStart(6, "0")}.${ext}`;
}

/** Storage prefix (within project-exports) a propagation session writes into. */
export function propagatedFramePrefix(userId: string, assetId: string, sessionId: string): string {
  return `${userId}/${assetId}/propagated/${sessionId}/`;
}
