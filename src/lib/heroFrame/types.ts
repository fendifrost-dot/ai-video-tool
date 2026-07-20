export type HeroTransferMode = "full_look" | "jacket_only";

export type HeroCandidateLane = "vton" | "grok_image_edit";

export type HeroCandidatePlan =
  | {
      lane: "vton";
      transferMode: HeroTransferMode;
      vtonModel: "idm-vton" | "cat-vton";
      label: string;
      // VTON keeps the hero frame's real face (it only transfers garment), so
      // no identity pass is needed — running one would only corrupt the face.
      runIdentity: false;
    }
  | {
      lane: "grok_image_edit";
      label: string;
      runIdentity: boolean;
    };

/** Default candidate matrix — IDM baseline + Grok garment-truth + CatVTON comparison. */
export const HERO_CANDIDATE_PLANS: HeroCandidatePlan[] = [
  {
    lane: "vton",
    transferMode: "full_look",
    vtonModel: "idm-vton",
    label: "Full-look · IDM-VTON (baseline)",
    runIdentity: false,
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
  },
  {
    lane: "vton",
    transferMode: "full_look",
    vtonModel: "cat-vton",
    label: "Full-look · CatVTON",
    runIdentity: false,
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
