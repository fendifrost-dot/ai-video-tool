// Capability registry — what a PROVIDER / MODEL / OPERATION combination can actually do.
//
// WHY THIS EXISTS
// ---------------
// AVT had capability truth in three unrelated places, keyed three different ways:
//
//   1. `provider_capabilities` (DB table, migration 20260516200000) — keyed by PROVIDER
//      alone. Creative guidance for the compiler/PromptBuilder (strengths, weaknesses,
//      recommended shot types) plus a few hard limits.
//   2. `providerCapabilities.ts` (this directory) — keyed by "<provider>:<endpoint>".
//      Hard limits the edge proxies enforce before spending money.
//   3. `src/lib/providers/types.ts` — a per-provider-CLASS union of feature flags
//      ("image_to_video", "upscale", …) used to decide which UI buttons to show.
//
// None of them can express "grok-imagine-image-quality takes 3 reference images but
// grok-imagine-image-2.0 takes 5" — and that exact ambiguity produced a real incident:
// `main` said 3, the deployed constant said 5, and nobody could say which model each
// number applied to. Provider limits are a property of a MODEL and an OPERATION, not
// of a vendor. This module is keyed that way.
//
// WHAT THIS MODULE IS NOT
// -----------------------
// It does NOT rank providers. "Runway > xAI" is not a capability, it is an evidence
// claim, and evidence for it does not exist yet. The registry answers "can it?" and
// "within what limits?". Which provider to USE for a given ShotSpec is a separate,
// benchmark-driven decision — see docs/PROVIDER_CAPABILITY_REGISTRY.md §"Selection".
//
// SCOPE NOTE (2026-09-23)
// -----------------------
// `providerCapabilities.ts` is live in two proxies and is being edited in the YSL
// production lane. This module does NOT modify it. `capabilityRegistry.compat.test.ts`
// asserts the two agree on every overlapping fact, so the duplication cannot drift
// silently while the delegation in docs/PROVIDER_CAPABILITY_REGISTRY.md §"Integration"
// is pending.

// ---------------------------------------------------------------------------
// Verification — documentation and a live 400 are NOT the same evidence.
// ---------------------------------------------------------------------------

