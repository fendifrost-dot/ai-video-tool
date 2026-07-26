import { supabase } from "@/lib/supabase";
import { uploadViaEdgeFunction } from "@/lib/storage";
import { pollArtistLook, signLookPreviewUrl } from "@/lib/queries/looks";
import { callApplyIdentityToLook } from "@/lib/queries/faceswap";
import { applyGrokGarmentTruthAndWait } from "@/lib/queries/grokImageGarment";
import { applyGarmentVtonAndWait } from "@/lib/queries/wardrobeVton";
import { faceRestore, HEAD_RESTORE_PADDING } from "@/lib/queries/faceRestore";
import { applyJacketInpaintAndWait } from "@/lib/queries/jacketInpaint";
import { callSam3Segment } from "@/lib/queries/sam3Segment";
import { grokOutfitLock } from "@/lib/queries/grokOutfitLock";
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
      // source_tool is the `provider_name` enum — "hero_frame_studio" is NOT a
      // member, so inserting it threw "invalid input value for enum" at runtime
      // and failed the capture. Use "manual" (the established value for
      // user-captured reference images); the hero_frame marker lives in
      // metadata_json below.
      source_tool: "manual",
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
    phase: "mask" | "garment" | "lock" | "identity" | "face" | "done";
    index: number;
    total: number;
    label: string;
  }) => void;
  signal?: AbortSignal;
};

async function runIdentityPass(input: {
  artistId: string;
  plan: HeroCandidatePlan;
  index: number;
  garmentLookId: string;
  garmentLook: Awaited<ReturnType<typeof pollArtistLook>>;
  signal?: AbortSignal;
}) {
  const canvasPath =
    input.garmentLook.generated_storage_path ?? input.garmentLook.generated_image_url;
  if (!canvasPath) throw new Error("Garment look missing storage path");

  const canvasUrl = canvasPath.startsWith("http")
    ? canvasPath
    : await signLookPreviewUrl(canvasPath, 3600);
  if (!canvasUrl) throw new Error("Could not sign garment-look canvas URL for identity pass");

  // Identity lock via face-swap (faceswap-proxy → Fal advanced face-swap),
  // NOT the broken identity_inpaint lane. Face-swap repaints only the face
  // region, so Grok's faithful garment is preserved while the subject's face
  // is locked to the artist's real likeness (Character DNA / canonical base).
  // workflowType "target_hair" keeps the hero-frame/Grok hair and pose; only
  // the face is grafted.
  const identitySubmit = await callApplyIdentityToLook({
    artistId: input.artistId,
    parentLookId: input.garmentLookId,
    sourceImageUrl: canvasUrl,
    name: `Hero ${input.index + 1} · ${input.plan.label} · identity`,
    workflowType: "target_hair",
  });

  return pollArtistLook(identitySubmit.lookId, {
    signal: input.signal,
    timeoutMs: 6 * 60 * 1000,
  });
}

