// Lane C — Decart Lucy video-native video-to-video (BATCH) helpers.
//
// Pure, no Deno / DOM globals (vitest-testable like the other _shared modules).
//
// PROVENANCE (researched 2026-07-28, from fal.ai's machine-readable OpenAPI queue
// schemas, not marketing pages). Decart ships TWO distinct Lucy families on Fal:
//
//   BATCH (this module) — standard queue.fal.run submit/poll, video-file→video-file:
//     decart/lucy-edit/pro | dev | fast, decart/lucy-restyle
//     Input:  { prompt, video_url, resolution?, seed?, sync_mode?, enhance_prompt? }
//     Output: { video: { url, content_type, file_name, file_size } }
//     TEMPORALLY NATIVE (one clip in, one clip out) → no per-frame boiling by
//     construction. Reachable through the CC `fal-run` submit/poll transport AVT
//     already speaks (same as make-scrub-proxy-proxy / VIDEO_COMPOSE_FAL_MODEL).
//
//   REALTIME (NOT this module — see docs/LANE_C_LUCY_VIDEO_VTON.md) —
//     decart/lucy2-vton/realtime, decart/lucy-2-5/realtime. WebRTC signaling
//     proxy (fal.realtime.connect / offer+sdp). These are the ONLY Lucy endpoints
//     that accept a `reference_image_url` garment image — but they take a LIVE
//     frame stream, have NO `video_url` field, and CANNOT ingest a prerecorded
//     mp4 via submit/poll. Feeding a recorded clip through them needs a custom
//     WebRTC wrapper (documented, not faked). classifyLucyTransport() flags them
//     so nothing here silently builds a batch body for a realtime slug.
//
// HARD-RULE HONESTY (CLAUDE.md wardrobe rule 2: "No AI-regeneration of garment
// imagery; pixel preservation is mandatory"). The batch family specifies the
// garment by TEXT PROMPT — it regenerates pixels, it does NOT preserve the exact
// SL-bomber construction/stripe/logo. So this lane is a BENCHMARK/DIAGNOSTIC for
// the "does a video-native model kill flicker?" question (arch doc §5 lane B
// option b / §7 kill criterion), NOT a shippable product-accurate swap. It is
// EXPECTED to fail the construction+stripe half of the kill criterion while
// (uniquely) passing the temporal-consistency half. Env-gated + default-off.

export type LucyTransport = "batch" | "realtime" | "unknown";

/** Batch (submit/poll) Lucy slugs — the only ones this module builds bodies for. */
export const LUCY_BATCH_MODELS = [
  "decart/lucy-edit/pro",
  "decart/lucy-edit/dev",
  "decart/lucy-edit/fast",
  "decart/lucy-restyle",
] as const;

/** Realtime WebRTC Lucy slugs — reference-image VTON, but NOT submit/poll. */
export const LUCY_REALTIME_MODELS = [
  "decart/lucy2-vton/realtime",
  "decart/lucy-2-5/realtime",
] as const;

/**
 * Which transport a Lucy model id uses. A `/realtime` suffix (or a known realtime
 * slug) is WebRTC — never batch. The lucy-edit / lucy-restyle family is batch.
 * Anything else Lucy-shaped is "unknown" (caller should refuse rather than guess).
 */
export function classifyLucyTransport(model: string): LucyTransport {
  const m = model.trim().toLowerCase();
  if ((LUCY_REALTIME_MODELS as readonly string[]).includes(m) || m.endsWith("/realtime")) {
    return "realtime";
  }
  if ((LUCY_BATCH_MODELS as readonly string[]).includes(m)) return "batch";
  // lucy-edit family variants we didn't hard-code, but clearly the batch editor.
  if (m.startsWith("decart/lucy-edit/") || m === "decart/lucy-restyle") return "batch";
  return "unknown";
}

export function isLucyBatchModel(model: string): boolean {
  return classifyLucyTransport(model) === "batch";
}

/** Only pro / restyle expose the `resolution` enum in-schema (dev/fast omit it). */
function modelTakesResolution(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m === "decart/lucy-edit/pro" || m === "decart/lucy-restyle";
}

/** Only lucy-restyle exposes `seed` in-schema. */
function modelTakesSeed(model: string): boolean {
  return model.trim().toLowerCase() === "decart/lucy-restyle";
}