/** Declared evidence class for a capability fact. `STALE` is never declared — it is derived. */
export const VERIFICATION_STATUSES = [
  "LIVE_VERIFIED",
  "DOCUMENTED",
  "INFERRED",
  "UNKNOWN",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** What a caller sees after age is taken into account. */
export type EffectiveStatus = VerificationStatus | "STALE";

/**
 * How long a fact of each class stays trustworthy, in days. Providers change models
 * under a fixed name, so every class ages — a LIVE_VERIFIED fact just ages slower.
 * `UNKNOWN` never goes stale because there is nothing to go stale.
 */
export const DEFAULT_STALENESS_DAYS: Record<VerificationStatus, number | null> = {
  LIVE_VERIFIED: 90,
  DOCUMENTED: 60,
  INFERRED: 30,
  UNKNOWN: null,
};

/** `null` means "not verified either way" — deliberately distinct from `false`. */
export type Supported = boolean | null;

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

export type PricingMeta = {
  /** What one unit costs, in USD. `null` when the shape is known but the rate is not. */
  usdPerUnit: number | null;
  /** What a unit IS: "image", "second_of_output", "request", "megapixel", … */
  unit: string;
  note?: string;
};

export type FpsConstraint = {
  /** Exact frame rates the operation accepts, when it is a fixed list. */
  supported?: number[] | null;
  min?: number | null;
  max?: number | null;
};

export type AudioCapability = {
  /** The operation can EMIT audio. */
  output?: Supported;
  /** A source clip's audio survives the operation (relevant to */
  preservesSourceAudio?: Supported;
};

/**
 * One capability fact-set for a (provider, model, operation) address.
 *
 * Every field except the address and the provenance block is optional, and an absent
 * field means "this record says nothing about it" — which is NOT the same as `null`
 * ("this record says it is unverified"). The distinction matters during merge: absent
 * fields inherit from a broader record, `null` fields do not.
 */
export type CapabilityRecord = {
  // -- address -------------------------------------------------------------
  provider: string;
  /**
   * Exact model id, a trailing-`*` family pattern ("grok-imagine-image-*"), or `"*"`
   * for every model this provider exposes on the operation.
   */
  model: string;
  /** `<media>/<action>`, matching the provider's own route where one exists. */
  operation: string;

  // -- input modalities ----------------------------------------------------
  textInput?: Supported;
  imageInput?: Supported;
  videoInput?: Supported;
  audioInput?: Supported;

  // -- conditioning --------------------------------------------------------
  /** Edits an existing source video rather than generating from scratch. */
  sourceVideoEditing?: Supported;
  /** Accepts still images that steer appearance (garment/identity references). */
  imageReferenceConditioning?: Supported;
  /** Accepts a video as a style/motion reference. */
  videoReferenceConditioning?: Supported;
  /** Accepts a pinned first/keyframe that the output must start from. */
  keyframeConditioning?: Supported;

  // -- numeric limits (null = unknown) -------------------------------------
  maxReferenceImages?: number | null;
  maxPromptChars?: number | null;
  maxInputDurationSeconds?: number | null;
  maxOutputDurationSeconds?: number | null;

  // -- format --------------------------------------------------------------
  supportedResolutions?: string[] | null;
  nativeOutputResolution?: string | null;
  aspectRatios?: string[] | null;
  fps?: FpsConstraint | null;
  audio?: AudioCapability | null;
  /** Straight alpha / transparency in the output. */
  alpha?: Supported;
  outputFormats?: string[] | null;
  /** Mezzanine/intermediate delivery — ProRes, DNxHR, image sequences. */
  intermediateFormats?: string[] | null;
  bitDepth?: number | null;
  hdr?: Supported;

  // -- execution -----------------------------------------------------------
  /** Returns a job to poll rather than the artifact itself. */
  asyncOperation?: Supported;
  pricing?: PricingMeta | null;

  // -- provenance (required: a fact without a source is not a fact) ---------
  status: VerificationStatus;
  /** ISO-8601 date the fact was established. `null` only for UNKNOWN. */
  verifiedAt: string | null;
  /** Where the fact comes from, specifically enough to re-check it. */
  source: string;
  /** Request id, error string, or doc URL that proves it. */
  evidence?: string | null;
  /**
   * Per-field provenance, overriding the record-level block for those fields.
   *
   * Evidence is a property of a FACT, not of a record. One address routinely carries
   * facts of different classes: xai `videos/edits` has a prompt limit proven by a live
   * 400 sitting next to a reference ceiling nobody has ever verified. Collapsing both
   * into one record-level status is how the legacy file ended up with a single `source`
   * string that had to narrate two different evidence classes in prose.
   */
  fieldProvenance?: Partial<Record<CapabilityField, RecordProvenance>>;
};

/** The provenance block, usable at record level or per field. */
export type RecordProvenance = {
  status: VerificationStatus;
  verifiedAt: string | null;
  source: string;
  evidence?: string | null;
};

/** Fields that carry capability facts (everything except the address and provenance). */
export type CapabilityField = Exclude<
  keyof CapabilityRecord,
  | "provider"
  | "model"
  | "operation"
  | "status"
  | "verifiedAt"
  | "source"
  | "evidence"
  | "fieldProvenance"
>;

const CAPABILITY_FIELDS: CapabilityField[] = [
  "textInput",
  "imageInput",
  "videoInput",
  "audioInput",
  "sourceVideoEditing",
  "imageReferenceConditioning",
  "videoReferenceConditioning",
  "keyframeConditioning",
  "maxReferenceImages",
  "maxPromptChars",
  "maxInputDurationSeconds",
  "maxOutputDurationSeconds",
  "supportedResolutions",
  "nativeOutputResolution",
  "aspectRatios",
  "fps",
  "audio",
  "alpha",
  "outputFormats",
  "intermediateFormats",
  "bitDepth",
  "hdr",
  "asyncOperation",
  "pricing",
];

// ---------------------------------------------------------------------------
// Safety ceilings — enforced in code, above any data source.
// ---------------------------------------------------------------------------

/**
 * Hard cap on reference images regardless of what any record or override claims.
 * Mirrors `providerCapabilities.SAFETY_MAX_REFERENCE_IMAGES`; the two must stay equal
 * (asserted in capabilityRegistry.compat.test.ts). Raising it is a reviewed change.
 */
export const SAFETY_MAX_REFERENCE_IMAGES = 8;

/** What an unmatched address resolves to. Conservative by construction. */
const UNKNOWN_DEFAULTS: Pick<CapabilityRecord, "maxReferenceImages"> = {
  // One reference is the weakest non-zero assumption: enough to not break a
  // single-reference call, never enough to silently spend on a multi-reference one.
  maxReferenceImages: 1,
};

// ---------------------------------------------------------------------------
// Seed records
// ---------------------------------------------------------------------------

/**
 * Built-in facts. Every entry traces to evidence already in this repo — nothing here
 * is recalled from memory (CLAUDE.md, "Engineering principles").
 *
 * Providers AVT has not exercised (Runway, Veo, Pika, Higgsfield, OpenAI, Google) are
 * deliberately absent rather than guessed: an absent address resolves to UNKNOWN and
 * fails closed, which is honest. The `provider_capabilities` DB table holds the
 * compiler's creative guidance for those vendors and is not a hard-constraint source.
 */
export const BUILTIN_RECORDS: CapabilityRecord[] = [
  // -- xAI · image edits ---------------------------------------------------
  {
    provider: "xai",
    model: "*",
    operation: "images/edits",
    textInput: true,
    imageInput: true,
    imageReferenceConditioning: true,
    // The conservative member of the family. grok-imagine-image-2.0 documents 5, but a
    // provider-wide default must hold for the model we actually proved.
    maxReferenceImages: 3,
    asyncOperation: false,
    status: "LIVE_VERIFIED",
    verifiedAt: "2026-09-21",
    source:
      "providerCapabilities.ts 'xai:images/edits' (commit 378b641). <IMAGE_0> is the edited frame, so a Look-on-artist anchor is sent as <IMAGE_1>.",
    evidence: "provider 400: 'This model supports at most 3 input image(s)'",
  },
  {
    provider: "xai",
    model: "grok-imagine-image-quality",
    operation: "images/edits",
    maxReferenceImages: 3,
    status: "LIVE_VERIFIED",
    verifiedAt: "2026-09-21",
    source: "E2 hero-stills round, 14 anchored stills on S06",
    evidence: "provider 400: 'This model supports at most 3 input image(s)'",
  },
  {
    provider: "xai",
    model: "grok-imagine-image-2.0",
    operation: "images/edits",
    // Documented, never exercised. The model-specific address is what keeps this from
    // being applied to grok-imagine-image-quality, which rejects >3.
    maxReferenceImages: 5,
    status: "DOCUMENTED",
    verifiedAt: "2026-09-21",
    source:
      "xAI docs list 5 input images for grok-imagine-image-2.0; AVT has not called this model",
    evidence: "https://docs.x.ai/developers/model-capabilities",
  },

  // -- xAI · video edits ---------------------------------------------------
  {
    provider: "xai",
    model: "*",
    operation: "videos/edits",
    textInput: true,
    imageInput: true,
    videoInput: true,
    sourceVideoEditing: true,
    imageReferenceConditioning: true,
    // 5 references were accepted on 2026-09-21; the true ceiling is unknown, so this
    // sits at the code safety ceiling and is INFERRED, not verified.
    maxReferenceImages: 8,
    // 4096 is a hard provider limit proven by an unbilled 400 — stronger evidence than
    // anything else on this address, hence the field-level block below.
    maxPromptChars: 4096,
    // Never established: the /videos/edits contract documents no first-frame pin.
    keyframeConditioning: null,
    asyncOperation: true,
    status: "INFERRED",
    verifiedAt: "2026-09-21",
    source:
      "providerCapabilities.ts 'xai:videos/edits': 5 references accepted 2026-09-21 (full_look, request 296ee0ca lineage); provider maximum NOT verified — value is the code safety ceiling, not a provider fact",
    evidence: "request lineage 296ee0ca",
    fieldProvenance: {
      maxPromptChars: {
        status: "LIVE_VERIFIED",
        verifiedAt: "2026-09-22",
        source: "provider rejects a longer prompt, unbilled",
        evidence: "provider 400: 'Prompt length exceeds the maximum allowed length of 4096'",
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type CapabilityAddress = {
  provider: string;
  /** Omit or pass `"*"` when the caller genuinely does not pin a model. */
  model?: string | null;
  operation: string;
};

/** Where a single resolved field's value came from, and how good that evidence is. */
export type FieldProvenance = {
  status: VerificationStatus;
  effectiveStatus: EffectiveStatus;
  verifiedAt: string | null;
  source: string;
  evidence?: string | null;
  /** The record address that supplied this field, e.g. "xai/grok-imagine-image-quality/images/edits". */
  from: string;
  /** "builtin" or "override". */
  layer: CapabilityLayer;
};

export type CapabilityLayer = "builtin" | "override";

export type ResolvedCapability = {
  address: Required<CapabilityAddress>;
  /** False when no record matched at all — every value is a conservative default. */
  known: boolean;
  /** The weakest evidence class among the fields that were actually resolved. */
  effectiveStatus: EffectiveStatus;
  /** Resolved capability values. Absent-everywhere fields come back `null`. */
  values: {
    [K in CapabilityField]: CapabilityRecord[K] extends undefined ? never : CapabilityRecord[K];
  };
  /** Per-field evidence. The answer to "which number applies, and who said so". */
  provenance: Partial<Record<CapabilityField, FieldProvenance>>;
  /** Record addresses that contributed, most specific first. */
  contributors: string[];
};

export function addressKey(a: CapabilityAddress): string {
  return `${a.provider}/${a.model && a.model.length > 0 ? a.model : "*"}/${a.operation}`;
}

/**
 * How well a record's model pattern matches a requested model. Higher wins.
 *   3 = exact id · 2 = trailing-`*` family pattern · 1 = provider-wide `*` · 0 = no match
 * Among family patterns, the longer prefix wins, so "grok-imagine-image-2.*" beats
 * "grok-*" without either needing to know the other exists.
 */
export function modelSpecificity(pattern: string, requested: string | null | undefined): number {
  const want = requested && requested.length > 0 ? requested : "*";
  if (pattern === want) return 3;
  if (pattern === "*") return 1;
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    if (want !== "*" && want.startsWith(prefix)) {
      // 2.000… → 2.999…: longer prefix = tighter family match, still below an exact id.
      return 2 + Math.min(prefix.length, 900) / 1000;
    }
  }
  return 0;
}

type EnvLike = { get(name: string): string | undefined };

/** Overrides: a JSON array of CapabilityRecord, read at request time so a fix needs no redeploy. */
export const OVERRIDE_ENV_VAR = "CAPABILITY_REGISTRY_JSON";

export function parseOverrideRecords(env: EnvLike | undefined): CapabilityRecord[] {
  const raw = env?.get(OVERRIDE_ENV_VAR);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A malformed override must never take the registry down with it — the built-in
    // facts are still the best evidence available.
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isUsableRecord).map(normalizeOverride);
}

function isUsableRecord(r: unknown): r is CapabilityRecord {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    typeof o.provider === "string" &&
    typeof o.operation === "string" &&
    o.provider !== "" &&
    o.operation !== ""
  );
}

/**
 * An override is an operator asserting a fact out-of-band. It may be right, but it has
 * not been through the evidence process, so an override that does not DECLARE its own
 * status is recorded as INFERRED — never silently inheriting LIVE_VERIFIED from the
 * built-in it replaces. That downgrade is visible in `provenance` and in render plans.
 */
function normalizeOverride(r: CapabilityRecord): CapabilityRecord {
  const declared = VERIFICATION_STATUSES.includes(r.status) ? r.status : "INFERRED";
  return {
    ...r,
    model: typeof r.model === "string" && r.model.length > 0 ? r.model : "*",
    status: declared,
    verifiedAt: typeof r.verifiedAt === "string" && r.verifiedAt ? r.verifiedAt : null,
    source:
      typeof r.source === "string" && r.source
        ? r.source
        : `${OVERRIDE_ENV_VAR} override (no source declared)`,
  };
}

export type ResolveOptions = {
  env?: EnvLike;
  /** Extra records, highest precedence. Tests and callers that already hold facts. */
  records?: CapabilityRecord[];
  /** Defaults to now. Injectable so staleness is testable. */
  now?: Date;
  stalenessDays?: Partial<Record<VerificationStatus, number | null>>;
};

function ageInDays(verifiedAt: string | null, now: Date): number | null {
  if (!verifiedAt) return null;
  const t = Date.parse(verifiedAt);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 86_400_000;
}

function effectiveStatusOf(
  status: VerificationStatus,
  verifiedAt: string | null,
  now: Date,
  ttl: Record<VerificationStatus, number | null>,
): EffectiveStatus {
  if (status === "UNKNOWN") return "UNKNOWN";
  const limit = ttl[status];
  if (limit == null) return status;
  const age = ageInDays(verifiedAt, now);
  // A fact with no readable date cannot be shown to be fresh, so it is not treated as fresh.
  if (age === null) return "STALE";
  return age > limit ? "STALE" : status;
}

/** Weakest-first, so `effectiveStatus` on a resolution can be a simple minimum. */
const STATUS_RANK: Record<EffectiveStatus, number> = {
  UNKNOWN: 0,
  STALE: 1,
  INFERRED: 2,
  DOCUMENTED: 3,
  LIVE_VERIFIED: 4,
};

/**
 * Resolve the capability fact-set for one provider/model/operation address.
 *
 * Precedence, highest first:
 *   1. `options.records`  (caller-supplied)
 *   2. `CAPABILITY_REGISTRY_JSON` overrides
 *   3. built-in records
 * and WITHIN each layer, model specificity (exact id > family pattern > `*`).
 *
 * Layer beats specificity on purpose: an override exists to correct a wrong built-in
 * without a redeploy, and it could not do that if a stale model-specific built-in
 * outranked it. The cost is that a blanket override can mask a precise fact — which is
 * why an override downgrades the field's provenance to INFERRED and why the safety
 * ceiling is applied after all merging.
 *
 * Merging is field-by-field: a record contributes only the fields it defines, so a
 * model-specific record that pins one limit inherits the rest from the `*` record.
 */
export function getCapability(
  address: CapabilityAddress,
  options: ResolveOptions = {},
): ResolvedCapability {
  const now = options.now ?? new Date();
  const ttl = { ...DEFAULT_STALENESS_DAYS, ...(options.stalenessDays ?? {}) };
  const model = address.model && address.model.length > 0 ? address.model : "*";

  const layers: Array<{ layer: CapabilityLayer; records: CapabilityRecord[] }> = [
    { layer: "builtin", records: BUILTIN_RECORDS },
    { layer: "override", records: parseOverrideRecords(options.env) },
    { layer: "override", records: options.records ?? [] },
  ];

  // Candidates, best first: later layers win, then higher model specificity.
  const candidates: Array<{
    record: CapabilityRecord;
    layer: CapabilityLayer;
    layerIndex: number;
    spec: number;
  }> = [];
  layers.forEach(({ layer, records }, layerIndex) => {
    for (const record of records) {
      if (record.provider !== address.provider || record.operation !== address.operation) continue;
      const spec = modelSpecificity(record.model, model);
      if (spec === 0) continue;
      candidates.push({ record, layer, layerIndex, spec });
    }
  });
  candidates.sort((a, b) => b.layerIndex - a.layerIndex || b.spec - a.spec);

  const values = {} as ResolvedCapability["values"];
  const provenance: ResolvedCapability["provenance"] = {};
  const contributors: string[] = [];

  for (const { record, layer } of candidates) {
    let contributed = false;
    for (const field of CAPABILITY_FIELDS) {
      if (field in provenance) continue; // a better candidate already answered
      if (!(field in record)) continue; // this record says nothing about it
      const value = record[field];
      if (value === undefined) continue;
      (values as Record<string, unknown>)[field] = value;
      // A field-level provenance block wins over the record-level one: evidence belongs
      // to the fact, and one address can hold facts of different classes at once.
      const fp = record.fieldProvenance?.[field];
      const status = fp?.status ?? record.status;
      const verifiedAt = fp ? fp.verifiedAt : record.verifiedAt;
      provenance[field] = {
        status,
        effectiveStatus: effectiveStatusOf(status, verifiedAt, now, ttl),
        verifiedAt,
        source: fp?.source ?? record.source,
        evidence: (fp ? fp.evidence : record.evidence) ?? null,
        from: addressKey(record),
        layer,
      };
      contributed = true;
    }
    if (contributed) contributors.push(addressKey(record));
  }

  const known = contributors.length > 0;

  // Conservative floors for anything nobody spoke to.
  for (const field of CAPABILITY_FIELDS) {
    if (field in provenance) continue;
    const fallback = (UNKNOWN_DEFAULTS as Record<string, unknown>)[field];
    (values as Record<string, unknown>)[field] = fallback === undefined ? null : fallback;
    provenance[field] = {
      status: "UNKNOWN",
      effectiveStatus: "UNKNOWN",
      verifiedAt: null,
      source: known
        ? `no record for ${addressKey({ ...address, model })} defines ${String(field)}`
        : `no record matches ${addressKey({ ...address, model })}`,
      evidence: null,
      from: addressKey({ ...address, model }),
      layer: "builtin",
    };
  }

  // Safety ceiling last, above every data source.
  const maxRefs = values.maxReferenceImages;
  if (typeof maxRefs === "number" && Number.isFinite(maxRefs)) {
    const clamped = Math.max(1, Math.min(Math.floor(maxRefs), SAFETY_MAX_REFERENCE_IMAGES));
    if (clamped !== maxRefs) {
      values.maxReferenceImages = clamped;
      const p = provenance.maxReferenceImages;
      if (p) {
        provenance.maxReferenceImages = {
          ...p,
          status: "INFERRED",
          effectiveStatus: "INFERRED",
          source: `${p.source} — clamped from ${maxRefs} to the code safety ceiling ${SAFETY_MAX_REFERENCE_IMAGES}`,
        };
      }
    }
  }

  // The resolution is only as good as its weakest contributing fact.
  const contributingStatuses = CAPABILITY_FIELDS.map((f) => provenance[f])
    .filter((p): p is FieldProvenance => !!p && p.status !== "UNKNOWN")
    .map((p) => p.effectiveStatus);
  const effectiveStatus: EffectiveStatus = contributingStatuses.length
    ? contributingStatuses.reduce((a, b) => (STATUS_RANK[a] <= STATUS_RANK[b] ? a : b))
    : "UNKNOWN";

  return {
    address: { provider: address.provider, model, operation: address.operation },
    known,
    effectiveStatus,
    values,
    provenance,
    contributors,
  };
}

// ---------------------------------------------------------------------------
// Enforcement — fail closed before spending.
// ---------------------------------------------------------------------------

export type CapabilityRequest = {
  referenceImages?: number;
  promptChars?: number;
  inputDurationSeconds?: number;
  outputDurationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  fps?: number;
  /** The call supplies a pinned first/keyframe. */
  usesKeyframeConditioning?: boolean;
  /** The call edits an existing source video. */
  usesSourceVideoEditing?: boolean;
  /** The call supplies a video as a reference. */
  usesVideoReferenceConditioning?: boolean;
};

export type ViolationSeverity =
  /** A known limit is exceeded, or a known-unsupported feature was requested. Do not call. */
  | "block"
  /** The constraint is unverified or stale. The call may proceed; the gap is recorded. */
  | "unverified";

export type CapabilityViolation = {
  field: CapabilityField;
  severity: ViolationSeverity;
  message: string;
  requested: unknown;
  limit: unknown;
  provenance: FieldProvenance;
};

export type CapabilityEvaluation = {
  /** True when nothing is `block`. `unverified` findings do NOT stop a call. */
  allowed: boolean;
  violations: CapabilityViolation[];
  resolved: ResolvedCapability;
};

/**
 * Check a concrete request against a resolved capability.
 *
 * Fail-closed rules:
 *   • a numeric limit that is KNOWN and exceeded  → `block` (never spend on a call the
 *     provider will reject; the xai:videos/edits 4096-char 400 was unbilled, but a
 *     rejected VIDEO edit is not guaranteed to be);
 *   • a feature flagged `false`                   → `block`;
 *   • a limit that is UNKNOWN or STALE and the request is non-trivial → `unverified`,
 *     surfaced rather than swallowed. We cannot invent a number, so the honest move is
 *     to record that we are calling without proof, not to pretend it is fine.
 *
 * Reference-image count is the one case where UNKNOWN blocks: the conservative default
 * is 1, so asking for more than 1 against an unknown address is a real over-request.
 */
export function evaluateRequest(
  resolved: ResolvedCapability,
  request: CapabilityRequest,
): CapabilityEvaluation {
  const violations: CapabilityViolation[] = [];
  const v = resolved.values;
  const p = resolved.provenance;

  const push = (
    field: CapabilityField,
    severity: ViolationSeverity,
    message: string,
    requested: unknown,
    limit: unknown,
  ) => {
    const prov = p[field];
    if (!prov) return;
    violations.push({ field, severity, message, requested, limit, provenance: prov });
  };

  const checkNumeric = (
    field: CapabilityField,
    requested: number | undefined,
    limit: number | null | undefined,
    unit: string,
  ) => {
    if (requested === undefined) return;
    const prov = p[field];
    if (typeof limit === "number" && Number.isFinite(limit)) {
      if (requested > limit) {
        push(
          field,
          "block",
          `${field}: requested ${requested} ${unit} exceeds the limit of ${limit}`,
          requested,
          limit,
        );
      } else if (prov?.effectiveStatus === "STALE") {
        push(
          field,
          "unverified",
          `${field}: within the recorded limit of ${limit} ${unit}, but that fact is STALE (verified ${prov.verifiedAt ?? "never"}) — re-verify`,
          requested,
          limit,
        );
      }
      return;
    }
    push(
      field,
      "unverified",
      `${field}: no verified limit for ${addressKey(resolved.address)} — calling without proof`,
      requested,
      null,
    );
  };

  // Reference count: the only limit with a conservative non-null default, so UNKNOWN
  // still yields a hard number to exceed.
  if (request.referenceImages !== undefined) {
    const limit = typeof v.maxReferenceImages === "number" ? v.maxReferenceImages : 1;
    if (request.referenceImages > limit) {
      push(
        "maxReferenceImages",
        "block",
        resolved.known
          ? `maxReferenceImages: requested ${request.referenceImages} exceeds the limit of ${limit}`
          : `maxReferenceImages: ${addressKey(resolved.address)} is not in the registry — the conservative default is ${limit}`,
        request.referenceImages,
        limit,
      );
    } else if (p.maxReferenceImages?.effectiveStatus === "STALE") {
      push(
        "maxReferenceImages",
        "unverified",
        `maxReferenceImages: limit ${limit} is STALE — re-verify`,
        request.referenceImages,
        limit,
      );
    }
  }

  checkNumeric("maxPromptChars", request.promptChars, v.maxPromptChars, "characters");
  checkNumeric(
    "maxInputDurationSeconds",
    request.inputDurationSeconds,
    v.maxInputDurationSeconds,
    "seconds",
  );
  checkNumeric(
    "maxOutputDurationSeconds",
    request.outputDurationSeconds,
    v.maxOutputDurationSeconds,
    "seconds",
  );

  const checkFlag = (
    field: CapabilityField,
    used: boolean | undefined,
    supported: Supported | undefined,
  ) => {
    if (!used) return;
    if (supported === false) {
      push(
        field,
        "block",
        `${field}: requested but this provider/model/operation does not support it`,
        true,
        false,
      );
    } else if (supported !== true) {
      push(
        field,
        "unverified",
        `${field}: requested but support is unverified for ${addressKey(resolved.address)}`,
        true,
        null,
      );
    }
  };
  checkFlag("keyframeConditioning", request.usesKeyframeConditioning, v.keyframeConditioning);
  checkFlag("sourceVideoEditing", request.usesSourceVideoEditing, v.sourceVideoEditing);
  checkFlag(
    "videoReferenceConditioning",
    request.usesVideoReferenceConditioning,
    v.videoReferenceConditioning,
  );

  const checkEnum = (
    field: CapabilityField,
    requested: string | number | undefined,
    allowed: unknown,
  ) => {
    if (requested === undefined) return;
    if (Array.isArray(allowed) && allowed.length > 0) {
      if (!allowed.includes(requested as never)) {
        push(
          field,
          "block",
          `${field}: ${requested} is not among ${allowed.join(", ")}`,
          requested,
          allowed,
        );
      }
      return;
    }
    push(
      field,
      "unverified",
      `${field}: no verified list for ${addressKey(resolved.address)}`,
      requested,
      null,
    );
  };
  checkEnum("aspectRatios", request.aspectRatio, v.aspectRatios);
  checkEnum("supportedResolutions", request.resolution, v.supportedResolutions);
  if (request.fps !== undefined) checkEnum("fps", request.fps, v.fps?.supported ?? null);

  return { allowed: !violations.some((x) => x.severity === "block"), violations, resolved };
}

// ---------------------------------------------------------------------------
// Legacy address bridge
// ---------------------------------------------------------------------------

/**
 * Parse a legacy `providerCapabilities.ts` key ("xai:videos/edits") into an address.
 * The legacy format has no model dimension, so it resolves to the provider-wide `*`
 * record — which is exactly the conservative reading it always had.
 */
export function addressFromLegacyKey(key: string): CapabilityAddress {
  const i = key.indexOf(":");
  if (i < 0) return { provider: key, model: "*", operation: "*" };
  return { provider: key.slice(0, i), model: "*", operation: key.slice(i + 1) };
}
