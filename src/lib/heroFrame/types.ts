export type HeroTransferMode = "full_look" | "jacket_only";

export type HeroCandidateLane =
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
       * MASKED FULL-OUTFIT INPAINT. evf-sam clothing mask (minus a dilated
       * head/hands guard) → Flux masked inpaint over that region → deterministic
       * recomposite onto the real capture. Face/pose/background stay source
       * bytes. Scope is the entire outfit, not jacket-only.
       */
      lane: "masked_inpaint";
      label: string;
      runIdentity: false;
      runFaceRestore: boolean;
      inpaintModelKey?: "flux-general" | "flux-lora";
    }
  | {
      /**
       * PRIMARY — GUARDED GROK FULL OUTFIT.
       *
       * Grok is strongest at swapping entire looks. We use that strength for
       * appearance only:
       *
       *   1. Grok /v1/images/edits renders the full frame in the target look.
       *      Geometry is discarded (Grok has no mask and often re-poses).
       *   2. That render is the IP-ADAPTER REFERENCE for masked full-outfit
       *      inpaint. Flux paints in place; recomposite keeps face/pose/bg.
       *
       * REQUIRES flux-general (only engine with ip_adapters).
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
 * PRIMARY product lane — Grok full-outfit appearance + masked identity guard.
 */
export const GUARDED_GROK_PLAN: HeroCandidatePlan = {
  lane: "guarded_grok",
  label: "Guarded Grok · Full outfit (primary)",
  runIdentity: false,
  runFaceRestore: true,
};

/**
 * Default candidate matrix (run order).
 *
 * 1. GUARDED GROK — canonical: Grok full-look fidelity + structural face/pose
 * 2. MASKED INPAINT — full-outfit mask without Grok reference (wardrobe still)
 * 3. IDM-VTON full-look — declared fallback
 * 4. RAW GROK — comparison only (re-renders every pixel)
 * 5. CatVTON full-look
 */
export const HERO_CANDIDATE_PLANS: HeroCandidatePlan[] = [
  GUARDED_GROK_PLAN,
  {
    lane: "masked_inpaint",
    label: "Masked Inpaint · Full outfit (no Grok ref)",
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
    lane: "grok_image_edit",
    label: "Grok Image-Edit · Full look (comparison only)",
    runIdentity: true,
    runFaceRestore: true,
  },
  {
    lane: "vton",
    transferMode: "full_look",
    vtonModel: "cat-vton",
    label: "Full-look · CatVTON",
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
    identity_restored: boolean;
  }>;
};
