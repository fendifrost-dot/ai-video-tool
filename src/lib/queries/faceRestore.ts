import { supabase } from "@/lib/supabase";
import { getSessionWithTimeout } from "@/lib/authSession";
import { signedUrl, uploadBytesToBucket } from "@/lib/storage";
import { compositePeriocular } from "@/lib/garment/periocularComposite";
import { loadRgba, rgbaToPngBlob } from "@/lib/garment/canvasRgba";
import { detectFace } from "@/lib/garment/detectFace";
import {
  MIN_FACE_CONFIDENCE,
  compareFaceRegions,
  faceRegionToQuad,
  type FaceQuadOptions,
  type FaceRegion,
} from "@/lib/garment/faceRegion";
import { toQuadNorm, type QuadInput } from "@/lib/queries/eyewearRestore";
import type { QuadNorm } from "@/lib/garment/placementEngine";

export type FaceRestoreInput = {
  /** The look whose face is wrong — the Grok garment look or its identity child. */
  targetLookId: string;
  /** Storage path of the real hero frame — the source of his real face. */
  heroFramePath: string;
  /** Bucket holding the hero frame. Default project-references. */
  heroBucket?: string;
  /** Skip detection on the hero frame and use this quad instead. */
  srcQuad?: QuadInput;
  /** Skip detection on the target and use this quad instead. */
  dstQuad?: QuadInput;
  featherPx?: number;
  colorMatch?: boolean;
  /** Pull the composited oval in from the quad edges, 0..0.5. Default 0.06. */
  inset?: number;
  /** How far past the detected skin bbox to reach for hair/beard/jaw. */
  padding?: FaceQuadOptions;
  /** Reject detections below this. Default MIN_FACE_CONFIDENCE. */
  minConfidence?: number;
};

export type FaceRestoreResult = {
  lookId: string;
  storagePath: string;
  srcQuad: QuadNorm;
  dstQuad: QuadNorm;
  srcDetection: FaceRegion | null;
  dstDetection: FaceRegion | null;
};

async function detectQuad(
  label: string,
  img: Parameters<typeof detectFace>[0],
  minConfidence: number,
  padding: FaceQuadOptions,
): Promise<{ quad: QuadNorm; region: FaceRegion }> {
  const region = await detectFace(img);
  if (!region) {
    throw new Error(
      `No face found in the ${label}. Pass an explicit quad (srcQuad/dstQuad) to composite manually.`,
    );
  }
  if (region.confidence < minConfidence) {
    throw new Error(
      `Face detection on the ${label} was too weak to trust (confidence ${region.confidence.toFixed(2)} < ${minConfidence}, method ${region.method}). Pass an explicit quad instead of compositing blind.`,
    );
  }
  return { quad: faceRegionToQuad(region, img.width, img.height, padding), region };
}

/**
 * Identity lock: paste his REAL face from the hero frame onto a Grok result.
 *
 * The Grok image-edit lane re-renders the whole subject, and the generative
 * identity pass replaces the invented face with another invented face — neither
 * gives back the man in the frame. This is the deterministic version: detect the
 * face on both images, warp the hero-frame face onto the output quad, mask it to
 * an oval, feather and colour-match it to the output's lighting. His own pixels,
 * so identity is exact by construction; Grok's outfit is untouched outside the
 * oval.
 *
 * Refuses rather than guesses — if either detection is weak, or the two
 * detections disagree on where/how big the head is, it throws and the caller
 * keeps the un-composited look. Pass srcQuad/dstQuad to override detection
 * entirely (the Hero Frame Studio quad editors and the console hook do this).
 */