export interface LucyV2vArgs {
  /** Signed https URL of the prerecorded source clip (the mp4 to edit). */
  videoUrl: string;
  /** Text instruction describing the garment change (prompt-driven — no image). */
  prompt: string;
  /** "720p" is the only documented enum today (pro/restyle only). */
  resolution?: "720p";
  /** lucy-restyle only. */
  seed?: number;
}

/**
 * Build the CC `fal-run` POST body for a BATCH Lucy edit. Throws for realtime
 * slugs — those need the WebRTC wrapper, never a submit/poll body (fail loud so a
 * misconfigured LUCY_V2V_FAL_MODEL can't silently no-op or 422 on Fal).
 *
 * The `input` keys are the ACTUAL LucyEditProInput / LucyRestyleInput schema:
 * prompt (required, ≤1500 chars), video_url (required), resolution? (pro/restyle),
 * seed? (restyle). We do NOT send sync_mode/enhance_prompt — their schema defaults
 * (enhance_prompt=true; sync_mode per-model) are what we want, and CC forwards the
 * input verbatim.
 */
export function buildLucyV2vBody(model: string, args: LucyV2vArgs): Record<string, unknown> {
  const transport = classifyLucyTransport(model);
  if (transport === "realtime") {
    throw new Error(
      `buildLucyV2vBody: ${model} is a REALTIME WebRTC endpoint (no video_url; needs a ` +
        "WebRTC wrapper). It cannot be driven via CC fal-run submit/poll. See " +
        "docs/LANE_C_LUCY_VIDEO_VTON.md.",
    );
  }
  if (transport !== "batch") {
    throw new Error(`buildLucyV2vBody: ${model} is not a known batch Lucy model`);
  }
  const prompt = (args.prompt ?? "").trim();
  if (!args.videoUrl || !args.videoUrl.trim().startsWith("https://")) {
    throw new Error("buildLucyV2vBody: missing/insecure video_url");
  }
  if (!prompt) throw new Error("buildLucyV2vBody: missing prompt");
  // Schema caps prompt at 1500 chars — clamp defensively so CC never 422s on it.
  const input: Record<string, unknown> = {
    prompt: prompt.slice(0, 1500),
    video_url: args.videoUrl.trim(),
  };
  if (modelTakesResolution(model)) input.resolution = args.resolution ?? "720p";
  if (modelTakesSeed(model) && typeof args.seed === "number") input.seed = args.seed;
  return { action: "fal-run", model, input };
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && v.trim().startsWith("https://");
}

/**
 * Pull the output mp4 URL from a Lucy batch result. Schema is
 * `{ video: { url } }`; tolerate the other common Fal video shapes too (same
 * tolerance as make-scrub-proxy-proxy's extractVideoUrl).
 */
export function extractLucyVideoUrl(result: Record<string, unknown>): string | null {
  const video = result?.video as { url?: string } | undefined;
  if (isHttpsUrl(video?.url)) return video!.url!.trim();
  if (isHttpsUrl(result?.video_url)) return String(result.video_url).trim();
  if (isHttpsUrl(result?.url)) return String(result.url).trim();
  const output = result?.output as { url?: string } | undefined;
  if (isHttpsUrl(output?.url)) return output!.url!.trim();
  const videos = result?.videos as Array<{ url?: string }> | undefined;
  if (Array.isArray(videos) && isHttpsUrl(videos[0]?.url)) return videos[0]!.url!.trim();
  return null;
}

/**
 * Construct the garment-edit text prompt for the batch (prompt-driven) lane from
 * the wardrobe label. This is the LANE'S CORE HONESTY BOUNDARY: batch Lucy cannot
 * take the SL-bomber image, so the garment is described in words. The prompt asks
 * to keep the person/scene/motion and change ONLY the upper/lower garment, to make
 * the diagnostic as fair as possible — but it is still text-conditioned
 * regeneration, not pixel preservation.
 */
export function buildGarmentEditPrompt(
  label: string,
  category: "upper_body" | "lower_body" | string,
): string {
  const garment = (label ?? "garment").trim() || "garment";
  const region = category === "lower_body" ? "lower-body garment (trousers/skirt)" : "jacket/top";
  return (
    `Change only the person's ${region} to a ${garment}. ` +
    "Keep the same person, face, body, pose, motion, lighting and background unchanged. " +
    "Do not alter anything except the garment."
  ).slice(0, 1500);
}
