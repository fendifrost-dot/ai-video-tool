// Provider capability configuration — limits that belong to a provider/endpoint, not to a
// creative choice and not to a project. ChatGPT ruling 2026-09-21 §3: "Move provider reference
// limits toward provider-capability configuration; temporary safety ceiling of 8 is acceptable."
//
// Resolution: built-in defaults below (endpoint, then model-specific)  <  PROVIDER_CAPABILITIES_JSON
// (an edge-function secret, read at request time so a change needs no redeploy; endpoint entry,
// then model entry)  →  clamped by the code safety ceiling.
// The safety ceiling stays in code only until the provider's real limit has been verified
// against its contract; raising it is a deliberate, reviewed change.

export type ProviderCapability = {
  /** Maximum reference images the endpoint accepts alongside the source media. */
  maxReferenceImages: number;
  /** Whether the endpoint accepts an image that conditions the FIRST FRAME / canonical
   *  appearance of the subject (as opposed to garment references). null = not yet verified. */
  firstFrameConditioning: boolean | null;
  /** Maximum prompt length the endpoint accepts, in characters (null = not verified). The
   *  proxies compare the COMPOSED prompt (Look constraints + client prompt + Look spec) against it
   *  and fail closed before calling the provider. */
  maxPromptChars: number | null;
  /** Human note on where the numbers come from. */
  source: string;
};

/**
 * Default reference-image ceiling for any address without a specific one.
 *
 * The ceiling exists to bound an UNVERIFIED number — it is what stops a bad override or an
 * unproven default from spending on a request the provider would reject. So it has to
 * resolve where capability resolves: at provider + operation + model. A single global
 * ceiling briefly made Seedance 2.5's documented 30 the bound for every address, which
 * would have let an override push xAI video edits (themselves unverified above 5) to 30.
 * A documented capability on one model must never loosen the bound on another.
 */
export const SAFETY_MAX_REFERENCE_IMAGES = 8;

/**
 * Ceilings that differ from the default, keyed exactly like DEFAULTS:
 * "<provider>:<operation>" or "<provider>:<operation>:<model>". Most specific wins.
 * Raising one is a deliberate, reviewed change and should cite the evidence.
 */
export const SAFETY_CEILINGS: Record<string, number> = {
  // Runway documents 30 image references for Seedance 2.5 mode=edit. Scoped to that model
  // so it bounds nothing else — not even Runway's other video_to_video models.
  "runway:video_to_video:seedance2_5": 30,
};

/** Resolve the ceiling for an address: model entry, then endpoint entry, then the default. */
export function safetyCeilingFor(key: string, model?: string | null): number {
  const modelKey = model ? `${key}:${model}` : null;
  if (modelKey && Object.prototype.hasOwnProperty.call(SAFETY_CEILINGS, modelKey)) return SAFETY_CEILINGS[modelKey];
  if (Object.prototype.hasOwnProperty.call(SAFETY_CEILINGS, key)) return SAFETY_CEILINGS[key];
  return SAFETY_MAX_REFERENCE_IMAGES;
}

