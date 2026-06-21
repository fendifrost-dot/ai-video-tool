import { supabase } from "@/lib/supabase";
import { uploadViaEdgeFunction } from "@/lib/storage";
import {
  callComposeLook,
  pollArtistLook,
  signLookPreviewUrl,
} from "@/lib/queries/looks";
import { applyGarmentVtonAndWait } from "@/lib/queries/wardrobeVton";
import {
  HERO_CANDIDATE_PLANS,
  type HeroCandidatePlan,
  type HeroCandidateResult,
  type HeroFrameSessionMeta,
  type HeroTransferMode,
} from "@/lib/heroFrame/types";

export type UploadHeroFrameInput = {
  projectId: string;
  userId: string;
  blob: Blob;
  frameTimeSec: number;
  videoAssetId?: string;
};

export async function uploadHeroSourceFrame(
  input: UploadHeroFrameInput,
): Promise<{ scenePath: string; assetId: string }> {
  const filename = `hero_frame_${Date.now()}.jpg`;
  const path = `${input.userId}/${input.projectId}/hero-frames/${filename}`;

  await uploadViaEdgeFunction("project-references", path, input.blob, "image/jpeg", {
    upsert: true,
  });

  const { data: asset, error } = await supabase
    .from("project_assets")
    .insert({
      user_id: input.userId,
      project_id: input.projectId,
      asset_type: "reference_image",
      file_url: path,
      source_tool: "hero_frame_studio",
      approval_status: "pending",
      metadata_json: {
        bucket: "project-references",
        mime_type: "image/jpeg",
        hero_frame: true,
        frame_time_sec: input.frameTimeSec,
        source_video_asset_id: input.videoAssetId ?? null,
      },
    })
    .select("id")
    .single();

  if (error || !asset) {
    throw new Error(`Failed to record hero frame asset: ${error?.message ?? "unknown"}`);
  }

  return { scenePath: path, assetId: asset.id };
}

export type GenerateHeroCandidatesInput = {
  artistId: string;
  projectId: string;
  wardrobeFeatureId: string;
  scenePath: string;
  sceneBucket?: string;
  frameTimeSec: number;
  sessionId: string;
  plans?: HeroCandidatePlan[];
  onProgress?: (info: {
    phase: "vton" | "identity" | "done";
    index: number;
    total: number;
    label: string;
  }) => void;
  signal?: AbortSignal;
};

export async function generateHeroCandidates(
  input: GenerateHeroCandidatesInput,
): Promise<HeroCandidateResult[]> {
  const plans = input.plans ?? HERO_CANDIDATE_PLANS;
  const results: HeroCandidateResult[] = [];

  for (let index = 0; index < plans.length; index++) {
    if (input.signal?.aborted) break;
    const plan = plans[index]!;
    input.onProgress?.({
      phase: "vton",
      index,
      total: plans.length,
      label: plan.label,
    });

    try {
      const vtonLook = await applyGarmentVtonAndWait(
        {
          artistId: input.artistId,
          wardrobeFeatureId: input.wardrobeFeatureId,
          scenePath: input.scenePath,
          sceneBucket: input.sceneBucket ?? "project-references",
          transferMode: plan.transferMode,
          vtonModel: plan.vtonModel,
          heroFrameCandidate: true,
          heroFrameSessionId: input.sessionId,
          candidateIndex: index,
          projectId: input.projectId,
          name: `Hero ${index + 1} · ${plan.label}`,
        },
        { signal: input.signal },
      );

      input.onProgress?.({
        phase: "identity",
        index,
        total: plans.length,
        label: plan.label,
      });

      const canvasPath =
        vtonLook.generated_storage_path ?? vtonLook.generated_image_url;
      if (!canvasPath) throw new Error("VTON look missing storage path");

      const canvasUrl = canvasPath.startsWith("http")
        ? canvasPath
        : await signLookPreviewUrl(canvasPath, 3600);

      const identitySubmit = await callComposeLook({
        artistId: input.artistId,
        wardrobeFeatureIds: [],
        basePrompt:
          "Apply the artist's canonical identity to the subject's face and head. Keep the outfit, pose, lighting, framing, and background exactly as they are.",
        pipelinePreference: "identity_inpaint",
        parentLookId: vtonLook.id,
        name: `Hero ${index + 1} · ${plan.label} · identity`,
        canvasImageUrl: canvasUrl,
      });

      const identityLook = await pollArtistLook(identitySubmit.look_id, {
        signal: input.signal,
        timeoutMs: 6 * 60 * 1000,
      });

      results.push({
        plan,
        index,
        vtonLookId: vtonLook.id,
        identityLookId: identityLook.id,
        previewPath:
          identityLook.generated_storage_path ??
          identityLook.generated_image_url ??
          null,
      });
    } catch (err) {
      results.push({
        plan,
        index,
        vtonLookId: "",
        identityLookId: "",
        previewPath: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    input.onProgress?.({
      phase: "done",
      index,
      total: plans.length,
      label: plan.label,
    });
  }

  return results;
}

export async function approveHeroFrameLook(input: {
  artistId: string;
  lookId: string;
  session: HeroFrameSessionMeta;
}): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase
    .from("artist_looks")
    .select("composition_recipe_json")
    .eq("id", input.lookId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);

  const recipe = (existing?.composition_recipe_json ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("artist_looks")
    .update({
      status: "approved",
      notes: "Hero frame approved — ready for Phase 2 propagation gate.",
      composition_recipe_json: {
        ...recipe,
        hero_frame_approved: true,
        hero_frame_session: input.session,
        approved_at: new Date().toISOString(),
      },
    })
    .eq("id", input.lookId);

  if (error) throw new Error(error.message);
}

export function buildSessionMeta(input: {
  sessionId: string;
  projectId: string;
  scenePath: string;
  sceneBucket: string;
  frameTimeSec: number;
  wardrobeFeatureId: string;
  candidates: HeroCandidateResult[];
  approvedLookId?: string | null;
}): HeroFrameSessionMeta {
  return {
    session_id: input.sessionId,
    project_id: input.projectId,
    scene_path: input.scenePath,
    scene_bucket: input.sceneBucket,
    frame_time_sec: input.frameTimeSec,
    wardrobe_feature_id: input.wardrobeFeatureId,
    approved_look_id: input.approvedLookId ?? null,
    candidates: input.candidates
      .filter((c) => c.identityLookId && !c.error)
      .map((c) => ({
        index: c.index,
        label: c.plan.label,
        transfer_mode: c.plan.transferMode as HeroTransferMode,
        vton_look_id: c.vtonLookId,
        identity_look_id: c.identityLookId,
      })),
  };
}
