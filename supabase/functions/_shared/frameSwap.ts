// Pure helpers for the per-frame garment swap (Phase 2b). No Deno / DOM globals,
// so vitest exercises this like the other _shared pure modules.
//
// CONSISTENCY MODEL — read before touching this. `switchx-restyle` is a
// SINGLE-IMAGE CC endpoint: its actions (`segment-image`, `vton-frame`,
// `fal-run`) each take one image and hold NO cross-frame / temporal state
// (see wardrobe-vton-proxy, sam3-segment-proxy, jacketInpaintPipeline.ts). It
// therefore cannot make a jacket stable frame-to-frame on its own. Frame-to-frame
// consistency here comes from REFERENCE-LOCK: every frame is conditioned on the
// exact SAME approved garment reference image, so the target outfit is identical
// for all frames. (The locked hero pipeline adds a masked composite
// `out = frame·(1−α) + swap·α` to pin non-garment pixels — that is the Phase 2c
// strengthening, see docs/AVT_masked_garment_swap_LOCKED.md.)

export interface FrameSwapEngine {
  /**
   * When set, the swap runs via CC `fal-run` on this Fal model id (the model
   * MUST be in CC's fal-run allowlist). When null/undefined, the swap runs via
   * the already-allowlisted `vton-frame` action (IDM-VTON / CatVTON) — the
   * default so the short-clip proof needs no new CC allowlist.
   */
  falModel?: string | null;
  /** vton-frame engine when falModel is unset. */
  vtonModel?: "idm-vton" | "cat-vton";
}

export interface FrameSwapArgs {
  /** The frame being dressed (signed https URL). Varies per frame. */
  humanImageUrl: string;
  /** The approved garment reference (signed https URL). LOCKED — identical for every frame. */
  garmentImageUrl: string;
  category: string;
  garmentDescription: string;
  engine: FrameSwapEngine;
}

/**
 * Build the CC POST body for one frame's swap. Either a `fal-run` of an
 * env-selected model, or the `vton-frame` action — both shaped as a
 * garment-onto-human transfer conditioned on the locked reference.
 */
export function buildFrameSwapBody(args: FrameSwapArgs): Record<string, unknown> {
  const { humanImageUrl, garmentImageUrl, category, garmentDescription, engine } = args;
  if (!humanImageUrl || !garmentImageUrl) {
    throw new Error("buildFrameSwapBody: missing human or garment URL");
  }
  const model = engine.falModel?.trim();
  if (model) {
    // fal-run path — input shaped for the IDM-VTON family (human + garment +
    // description). A different model family needs its own input keys (same
    // caveat as SCRUB_PROXY_FAL_MODEL / VIDEO_COMPOSE_FAL_MODEL).
    return {
      action: "fal-run",
      model,
      input: {
        human_image_url: humanImageUrl,
        garment_image_url: garmentImageUrl,
        description: garmentDescription,
        category,
      },
    };
  }
  return {
    action: "vton-frame",
    human_image_url: humanImageUrl,
    garment_image_url: garmentImageUrl,
    category,
    garment_description: garmentDescription,
    model: engine.vtonModel ?? "idm-vton",
  };
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && v.trim().startsWith("https://");
}

/** Pull the swapped-image URL from a swap result, tolerating shape variance. */
export function extractSwapImageUrl(result: Record<string, unknown>): string | null {
  const image = result?.image as { url?: string } | undefined;
  if (isHttpsUrl(image?.url)) return image!.url!.trim();
  if (isHttpsUrl(result?.image_url)) return String(result.image_url).trim();
  const images = result?.images as Array<{ url?: string }> | undefined;
  if (Array.isArray(images) && isHttpsUrl(images[0]?.url)) return images[0]!.url!.trim();
  return null;
}

/** Zero-padded so lexical order == frame order (matches the extractor's naming). */
export function swappedFrameName(index: number): string {
  return `${String(index).padStart(6, "0")}.jpg`;
}

/** Storage prefix (within project-exports) that a swap session writes into. */
export function swappedFramePrefix(userId: string, assetId: string, sessionId: string): string {
  return `${userId}/${assetId}/swapped/${sessionId}/`;
}
