export type HeroTransferMode = "full_look" | "jacket_only";

export type HeroCandidateLane =
  | "sam_grok_restore"
  | "masked_inpaint"
  | "guarded_grok"
  | "vton"
  | "grok_image_edit";

/**
 * Two independent identity mechanisms — do not conflate them:
 *
 *   runIdentity     — the GENERATIVE face-swap pass (faceswap-proxy). It puts a
 *                     different invented face where an invented face was. Only
 *                     the raw Grok comparison lane needs it.
 *   runFaceRestore  — the DETERMINISTIC composite of his real hero-frame head
 *                     back onto the result. This is the identity guarantee.
 */
export type HeroCandidatePlan =
  | {
      /**
       * PRIMARY — what worked in live tests:
       *   1. SAM-3 mask (SwitchX segment-image) — masking only
       *   2. Grok /v1/images/edits — the outfit swap
       *   3. Masked lock onto hero (clothing from Grok, rest hero bytes)
       *   4. Deterministic face restore
       * Pose/body restore is a follow-on stage when Grok drifts stance.
       */
      lane: "sam_grok_restore";
      label: string;
      runIdentity: false;
      runFaceRestore: boolean;
      /** Single-word SAM-3 prompt. Default "clothing". */
      samPrompt?: string;
    }
  | {
      /**
       * EXPERIMENTAL — evf-sam + flux masked inpaint. Never won a full-outfit
       * live swap; kept for comparison only.
       */
      lane: "masked_inpaint";
      label: string;
      runIdentity: false;
      runFaceRestore: boolean;
      inpaintModelKey?: "flux-general" | "flux-lora";
    }
  | {
      /**
       * DEMOTED — Grok as IP-Adapter into flux. Put the swap on flux, which
       * never succeeded as outfit engine in tests.
       */
      lane: "guarded_grok";
      label: string;
      runIdentity: false;
      runFaceRestore: boolean;
    }
  | {
      lane: "vton";
      transferMode: HeroTransferMode;
      vtonModel: "idm-vton" | "cat-vton";
      label: string;
      runIdentity: false;
      runFaceRestore: boolean;
    }
  | {
      lane: "grok_image_edit";
      label: string;
      runIdentity: boolean;
      runFaceRestore: boolean;
    };

/**
 * PRIMARY product lane — SAM-3 mask → Grok outfit → lock → face restore.
 * See docs/AVT_masked_garment_swap_LOCKED.md.
 */
export const SAM_GROK_RESTORE_PLAN: HeroCandidatePlan = {
  lane: "sam_grok_restore",
  label: "SAM-3 → Grok · Full outfit (primary)",
  runIdentity: false,
  runFaceRestore: true,
  samPrompt: "clothing",
};

/** @deprecated Use SAM_GROK_RESTORE_PLAN. Kept so old UI strings resolve. */
export const GUARDED_GROK_PLAN: HeroCandidatePlan = SAM_GROK_RESTORE_PLAN;

/**
 * Default candidate matrix (run order).
 *
 * 1. SAM-3 → Grok → lock — canonical (tools that worked)
 * 2. Raw Grok — comparison (no SAM-3 lock)
 * 3. Masked flux — experimental
 * 4. IDM-VTON / CatVTON — fallback
 */
export const HERO_CANDIDATE_PLANS: HeroCandidatePlan[] = [
  SAM_GROK_RESTORE_PLAN,
  {
    lane: "grok_image_edit",
    label: "Grok Image-Edit · Full look (comparison, no SAM-3 lock)",
    runIdentity: false,
    runFaceRestore: true,
  },
  {
    lane: "masked_inpaint",
    label: "Masked Inpaint · Full outfit (experimental)",
    runIdentity: false,
    runFaceRestore: true,
    inpaintModelKey: "flux-general",
  },
  {
    lane: "vton",
    transferMode: "full_look",
    vtonModel: "idm-vton",
    label: "Full-look · IDM-VTON (fallback)",
    runIdentity: false,
    runFaceRestore: true,
  },
  {
    lane: "vton",
    transferMode: "full_look",
    vtonModel: "cat-vton",
    label: "Full-look · CatVTON (fallback)",
    runIdentity: false,
    runFaceRestore: true,
  },
];

export type HeroCandidateResult = {
  plan: HeroCandidatePlan;
  index: number;
  /** Garment-transfer look (VTON or Grok) before optional identity pass. */
  garmentLookId: string;
  identityLookId: string;
  /**
   * Face-composite child look, when the deterministic identity lock ran and
   * succeeded. Null when the lane skips it or when detection refused.
   */
  faceLookId?: string | null;
  /** Why the face composite was skipped, if it was attempted and refused. */
  faceRestoreError?: string;
  /** SAM-3 → Grok outfit-lock child, when that step ran. */
  outfitLockLookId?: string | null;
  outfitLockError?: string;
  previewPath: string | null;
  error?: string;
};

export type HeroFrameSessionMeta = {
  session_id: string;
  project_id: string;
  scene_path: string;
  scene_bucket: string;
  frame_time_sec: number;
  wardrobe_feature_id: string;
  approved_look_id: string | null;
  candidates: Array<{
    index: number;
    label: string;
    lane: HeroCandidateLane;
    transfer_mode?: HeroTransferMode;
    garment_look_id: string;
    identity_look_id: string;
    face_look_id?: string | null;
    outfit_lock_look_id?: string | null;
    identity_restored: boolean;
  }>;
};