export async function generateHeroCandidates(
  input: GenerateHeroCandidatesInput,
): Promise<HeroCandidateResult[]> {
  const plans = input.plans ?? HERO_CANDIDATE_PLANS;
  const results: HeroCandidateResult[] = [];

  for (let index = 0; index < plans.length; index++) {
    if (input.signal?.aborted) break;
    const plan = plans[index]!;
    input.onProgress?.({
      phase: "garment",
      index,
      total: plans.length,
      label: plan.label,
    });

    try {
      let garmentLook: Awaited<ReturnType<typeof pollArtistLook>>;
      let garmentLookId: string;
      let identityLook: Awaited<ReturnType<typeof pollArtistLook>>;
      let identityLookId: string;
      let outfitLockLookId: string | null = null;
      let outfitLockError: string | undefined;
      let faceLookId: string | null = null;
      let facePreviewPath: string | null = null;
      let faceRestoreError: string | undefined;

      if (plan.lane === "sam_grok_restore") {
        // PRIMARY — tools that worked in live tests (see LOCKED.md).
        // 1) SAM-3 clothing mask  2) Grok outfit swap  3) lock onto hero  4) face restore
        const samPrompt = plan.samPrompt ?? "clothing";
        input.onProgress?.({
          phase: "mask",
          index,
          total: plans.length,
          label: plan.label,
        });
        const sam = await callSam3Segment({
          scenePath: input.scenePath,
          sceneBucket: input.sceneBucket ?? "project-references",
          prompt: samPrompt,
          artistId: input.artistId,
        });

        input.onProgress?.({
          phase: "garment",
          index,
          total: plans.length,
          label: plan.label,
        });
        const grokLook = await applyGrokGarmentTruthAndWait(
          {
            artistId: input.artistId,
            wardrobeFeatureId: input.wardrobeFeatureId,
            scenePath: input.scenePath,
            sceneBucket: input.sceneBucket ?? "project-references",
            heroFrameSessionId: input.sessionId,
            candidateIndex: index,
            projectId: input.projectId,
            name: `Hero ${index + 1} · ${plan.label} · grok`,
          },
          { signal: input.signal },
        );
        garmentLookId = grokLook.id;
        garmentLook = grokLook;
        identityLook = grokLook;
        identityLookId = grokLook.id;

        const recipe = (grokLook.composition_recipe_json ?? {}) as Record<string, unknown>;
        await supabase
          .from("artist_looks")
          .update({
            composition_recipe_json: {
              ...recipe,
              pipeline_preference: "sam_grok_restore",
              sam3_mask_path: sam.maskPath,
              sam3_prompt: sam.prompt,
              pose_restore_status: "pending",
            },
          })
          .eq("id", grokLook.id);

        input.onProgress?.({
          phase: "lock",
          index,
          total: plans.length,
          label: plan.label,
        });
        try {
          const locked = await grokOutfitLock({
            grokLookId: grokLook.id,
            heroFramePath: input.scenePath,
            heroBucket: input.sceneBucket ?? "project-references",
            sam3MaskPath: sam.maskPath,
            sam3Prompt: sam.prompt,
          });
          outfitLockLookId = locked.lookId;
          identityLookId = locked.lookId;
          identityLook = await pollArtistLook(locked.lookId, {
            signal: input.signal,
            requireTerminal: true,
            timeoutMs: 60_000,
          });
        } catch (err) {
          outfitLockError = err instanceof Error ? err.message : String(err);
        }
      } else if (plan.lane === "masked_inpaint") {
        // Experimental. NO PROMPTS ARE SENT — jacket-inpaint-proxy derives them
        // from the selected wardrobe row.
        garmentLook = await applyJacketInpaintAndWait(
          {
            artistId: input.artistId,
            wardrobeFeatureId: input.wardrobeFeatureId,
            scenePath: input.scenePath,
            sceneBucket: input.sceneBucket ?? "project-references",
            heroFrameSessionId: input.sessionId,
            candidateIndex: index,
            projectId: input.projectId,
            name: `Hero ${index + 1} · ${plan.label}`,
            faceGuard: true,
            inpaintModelKey: plan.inpaintModelKey,
          },
          { signal: input.signal },
        );
        garmentLookId = garmentLook.id;
        identityLook = garmentLook;
        identityLookId = garmentLookId;
      } else if (plan.lane === "guarded_grok") {
        // DEMOTED — Grok as IP-Adapter into flux (kept for comparison).
        const grokLook = await applyGrokGarmentTruthAndWait(
          {
            artistId: input.artistId,
            wardrobeFeatureId: input.wardrobeFeatureId,
            scenePath: input.scenePath,
            sceneBucket: input.sceneBucket ?? "project-references",
            heroFrameSessionId: input.sessionId,
            candidateIndex: index,
            projectId: input.projectId,
            name: `Hero ${index + 1} · ${plan.label} · grok reference`,
          },
          { signal: input.signal },
        );
        const grokPath = grokLook.generated_storage_path ?? grokLook.generated_image_url;
        if (!grokPath) {
          throw new Error("Guarded Grok: reference render produced no storage path");
        }

        garmentLook = await applyJacketInpaintAndWait(
          {
            artistId: input.artistId,
            wardrobeFeatureId: input.wardrobeFeatureId,
            scenePath: input.scenePath,
            sceneBucket: input.sceneBucket ?? "project-references",
            heroFrameSessionId: input.sessionId,
            candidateIndex: index,
            projectId: input.projectId,
            name: `Hero ${index + 1} · ${plan.label}`,
            faceGuard: true,
            ipAdapterImagePath: grokPath,
            ipAdapterImageBucket: "look-composites",
            inpaintModelKey: "flux-general",
          },
          { signal: input.signal },
        );
        garmentLookId = garmentLook.id;
        identityLook = garmentLook;
        identityLookId = garmentLookId;
      } else if (plan.lane === "grok_image_edit") {
        garmentLook = await applyGrokGarmentTruthAndWait(
          {
            artistId: input.artistId,
            wardrobeFeatureId: input.wardrobeFeatureId,
            scenePath: input.scenePath,
            sceneBucket: input.sceneBucket ?? "project-references",
            heroFrameSessionId: input.sessionId,
            candidateIndex: index,
            projectId: input.projectId,
            name: `Hero ${index + 1} · ${plan.label}`,
          },
          { signal: input.signal },
        );
        garmentLookId = garmentLook.id;
        identityLook = garmentLook;
        identityLookId = garmentLookId;
      } else {
        garmentLook = await applyGarmentVtonAndWait(
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
        garmentLookId = garmentLook.id;
        identityLook = garmentLook;
        identityLookId = garmentLookId;
      }

      if (plan.runIdentity) {
        input.onProgress?.({
          phase: "identity",
          index,
          total: plans.length,
          label: plan.label,
        });
        identityLook = await runIdentityPass({
          artistId: input.artistId,
          plan,
          index,
          garmentLookId,
          garmentLook,
          signal: input.signal,
        });
        identityLookId = identityLook.id;
      }

      // DETERMINISTIC FACE RESTORE — real hero head onto whatever garment+lock produced.
      // On sam_grok_restore the outfit lock already kept most of the head as hero
      // bytes; this reseats any residual Grok face drift. Non-fatal.
      if (plan.runFaceRestore) {
        input.onProgress?.({
          phase: "face",
          index,
          total: plans.length,
          label: plan.label,
        });
        try {
          const restored = await faceRestore({
            targetLookId: identityLookId,
            heroFramePath: input.scenePath,
            heroBucket: input.sceneBucket ?? "project-references",
            // Whole-head oval when destination bg is already his (lock / masked /
            // vton). Narrower face default on raw Grok (re-rendered background).
            padding:
              plan.lane === "grok_image_edit" ? undefined : HEAD_RESTORE_PADDING,
          });
          faceLookId = restored.lookId;
          facePreviewPath = restored.storagePath;
        } catch (err) {
          faceRestoreError = err instanceof Error ? err.message : String(err);
        }
      }

      results.push({
        plan,
        index,
        garmentLookId,
        identityLookId,
        faceLookId,
        faceRestoreError,
        outfitLockLookId,
        outfitLockError,
        previewPath:
          facePreviewPath ??
          identityLook.generated_storage_path ??
          identityLook.generated_image_url ??
          null,
      });
    } catch (err) {
      results.push({
        plan,
        index,
        garmentLookId: "",
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
        lane: c.plan.lane,
        transfer_mode:
          c.plan.lane === "vton" ? (c.plan.transferMode as HeroTransferMode) : undefined,
        garment_look_id: c.garmentLookId,
        identity_look_id: c.identityLookId,
        face_look_id: c.faceLookId ?? null,
        outfit_lock_look_id: c.outfitLockLookId ?? null,
        // Only true when his real face actually made it back in — a refused
        // composite must not be recorded as an identity-restored hero.
        identity_restored: c.plan.runFaceRestore && Boolean(c.faceLookId),
      })),
  };
}
