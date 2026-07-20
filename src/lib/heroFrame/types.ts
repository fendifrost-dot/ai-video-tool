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
 *                     the Grok lane needs it, and only as a stepping stone.
 *   runFaceRestore  — the DETERMINISTIC composite of his real hero-frame head
 *                     back onto the result. This is the identity guarantee. It
 *                     is his own pixels, so it cannot be wrong about who he is.
 */
export type HeroCandidatePlan =
  | {
      /**
       * PRIMARY LANE. evf-sam garment mask (minus a dilated head/hands guard) →
       * Flux masked inpaint over that region only → deterministic feathered
       * recomposite onto the real capture. Face, glasses, pose and background
       * are never re-rendered — they are the source bytes, unchanged, because
       * the recomposite only ever writes inside the mask.
       */
      lane: "masked_inpaint";
      label: string;
      runIdentity: false;
      runFaceRestore: boolean;
      /** Inpaint engine. flux-general accepts the IP-Adapter garment reference. */
      inpaintModelKey?: "flux-general" | "flux-lora";
    }
  | {
      /**
       * GUARDED GROK. Grok's garment fidelity WITH the masked lane's structural
       * identity guarantee. Two steps:
       *
       *   1. Grok /v1/images/edits renders the full frame wearing the garment.
       *      We take NO geometry from this render — Grok has no mask parameter
       *      and routinely re-poses the subject, so its pixels are not spatially
       *      aligned to the hero frame and cannot be pasted anywhere.
       *   2. That render becomes the IP-ADAPTER REFERENCE for the ordinary
       *      masked inpaint. IP-Adapter conditions on CLIP image embeddings, not
       *      pixel positions, so Grok's pose drift is irrelevant BY CONSTRUCTION,
       *      while flux inpaints in place and stays aligned to the real frame.
       *
       * Net: the garment appearance comes from the best garment model available,
       * and face/pose/background remain the real captured bytes because the
       * deterministic recomposite still only ever writes inside the mask. The
       * deterministic head restore runs last, as on every lane.
       *
       * REQUIRES flux-general — it is the only engine with an ip_adapters field.
       * That engine's hang/502 is a live infra issue, so this lane is wired and
       * correct but gated on it. See docs/AVT_masked_garment_swap_LOCKED.md.
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
      // VTON keeps the hero frame's real face (it only transfers garment), so
      // no generative identity pass is needed — running one would only corrupt
      // the face. The deterministic restore is still worth running: VTON warps
      // the whole frame slightly, so his head drifts even though it isn't
      // re-invented.
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
 * GUARDED GROK — Grok's garment, the masked lane's identity guarantee.
 *
 * Exported separately so it can be run on its own (or dropped from the default
 * matrix in one line) while `flux-general/inpainting` — the only engine with an
 * ip_adapters field, and therefore the only one that can consume the Grok render
 * as a reference — is still hanging. A failure here is contained: each candidate
 * runs in its own try/catch, so this lane erroring leaves the others intact. The
 * cost of leaving it enabled while flux-general is sick is wall-clock, not
 * correctness — the run burns the 15-minute flux cap before failing that one
 * candidate.
 */
export const GUARDED_GROK_PLAN: HeroCandidatePlan = {
  lane: "guarded_grok",
  label: "Guarded Grok · Grok garment + masked identity guard",
  runIdentity: false,
  // The generative face-swap is NOT needed here, unlike the raw Grok lane: no
  // Grok pixel ever reaches the output, so there is no reconstructed face to
  // paper over. The deterministic restore still runs, as it does everywhere.
  runFaceRestore: true,
};

/**
 * Default candidate matrix, in the order they run.
 *
 * 1. MASKED INPAINT is the primary lane — the only one where the face and
 *    background are preserved by construction rather than by asking a model
 *    nicely.
 * 2. IDM-VTON is the declared fallback: pose-preserving try-on, same
 *    deterministic head restore, for when the masked inpaint underperforms on
 *    garment fidelity.
 * 3. GROK is kept as a selectable comparison. It is no longer primary — it
 *    re-renders every pixel through xAI's /v1/images/edits, which takes no mask,
 *    so its face is a reconstruction that the restore has to paper over.
 */
export const HERO_CANDIDATE_PLANS: HeroCandidatePlan[] = [
  {
    lane: "masked_inpaint",
    label: "Masked Inpaint · Garment-only (primary)",
    runIdentity: false,
    runFaceRestore: true,
    // flux-general is the engine that accepts ip_adapters, i.e. the only one
    // that can actually see the Saint Laurent reference rather than inferring
    // the jacket from text. If it starts 502-ing again (its documented failure
    // mode), set JACKET_INPAINT_MODEL=flux-lora on AVT — the run degrades to a
    // text-only garment, which is softer but still correctly masked.
    inpaintModelKey: "flux-general",
  },
  GUARDED_GROK_PLAN,
  {
    lane: "vton",
    transferMode: "full_look",
    vtonModel: "idm-vton",
    label: "Full-look · IDM-VTON (fallback)",
    runIdentity: false,
    runFaceRestore: true,
  },
  {
    // Grok re-renders the head even with the pose/identity-locked prompt, so the
    // identity pass is mandatory for this lane, not an optional variant. The old
    // matrix ran this plan with runIdentity:false plus a separate "+ Identity"
    // twin; the un-locked twin is what shipped Fendi a reconstructed face, so it
    // is gone and the pass is always on here.
    lane: "grok_image_edit",
    label: "Grok Image-Edit · Garment-Truth (identity-locked)",
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
   * succeeded. This is the one to look at — the generative identity pass alone
   * still hands back a reconstructed face. Null when the lane skips it or when
   * detection refused (see faceRestoreError).
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
