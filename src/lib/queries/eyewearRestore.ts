import { supabase } from "@/lib/supabase";
import { getSessionWithTimeout } from "@/lib/authSession";
import { signedUrl, uploadBytesToBucket } from "@/lib/storage";
import { compositePeriocular, type MaskShape } from "@/lib/garment/periocularComposite";
import { loadRgba, rgbaToPngBlob } from "@/lib/garment/canvasRgba";
import type { QuadNorm } from "@/lib/garment/placementEngine";

// A quad may be passed as the canonical QuadNorm array ([[x,y]x4], TL,TR,BR,BL)
// or as an object {TL,TR,BR,BL} — the console hook is friendlier with objects.
export type QuadInput =
  | QuadNorm
  | {
      TL: [number, number];
      TR: [number, number];
      BR: [number, number];
      BL: [number, number];
    };

export type EyewearRestoreInput = {
  /** The identity-faceswap look whose face is correct but eyewear is Grok's. */
  identityLookId: string;
  /** Storage path of the real hero frame (the source of the real glasses). */
  heroFramePath: string;
  /** Bucket holding the hero frame. Default project-references. */
  heroBucket?: string;
  /** Periocular quad on the HERO frame (source), normalized [0..1]. */
  srcQuad: QuadInput;
  /** Periocular quad on the FINAL image (target), normalized [0..1]. */
  dstQuad: QuadInput;
  featherPx?: number;
  colorMatch?: boolean;
  /**
   * Patch alpha shape. "rect" (default) for the eyewear-only periocular patch;
   * "ellipse" for the strict-identity FULL-FACE restore (oval-masked so the
   * real face+glasses pixels composite without rectangular-corner background
   * halo). See compositePeriocular.
   */
  maskShape?: MaskShape;
  /** For maskShape "ellipse": pull the oval in from the quad edges, 0..0.5. */
  inset?: number;
};

export type EyewearRestoreResult = { lookId: string; storagePath: string };

export function toQuadNorm(q: QuadInput): QuadNorm {
  if (Array.isArray(q)) return q;
  return [q.TL, q.TR, q.BR, q.BL];
}

/**
 * Restore the subject's real eyewear: composite the periocular region from the
 * hero frame onto the identity-faceswap look, and write the result as a new
 * "eyewear_restore" child look (pipeline_used is plain text, no enum). Pure
 * frontend — canvas composite + direct storage write (look-composites is
 * user-writable by RLS) + artist_looks insert under the user's session.
 */
export async function eyewearRestore(
  input: EyewearRestoreInput,
): Promise<EyewearRestoreResult> {
  // Timeout-guarded so a stuck auth lock surfaces as a retryable error.
  const session = await getSessionWithTimeout();
  const userId = session.user.id;

  const { data: look, error: lookErr } = await supabase
    .from("artist_looks")
    .select("id, artist_id, name, generated_storage_path, generated_image_url")
    .eq("id", input.identityLookId)
    .maybeSingle();
  if (lookErr) throw new Error(`Identity look query failed: ${lookErr.message}`);
  if (!look) throw new Error(`Identity look not found: ${input.identityLookId}`);

  const finalPath = look.generated_storage_path ?? look.generated_image_url;
  if (!finalPath) throw new Error("Identity look has no generated image to composite onto");

  const heroBucket = input.heroBucket ?? "project-references";
  const finalUrl = finalPath.startsWith("http")
    ? finalPath
    : await signedUrl("look-composites", finalPath, 3600);
  const heroUrl = input.heroFramePath.startsWith("http")
    ? input.heroFramePath
    : await signedUrl(heroBucket as "project-references", input.heroFramePath, 3600);

  const [finalRgba, heroRgba] = await Promise.all([loadRgba(finalUrl), loadRgba(heroUrl)]);

  const srcQuad = toQuadNorm(input.srcQuad);
  const dstQuad = toQuadNorm(input.dstQuad);
  const featherPx = input.featherPx ?? 8;
  const colorMatch = input.colorMatch ?? true;
  const maskShape: MaskShape = input.maskShape ?? "rect";
  const inset = input.inset ?? 0;

  const result = compositePeriocular(finalRgba, heroRgba, srcQuad, dstQuad, {
    featherPx,
    colorMatch,
    maskShape,
    inset,
  });
  const blob = await rgbaToPngBlob(result);

  const childLookId = crypto.randomUUID();
  const storagePath = `${userId}/${look.artist_id}/${childLookId}.png`;
  await uploadBytesToBucket("look-composites", storagePath, blob, "image/png", { upsert: true });

  const recipe = {
    pipeline_preference: "eyewear_restore",
    source_identity_look_id: input.identityLookId,
    hero_frame_path: input.heroFramePath,
    hero_bucket: heroBucket,
    src_quad: srcQuad,
    dst_quad: dstQuad,
    feather_px: featherPx,
    color_match: colorMatch,
    mask_shape: maskShape,
    inset,
  };

  const { data: child, error: insErr } = await supabase
    .from("artist_looks")
    .insert({
      id: childLookId,
      artist_id: look.artist_id,
      user_id: userId,
      name: `${String(look.name ?? "Hero").slice(0, 48)} · real glasses`,
      description:
        "Deterministic periocular composite — restored the subject's real eyewear from the hero frame.",
      status: "complete",
      generated_image_url: storagePath,
      generated_storage_path: storagePath,
      composition_recipe_json: recipe,
      pipeline_used: "eyewear_restore",
      cost_cents: 0,
      iterations: 3,
      parent_look_id: input.identityLookId,
    })
    .select("id")
    .single();
  if (insErr || !child) {
    throw new Error(`eyewear_restore look insert failed: ${insErr?.message ?? "unknown"}`);
  }

  return { lookId: childLookId, storagePath };
}

/**
 * Console-callable entry point for precise verification with explicit quads:
 *   await window.__eyewearRestore({ identityLookId, heroFramePath, heroBucket,
 *     srcQuad, dstQuad, featherPx, colorMatch })
 * Quads are normalized {TL,TR,BR,BL} (or [[x,y]x4]) in [0..1]. Guarded so it
 * only exists in the running browser app.
 */
export function installEyewearRestoreDevHook(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __eyewearRestore?: typeof eyewearRestore }).__eyewearRestore =
    eyewearRestore;
}
