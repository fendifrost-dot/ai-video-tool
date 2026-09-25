// Pose-locked hero contract (handoff rev 32, ChatGPT directive 2026-09-25 "POSE-LOCKED HERO CONTRACT").
//
// Architecture C carries a garment realisation ±(a few) frames; the generator must therefore
// produce CANONICAL GARMENT TRUTH IN THE EXACT POSE OF THE REAL PERFORMANCE at scheduled anchor
// frames. This module is the provider-neutral surface for that step:
//
//   generatePoseLockedHero(sourceFrame, canonicalLook, productReferences, identityReferences, constraints)
//
// It owns (1) the POSE-LOCK LAW as prompt constraints composed FIRST (same rule as the video lane's
// constraints-first composition), (2) the registry of hero MECHANISMS with the evidence behind each
// one, (3) provider selection by evidence, and (4) the request builder that routes one abstract
// request to the existing edge function that implements the mechanism. Nothing here calls a
// provider; the existing proxies do, and every candidate they return is judged by the
// deterministic gate (`scripts/qa/hero_gate.py`) before Architecture C may carry it.
//
// The product architecture is NOT encoded around one model: a new mechanism is a registry row.

import { composeConstraintsFirst } from "./lookReferences.ts";

/** What the generator MAY NOT change — the pose-lock law, as constraints the prompt states first. */
export const POSE_LOCK_CONSTRAINTS: readonly string[] = [
  "This is a LOCAL CLOTHING EDIT of the source photo, not a new photograph",
  "Keep the person's identity, face, expression, head position and gaze exactly as in the source",
  "Keep the torso, shoulders, both arms, both hands, both legs and the whole body silhouette exactly where they are in the source",
  "Keep the camera framing, perspective and background exactly as in the source",
  "Change ONLY the garment: its construction, material, details and the shading needed to sit in the source lighting",
  "Do not solve garment placement by moving or re-posing the person",
];

/** How a mechanism holds the source geometry. Ordered from strongest guarantee to none. */
export type PoseLockMechanism =
  | "mask" // pixels outside a garment mask are the source's own — geometry is held by construction
  | "try_on" // virtual try-on: person image + garment image, the model keeps the person
  | "prompt" // whole-image edit; the pose is held only as well as the model obeys the prompt
  | "none"; // reference-driven generation: the source frame is one reference among others

export type HeroProviderId =
  | "fal_inpaint_masked"
  | "fal_vton"
  | "xai_image_edit"
  | "runway_image_reference";

export type HeroProviderSpec = {
  id: HeroProviderId;
  /** AVT edge function that implements the mechanism today (the provider key never leaves it / Control Center). */
  edgeFunction: string;
  mechanism: PoseLockMechanism;
  /** Verified state of the lane in this repo. */
  status: "available" | "unverified" | "retired";
  /** Evidence on record for geometry (pose lock) and for garment truth — dated, from the results docs. */
  geometryEvidence: string;
  garmentEvidence: string;
  /** Approximate cost per candidate still, USD (null = not measured). */
  costUsdPerCandidate: number | null;
  /** Provider capability key (see providerCapabilities.ts) when the lane has one. */
  capabilityKey: string | null;
};

