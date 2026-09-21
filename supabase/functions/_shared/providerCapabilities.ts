// Provider capability configuration — limits that belong to a provider/endpoint, not to a
// creative choice and not to a project. ChatGPT ruling 2026-09-21 §3: "Move provider reference
// limits toward provider-capability configuration; temporary safety ceiling of 8 is acceptable."
//
// Resolution: built-in defaults below  <  PROVIDER_CAPABILITIES_JSON (an edge-function secret,
// read at request time so a change needs no redeploy)  →  clamped by the code safety ceiling.
// The safety ceiling stays in code only until the provider's real limit has been verified
// against its contract; raising it is a deliberate, reviewed change.

export type ProviderCapability = {
  /** Maximum reference images the endpoint accepts alongside the source media. */
  maxReferenceImages: number;
  /** Whether the endpoint accepts an image that conditions the FIRST FRAME / canonical
   *  appearance of the subject (as opposed to garment references). null = not yet verified. */
  firstFrameConditioning: boolean | null;
  /** Human note on where the numbers come from. */
  source: string;
};

export const SAFETY_MAX_REFERENCE_IMAGES = 8;

const DEFAULTS: Record<string, ProviderCapability> = {
  "xai:images/edits": {
    maxReferenceImages: 5,
    firstFrameConditioning: true,
    source: "docs.x.ai multi-image editing: images[] max 5 per request; <IMAGE_0> is the edited frame, so a Look-on-artist anchor can be sent as <IMAGE_1>",
  },
  "xai:videos/edits": {
    maxReferenceImages: 8,
    firstFrameConditioning: null,
    source: "observed: 5 references accepted on 2026-09-21 (full_look, request 296ee0ca lineage); provider maximum not yet verified",
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

/** `key` is "<provider>:<endpoint>", e.g. "xai:videos/edits". Unknown keys get conservative defaults. */
export function getProviderCapability(key: string, env: EnvLike | undefined = typeof Deno !== "undefined" ? Deno.env : undefined): ProviderCapability {
  const base = DEFAULTS[key] ?? { maxReferenceImages: 1, firstFrameConditioning: null, source: "unknown provider — conservative default" };
  const o = parseOverrides(env)[key] ?? {};
  const max = Number(o.maxReferenceImages);
  return {
    maxReferenceImages: Math.max(1, Math.min(Number.isFinite(max) && max >= 1 ? Math.floor(max) : base.maxReferenceImages, SAFETY_MAX_REFERENCE_IMAGES)),
    firstFrameConditioning: typeof o.firstFrameConditioning === "boolean" ? o.firstFrameConditioning : base.firstFrameConditioning,
    source: typeof o.source === "string" && o.source ? o.source : base.source,
  };
}