// Keys are "<provider>:<operation>" for an endpoint default and "<provider>:<operation>:<model>" for
// a model-specific override. Limits belong to the exact model: the same endpoint served
// grok-imagine-image-quality (3 source images, verified) and grok-imagine-image-2.0 (5, per the
// 2026-08-28 release note), so a per-endpoint constant was wrong for one of them.
const DEFAULTS: Record<string, ProviderCapability> = {
  "xai:images/edits": {
    maxReferenceImages: 3,
    firstFrameConditioning: true,
    maxPromptChars: null,
    source: "endpoint default = the most conservative model on it (grok-imagine-image-quality: 3, verified 2026-09-21). <IMAGE_0> is the edited frame, so a Look-on-artist anchor can be sent as <IMAGE_1>",
  },
  "xai:images/edits:grok-imagine-image-quality": {
    maxReferenceImages: 3,
    firstFrameConditioning: true,
    maxPromptChars: null,
    source: "VERIFIED 2026-09-21: rejects >3 input images ('This model supports at most 3 input image(s)'). Retired 2026-11-02 — requests are then served by grok-imagine-image-2.0 (docs.x.ai migration note, 2026-09-02)",
  },
  "xai:images/edits:grok-imagine-image-2.0": {
    maxReferenceImages: 5,
    firstFrameConditioning: true,
    maxPromptChars: null,
    source: "docs.x.ai release notes 2026-08-28: 'Image editing now accepts up to 5 source images per request (was 3)'; not yet verified against the API by AVT",
  },
  "xai:videos/edits": {
    maxReferenceImages: 8,
    firstFrameConditioning: null,
    maxPromptChars: 4096,
    source: "observed: 5 references accepted on 2026-09-21 (full_look, request 296ee0ca lineage, model grok-imagine-video); provider maximum not yet verified. VERIFIED 2026-09-22: prompt longer than 4096 characters is rejected ('Prompt length exceeds the maximum allowed length of 4096'), unbilled",
  },
  "runway:video_to_video": {
    maxReferenceImages: 0,
    firstFrameConditioning: null,
    maxPromptChars: 1000,
    source: "endpoint default = the most conservative edit model on it (aleph2: no image references, keyframes instead, prompt ≤ 1000)",
  },
  "runway:video_to_video:aleph2": {
    maxReferenceImages: 0,
    firstFrameConditioning: true,
    maxPromptChars: 1000,
    source: "docs.dev.runwayml.com OpenAPI 2026-09-23: videoUri ≤ 30 s, promptText ≤ 1000, keyframes ≤ 5 timed guidance images ('Edit one frame and Aleph 2.0 modifies the rest of your video to match'); 28 credits/s, 56 minimum",
  },
  "runway:video_to_video:gemini_omni_flash_1.1": {
    maxReferenceImages: 5,
    firstFrameConditioning: null,
    maxPromptChars: 4000,
    source: "docs.dev.runwayml.com OpenAPI 2026-09-23: mode=edit transforms the input video per the prompt with up to 5 image references; input ≤ 10 s; 10 credits/s",
  },
  "runway:video_to_video:seedance2_5": {
    maxReferenceImages: 30,
    firstFrameConditioning: null,
    maxPromptChars: 15000,
    source: "docs.dev.runwayml.com OpenAPI 2026-09-23: mode=edit modifies the input video in place with up to 30 image references; input ≤ 10 s; 720p 30 credits/s + 15 credits/s input",
  },
  "xai:videos/generations:grok-imagine-video-1.5": {
    maxReferenceImages: 7,
    firstFrameConditioning: false,
    maxPromptChars: null,
    source: "docs.x.ai reference-to-video (grok-imagine-video-1.5): up to 7 reference images that guide a GENERATED video without forcing the first frame; 'cannot be combined with video editing' — not a video-edit conditioning path",
  },
};

type EnvLike = { get(name: string): string | undefined };

function parseOverrides(env: EnvLike | undefined): Record<string, Partial<ProviderCapability>> {
  const raw = env?.get("PROVIDER_CAPABILITIES_JSON");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Partial<ProviderCapability>>) : {};
  } catch {
    return {};
  }
}

/** `key` is "<provider>:<operation>", e.g. "xai:videos/edits"; with `model` the model-specific entry
 *  "<key>:<model>" is used when one exists (built-in or via PROVIDER_CAPABILITIES_JSON), else the
 *  endpoint default. Unknown keys get conservative defaults. */
export function getProviderCapability(key: string, env: EnvLike | undefined = typeof Deno !== "undefined" ? Deno.env : undefined, model?: string | null): ProviderCapability {
  const overrides = parseOverrides(env);
  const modelKey = model ? `${key}:${model}` : null;
  const base = (modelKey && DEFAULTS[modelKey]) || DEFAULTS[key] || { maxReferenceImages: 1, firstFrameConditioning: null, maxPromptChars: null, source: "unknown provider — conservative default" };
  const o = { ...(overrides[key] ?? {}), ...((modelKey && overrides[modelKey]) ?? {}) };
  const max = Number(o.maxReferenceImages);
  const maxPrompt = Number(o.maxPromptChars);
  return {
    // 0 is a legitimate value (a model that takes no image references, e.g. keyframe-guided editors)
    maxReferenceImages: Math.max(0, Math.min(Number.isFinite(max) && max >= 0 ? Math.floor(max) : base.maxReferenceImages, safetyCeilingFor(key, model))),
    firstFrameConditioning: typeof o.firstFrameConditioning === "boolean" ? o.firstFrameConditioning : base.firstFrameConditioning,
    maxPromptChars: Number.isFinite(maxPrompt) && maxPrompt >= 1 ? Math.floor(maxPrompt) : base.maxPromptChars,
    source: typeof o.source === "string" && o.source ? o.source : base.source,
  };
}