export const HERO_PROVIDERS: Record<HeroProviderId, HeroProviderSpec> = {
  fal_inpaint_masked: {
    id: "fal_inpaint_masked",
    edgeFunction: "jacket-inpaint-proxy",
    mechanism: "mask",
    status: "available",
    geometryEvidence:
      "SAM-3 garment mask + fal inpainting (flux-lora/inpainting; flux-general + IP-Adapter behind JACKET_INPAINT_MODEL): every pixel outside the mask is the source frame, so pose, face, hands, framing are held by construction (jacketInpaintPipeline.ts).",
    garmentEvidence:
      "Guarded-Grok chain (2026-07/08): garment appearance had to come from a Grok render carried through IP-Adapter; flux-general timed out at ~946 s (avt-flux-inpaint-timeout); construction fidelity from the inpainter alone unproven against the anchor.",
    costUsdPerCandidate: 0.05,
    capabilityKey: null,
  },
  fal_vton: {
    id: "fal_vton",
    edgeFunction: "wardrobe-vton-proxy",
    mechanism: "try_on",
    status: "available",
    geometryEvidence:
      "IDM-VTON / CAT-VTON keep the person image and paint the garment on it (vton-frame action via Control Center); pose and identity held in the 2026-08-17 Grok-vs-Kolors head-to-head.",
    garmentEvidence:
      "2026-08-17/18 verdict: garment topology FAILS (seams, band, brand on a deforming worn garment) — try-on models render a flat garment image, not the approved realisation.",
    costUsdPerCandidate: 0.1,
    capabilityKey: null,
  },
  xai_image_edit: {
    id: "xai_image_edit",
    edgeFunction: "grok-image-garment-proxy",
    mechanism: "prompt",
    status: "available",
    geometryEvidence:
      "E2 (2026-09-21, 14 anchored stills on S06, $1.68): garment reproduced but arms re-posed and the face turned frontal in most stills — the hero gate now fails every one of them on pose lock (hero_gate_calibration, 2026-09-25). docs.x.ai lists no mask and no pose-preservation parameter for /v1/images/edits.",
    garmentEvidence:
      "Best garment truth of any lane: with the approved Look-on-artist anchor as <IMAGE_1> the stills reproduce ONE realisation (anchor similarity 0.74 mean, spread 0.11).",
    costUsdPerCandidate: 0.12,
    capabilityKey: "xai:images/edits",
  },
  runway_image_reference: {
    id: "runway_image_reference",
    edgeFunction: "proxy-provider-call",
    mechanism: "none",
    status: "unverified",
    geometryEvidence:
      "Runway text_to_image (gen4_image, gen4_image_turbo, gemini_2.5_flash) takes up to 3 tagged reference images composed by prompt (@tag); the docs describe composition guidance, not editing of an input photo — the source frame would be a reference, not a lock. No AVT/Control Center function exposes it yet.",
    garmentEvidence: "Untested in this project.",
    costUsdPerCandidate: 0.05,
    capabilityKey: null,
  },
};

const MECHANISM_RANK: Record<PoseLockMechanism, number> = { mask: 3, try_on: 2, prompt: 1, none: 0 };

/**
 * Providers ranked for a pose-locked hero: strongest geometry guarantee first, then lowest cost.
 * Retired lanes are excluded; unverified ones are kept but sort last inside their mechanism.
 */
export function rankHeroProviders(specs: Record<HeroProviderId, HeroProviderSpec> = HERO_PROVIDERS): HeroProviderSpec[] {
  return Object.values(specs)
    .filter((s) => s.status !== "retired")
    .sort((a, b) =>
      MECHANISM_RANK[b.mechanism] - MECHANISM_RANK[a.mechanism] ||
      (a.status === "unverified" ? 1 : 0) - (b.status === "unverified" ? 1 : 0) ||
      (a.costUsdPerCandidate ?? Infinity) - (b.costUsdPerCandidate ?? Infinity)
    );
}

export type StorageRef = { bucket: string; path: string };

export type PoseLockedHeroRequest = {
  artistId: string;
  projectId?: string;
  /** The real performance frame the hero must be minted ON (exported by scripts/edit/hero_schedule.py). */
  sourceFrame: StorageRef;
  sourceShotId?: string;
  sourceFrameIndex?: number;
  /** The composed Look (artist_looks.id) — the truth hierarchy (outfit sheet → hero refs → …) resolves from it. */
  lookId: string;
  /** The Look's hero piece (wardrobe feature id) for lanes whose contract names one garment. */
  primaryWardrobeFeatureId?: string;
  /** The APPROVED Look-on-artist realisation: the only garment truth (canonical Look > product imagery). */
  canonicalLook: StorageRef;
  /** Product photos for construction detail, in truth-hierarchy order. */
  productReferences: StorageRef[];
  /** Identity references (the performer's own face) for mechanisms that accept them. */
  identityReferences: StorageRef[];
  /** Garment construction facts stated first (from the Look's `constraints`). */
  constraints: string[];
  /** Descriptive body of the prompt (Look spec last, per the composition rule). */
  promptBody?: string;
  provider?: HeroProviderId;
  candidates?: number;
  heroFrameSessionId?: string;
  /** For masked mechanisms: a precomputed garment mask (SAM-3); otherwise the proxy segments. */
  garmentMask?: StorageRef;
};

export type BuiltHeroRequest = {
  provider: HeroProviderId;
  edgeFunction: string;
  mechanism: PoseLockMechanism;
  /** Body for the edge function, in that function's own contract. */
  body: Record<string, unknown>;
  /** The composed prompt (pose-lock law first, garment constraints next, body last) where the mechanism takes one. */
  prompt: string | null;
};

