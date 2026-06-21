export type HeroTransferMode = "full_look" | "jacket_only";

export type HeroCandidatePlan = {
  transferMode: HeroTransferMode;
  vtonModel: "idm-vton" | "cat-vton";
  label: string;
};

/** Default A/B matrix for Phase 1 hero-frame generation. */
export const HERO_CANDIDATE_PLANS: HeroCandidatePlan[] = [
  { transferMode: "full_look", vtonModel: "idm-vton", label: "Full-look · IDM-VTON" },
  { transferMode: "full_look", vtonModel: "cat-vton", label: "Full-look · CatVTON" },
  { transferMode: "jacket_only", vtonModel: "idm-vton", label: "Jacket-only · IDM-VTON" },
  { transferMode: "jacket_only", vtonModel: "cat-vton", label: "Jacket-only · CatVTON" },
];

export type HeroCandidateResult = {
  plan: HeroCandidatePlan;
  index: number;
  vtonLookId: string;
  identityLookId: string;
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
    transfer_mode: HeroTransferMode;
    vton_look_id: string;
    identity_look_id: string;
  }>;
};