export async function faceRestore(input: FaceRestoreInput): Promise<FaceRestoreResult> {
  const session = await getSessionWithTimeout();
  const userId = session.user.id;

  const { data: look, error: lookErr } = await supabase
    .from("artist_looks")
    .select("id, artist_id, name, generated_storage_path, generated_image_url")
    .eq("id", input.targetLookId)
    .maybeSingle();
  if (lookErr) throw new Error(`Target look query failed: ${lookErr.message}`);
  if (!look) throw new Error(`Target look not found: ${input.targetLookId}`);

  const finalPath = look.generated_storage_path ?? look.generated_image_url;
  if (!finalPath) throw new Error("Target look has no generated image to composite onto");

  const heroBucket = input.heroBucket ?? "project-references";
  const finalUrl = finalPath.startsWith("http")
    ? finalPath
    : await signedUrl("look-composites", finalPath, 3600);
  const heroUrl = input.heroFramePath.startsWith("http")
    ? input.heroFramePath
    : await signedUrl(heroBucket as "project-references", input.heroFramePath, 3600);

  const [finalRgba, heroRgba] = await Promise.all([loadRgba(finalUrl), loadRgba(heroUrl)]);

  const minConfidence = input.minConfidence ?? MIN_FACE_CONFIDENCE;
  const padding = input.padding ?? {};

  let srcQuad: QuadNorm;
  let dstQuad: QuadNorm;
  let srcDetection: FaceRegion | null = null;
  let dstDetection: FaceRegion | null = null;

  if (input.srcQuad && input.dstQuad) {
    srcQuad = toQuadNorm(input.srcQuad);
    dstQuad = toQuadNorm(input.dstQuad);
  } else {
    const src = input.srcQuad
      ? null
      : await detectQuad("hero frame", heroRgba, minConfidence, padding);
    const dst = input.dstQuad
      ? null
      : await detectQuad("generated output", finalRgba, minConfidence, padding);

    if (src && dst) {
      // Grok keeps the camera and crop, so his head must land at a similar size
      // and place in both. When it doesn't, one detection locked onto something
      // that isn't his face and compositing would paste a visible mess.
      const agreement = compareFaceRegions(src.region, heroRgba, dst.region, finalRgba);
      if (!agreement.ok) {
        throw new Error(
          `Face composite refused — ${agreement.reason}. Pass explicit srcQuad/dstQuad to override.`,
        );
      }
    }

    srcDetection = src?.region ?? null;
    dstDetection = dst?.region ?? null;
    srcQuad = src?.quad ?? toQuadNorm(input.srcQuad!);
    dstQuad = dst?.quad ?? toQuadNorm(input.dstQuad!);
  }

  const featherPx = input.featherPx ?? 14;
  const colorMatch = input.colorMatch ?? true;
  const inset = input.inset ?? 0.06;

  const result = compositePeriocular(finalRgba, heroRgba, srcQuad, dstQuad, {
    featherPx,
    colorMatch,
    // A face doesn't fill a rectangle — an oval keeps the rectangular corners
    // (background, collar) from bleeding a halo around his head.
    maskShape: "ellipse",
    inset,
  });
  const blob = await rgbaToPngBlob(result);

  const childLookId = crypto.randomUUID();
  const storagePath = `${userId}/${look.artist_id}/${childLookId}.png`;
  await uploadBytesToBucket("look-composites", storagePath, blob, "image/png", { upsert: true });

  const recipe = {
    pipeline_preference: "face_restore",
    source_target_look_id: input.targetLookId,
    hero_frame_path: input.heroFramePath,
    hero_bucket: heroBucket,
    src_quad: srcQuad,
    dst_quad: dstQuad,
    feather_px: featherPx,
    color_match: colorMatch,
    mask_shape: "ellipse",
    inset,
    src_detection: srcDetection,
    dst_detection: dstDetection,
    identity_restored: true,
    identity_method: "deterministic_face_composite",
  };

  const { data: child, error: insErr } = await supabase
    .from("artist_looks")
    .insert({
      id: childLookId,
      artist_id: look.artist_id,
      user_id: userId,
      name: `${String(look.name ?? "Hero").slice(0, 46)} · real face`,
      description:
        "Deterministic face composite — restored the subject's real face from the hero frame onto the generated output.",
      status: "complete",
      generated_image_url: storagePath,
      generated_storage_path: storagePath,
      composition_recipe_json: recipe,
      pipeline_used: "face_restore",
      cost_cents: 0,
      iterations: 1,
      parent_look_id: input.targetLookId,
    })
    .select("id")
    .single();
  if (insErr || !child) {
    throw new Error(`face_restore look insert failed: ${insErr?.message ?? "unknown"}`);
  }

  return { lookId: childLookId, storagePath, srcQuad, dstQuad, srcDetection, dstDetection };
}

/**
 * Console-callable entry point, mirroring window.__eyewearRestore:
 *   await window.__faceRestore({ targetLookId, heroFramePath })
 * Quads are optional — omit them to let detection place the face, or pass
 * normalized {TL,TR,BR,BL} to override it.
 */
export function installFaceRestoreDevHook(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __faceRestore?: typeof faceRestore }).__faceRestore = faceRestore;
}