/** Compose: POSE-LOCK LAW first, then the Look's construction constraints, then the descriptive body. */
export function composeHeroPrompt(constraints: readonly string[], body: string): string {
  return composeConstraintsFirst([...POSE_LOCK_CONSTRAINTS, ...constraints], body);
}

/**
 * Route one abstract request to the edge function that implements the chosen (or best-ranked)
 * mechanism. Field names follow each proxy's own Body type; nothing provider-specific is decided
 * here beyond that mapping.
 */
export function buildHeroRequest(req: PoseLockedHeroRequest, specs: Record<HeroProviderId, HeroProviderSpec> = HERO_PROVIDERS): BuiltHeroRequest {
  const provider = req.provider ?? rankHeroProviders(specs).find((s) => s.status === "available")?.id;
  if (!provider) throw new Error("no available hero provider");
  const spec = specs[provider];
  if (!spec) throw new Error(`unknown hero provider ${provider}`);
  const prompt = composeHeroPrompt(req.constraints, req.promptBody ?? "");
  const common = {
    artistId: req.artistId,
    projectId: req.projectId,
    heroFrameSessionId: req.heroFrameSessionId,
    sceneBucket: req.sourceFrame.bucket,
    scenePath: req.sourceFrame.path,
    name: req.sourceShotId != null && req.sourceFrameIndex != null ? `hero ${req.sourceShotId} f${req.sourceFrameIndex}` : undefined,
  };
  switch (provider) {
    case "xai_image_edit":
      return {
        provider, edgeFunction: spec.edgeFunction, mechanism: spec.mechanism, prompt,
        body: {
          ...common,
          lookId: req.lookId,
          referenceMode: "full_look",
          anchorBucket: req.canonicalLook.bucket,
          anchorPath: req.canonicalLook.path,
          prompt,
          promptVersion: "pose-locked-hero-v1",
          candidateIndex: 0,
        },
      };
    case "fal_vton":
      if (!req.primaryWardrobeFeatureId) throw new Error("fal_vton needs primaryWardrobeFeatureId (the Look's hero piece)");
      return {
        provider, edgeFunction: spec.edgeFunction, mechanism: spec.mechanism, prompt: null,
        body: { ...common, wardrobeFeatureId: req.primaryWardrobeFeatureId, transferMode: "full_look", heroFrameCandidate: true, candidateIndex: 0 },
      };
    case "fal_inpaint_masked":
      // jacket-inpaint-proxy's SubmitBody (2026-09): the garment is named by its wardrobe feature,
      // the mask comes from its own SAM-3 pass (maskPrompt), the appearance from the prompt /
      // IP-Adapter. The approved realisation as a conditioning image is NOT a field of that proxy
      // yet — recorded as the gap to close before this lane can meet the garment-truth law.
      if (!req.primaryWardrobeFeatureId) throw new Error("fal_inpaint_masked needs primaryWardrobeFeatureId (the Look's hero piece)");
      return {
        provider, edgeFunction: spec.edgeFunction, mechanism: spec.mechanism, prompt,
        body: {
          ...common,
          wardrobeFeatureId: req.primaryWardrobeFeatureId,
          prompt,
          controlnet: "pose",
          faceGuard: true,
          candidateIndex: 0,
        },
      };
    case "runway_image_reference":
      return {
        provider, edgeFunction: spec.edgeFunction, mechanism: spec.mechanism, prompt,
        body: {
          endpoint: "video-providers-runway-generate",
          method: "POST",
          body: {
            kind: "image",
            promptText: prompt,
            referenceImages: [
              { tag: "source", ref: req.sourceFrame },
              { tag: "look", ref: req.canonicalLook },
              ...req.productReferences.slice(0, 1).map((r) => ({ tag: "product", ref: r })),
            ],
          },
        },
      };
  }
}

/**
 * What the deterministic gate must confirm before a candidate becomes a hero. Mirrors
 * scripts/qa/hero_gate.py (the thresholds live there, as data); listed here so the contract
 * is complete on the product side.
 */
export const HERO_GATE_CHECKS = ["pose", "identity", "silhouette", "construction", "material", "anatomy"] as const;
export const HERO_GATE_RULE = "FAIL if pose lock fails (pose landmarks AND face unchanged); otherwise PASS only if every check passes";
