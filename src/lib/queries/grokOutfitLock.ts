import { supabase } from "@/lib/supabase";
import { getSessionWithTimeout } from "@/lib/authSession";
import { signedUrl, uploadBytesToBucket } from "@/lib/storage";
import { loadRgba, rgbaToPngBlob } from "@/lib/garment/canvasRgba";
import { lockGrokOutfitOntoHero } from "@/lib/garment/grokOutfitLock";

export type GrokOutfitLockInput = {
  /** Completed Grok garment look (full-frame edit). */
  grokLookId: string;
  heroFramePath: string;
  heroBucket?: string;
  /** look-composites path from sam3-segment-proxy. */
  sam3MaskPath: string;
  sam3Prompt?: string;
  featherPx?: number;
};

export type GrokOutfitLockResult = {
  lookId: string;
  storagePath: string;
  coverage: number;
};

/**
 * After Grok swaps the outfit, lock clothing into the hero silhouette:
 * out = hero·(1−α) + grok·α using the SAM-3 clothing mask on the hero frame.
 */
export async function grokOutfitLock(input: GrokOutfitLockInput): Promise<GrokOutfitLockResult> {
  const session = await getSessionWithTimeout();
  const userId = session.user.id;

  const { data: look, error: lookErr } = await supabase
    .from("artist_looks")
    .select("id, artist_id, name, generated_storage_path, generated_image_url")
    .eq("id", input.grokLookId)
    .maybeSingle();
  if (lookErr) throw new Error(`Grok look query failed: ${lookErr.message}`);
  if (!look) throw new Error(`Grok look not found: ${input.grokLookId}`);

  const grokPath = look.generated_storage_path ?? look.generated_image_url;
  if (!grokPath) throw new Error("Grok look has no generated image");

  const heroBucket = input.heroBucket ?? "project-references";
  const [grokUrl, heroUrl, maskUrl] = await Promise.all([
    grokPath.startsWith("http")
      ? Promise.resolve(grokPath)
      : signedUrl("look-composites", grokPath, 3600),
    input.heroFramePath.startsWith("http")
      ? Promise.resolve(input.heroFramePath)
      : signedUrl(heroBucket as "project-references", input.heroFramePath, 3600),
    signedUrl("look-composites", input.sam3MaskPath, 3600),
  ]);
  if (!grokUrl || !heroUrl || !maskUrl) {
    throw new Error("Could not sign hero / grok / sam3 mask URLs for outfit lock");
  }

  const [heroRgba, grokRgba, maskRgba] = await Promise.all([
    loadRgba(heroUrl),
    loadRgba(grokUrl),
    loadRgba(maskUrl),
  ]);

  const { image, coverage } = lockGrokOutfitOntoHero(heroRgba, grokRgba, maskRgba, {
    featherPx: input.featherPx ?? 6,
  });
  if (coverage < 0.02) {
    throw new Error(
      `sam3_outfit_lock_coverage_too_low: ${coverage.toFixed(4)} — SAM-3 matched almost no clothing. Try prompt "clothing" or "jacket".`,
    );
  }

  const blob = await rgbaToPngBlob(image);
  const childLookId = crypto.randomUUID();
  const storagePath = `${userId}/${look.artist_id}/${childLookId}.png`;
  await uploadBytesToBucket("look-composites", storagePath, blob, "image/png", { upsert: true });

  const recipe = {
    pipeline_preference: "sam_grok_restore",
    grok_look_id: input.grokLookId,
    hero_frame_path: input.heroFramePath,
    hero_bucket: heroBucket,
    sam3_mask_path: input.sam3MaskPath,
    sam3_prompt: input.sam3Prompt ?? "clothing",
    outfit_lock: true,
    outfit_lock_coverage: Number(coverage.toFixed(4)),
    feather_px: input.featherPx ?? 6,
    pose_restore_status: "pending",
    identity_method: "sam3_clothing_lock_onto_hero",
  };

  const { data: child, error: insErr } = await supabase
    .from("artist_looks")
    .insert({
      id: childLookId,
      artist_id: look.artist_id,
      user_id: userId,
      name: `${String(look.name ?? "Hero").slice(0, 40)} · SAM-3 lock`,
      description:
        "SAM-3 clothing mask lock — Grok outfit inside α, hero face/pose/background outside α.",
      status: "complete",
      generated_image_url: storagePath,
      generated_storage_path: storagePath,
      composition_recipe_json: recipe,
      pipeline_used: "sam_grok_restore",
      cost_cents: 0,
      iterations: 1,
      parent_look_id: input.grokLookId,
    })
    .select("id")
    .single();
  if (insErr || !child) {
    throw new Error(`Failed to insert outfit-lock look: ${insErr?.message ?? "unknown"}`);
  }

  return { lookId: child.id, storagePath, coverage };
}
