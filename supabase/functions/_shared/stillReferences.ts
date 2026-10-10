// The reference pictures a storyboard still is drawn with — checked here, on the server, before anything is signed or
// paid for. The pure half of world-still-proxy's reference delivery (tested in stillReferences.test.ts).
//
// A reference names a RECORD, never a path or a URL: a project asset (project_assets.id) or one of the artist's
// pictures (character_features.id). The server looks each one up, holds it to the caller (the asset must be in the
// project the caller owns; the picture must belong to one of the caller's artists), takes only images, and signs only
// in the buckets those records live in. Anything that fails is refused by name and nothing is generated — a picture
// is never dropped quietly and the request never goes ahead with fewer than it was asked for.

export type ReferenceRequest = { source: "project_asset" | "character_feature"; id: string; role: string; label: string };

/** Where an asset's or a picture's file may be signed from. Nothing else is reachable through this route. */
export const ASSET_BUCKETS = ["project-references", "project-clips"] as const;
/** Where the artist's pictures live, by kind: wardrobe in wardrobe-refs, everything else (face, hair, Character DNA) in artist-assets. */
export const WARDROBE_BUCKET = "wardrobe-refs";
export const ARTIST_BUCKET = "artist-assets";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(["screen", "position", "place", "garment", "cast", "prop"]);
/** A request carrying more than this is malformed whatever the provider's limit (the cap check comes after). */
const MAX_LISTED = 12;

/**
 * The edit models a still with reference pictures can be drawn on, the one in use first.
 *
 * A request is drawn on the FIRST model that takes all its pictures, so a request the first model takes is drawn
 * exactly as it was before a second model was listed. (That a larger limit moves no shot that did not need it also
 * depends on the planner: it fills the pictures a shot can do without only up to the FIRST model's limit — see
 * src/lib/storyboard/references.ts `baseCap`.) A caller may name a listed model instead (`model`), and gets it when it
 * takes the request's pictures: that is how a board is kept on one model, and how one shot is drawn on both to compare.
 * The limit of each is its provider capability (providerCapabilities "xai:images/edits:<model>"), not a number here.
 *
 * `usdPerImage`: what one output picture costs at each resolution; `usdPerInputImage`: what each input picture adds.
 * Together they are the estimate the cost gate holds a request to — an ESTIMATE: no billed run has verified either
 * model's edits rate. `basis` says where the numbers come from and is recorded with every picture and on the job.
 */
export type ReferenceModel = { model: string; usdPerImage: Record<string, number>; usdPerInputImage: number; basis: string };
export const REFERENCE_MODELS: readonly ReferenceModel[] = [
  { model: "grok-imagine-image-quality", usdPerImage: { "1k": 0.07, "2k": 0.07 }, usdPerInputImage: 0, basis: "generations list rate; edits rate unverified" },
  // docs.x.ai model page, read 10 Oct 2026: medium quality $0.06 (1K) / $0.08 (2K) per picture — the dearest tier the
  // page lists — and $0.01 per input picture. The request leaves `quality` to the provider's default, so pricing at
  // the dearest listed tier keeps the gate on the safe side; it is still an estimate, not a bill.
  { model: "grok-imagine-image-2.0", usdPerImage: { "1k": 0.06, "2k": 0.08 }, usdPerInputImage: 0.01, basis: "docs.x.ai list rate at medium quality (the dearest listed) plus $0.01 per input picture; quality is the provider's default, billed amount unverified" },
];

/** The resolutions a still is asked for at. Anything else is refused: the value is the caller's and it prices the request. */
export const STILL_RESOLUTIONS = ["1k", "2k"] as const;
export function normalizeResolution(raw: unknown): (typeof STILL_RESOLUTIONS)[number] | null {
  if (raw === undefined || raw === null) return "2k";
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (STILL_RESOLUTIONS as readonly string[]).includes(v) ? (v as (typeof STILL_RESOLUTIONS)[number]) : null;
}

/** One listed model as the app is told about it: its limit and its estimate, so the app plans and prices with the server's own numbers. */
export type ReferenceTier = { model: string; maxReferences: number; usdPerImage: Record<string, number>; usdPerInputImage: number; basis: string };

/** The listed models with their limits at request time, in listed order. */
export function referenceTiers(capOf: (model: string) => number, models: readonly ReferenceModel[] = REFERENCE_MODELS): ReferenceTier[] {
  return models.map((m) => ({ model: m.model, maxReferences: Math.max(0, Math.floor(Number(capOf(m.model)) || 0)), usdPerImage: { ...m.usdPerImage }, usdPerInputImage: m.usdPerInputImage, basis: m.basis }));
}

/**
 * The model a request of `count` pictures is drawn on (null when none takes them), and the most any listed model
 * takes. `asked` — a listed model the caller names — is the one, when it takes the count; a name that is not listed,
 * or a listed model too small for the request, is set aside and the first that fits is used.
 */
export function pickReferenceModel(count: number, capOf: (model: string) => number, models: readonly ReferenceModel[] = REFERENCE_MODELS, asked?: string | null): { pick: ReferenceTier | null; most: number } {
  const tiers = referenceTiers(capOf, models);
  const most = tiers.reduce((a, m) => Math.max(a, m.maxReferences), 0);
  const named = asked ? tiers.find((m) => m.model === asked && m.maxReferences >= count) : undefined;
  return { pick: named ?? tiers.find((m) => m.maxReferences >= count) ?? null, most };
}

/** What one candidate picture of a request with `inputs` reference pictures costs on `m`; an unlisted resolution prices at the dearest. */
export function referenceRateUsd(m: Pick<ReferenceModel, "usdPerImage" | "usdPerInputImage">, resolution: string, inputs: number): number {
  const key = String(resolution).toLowerCase();
  const out = Object.hasOwn(m.usdPerImage, key) ? m.usdPerImage[key] : Math.max(...Object.values(m.usdPerImage));
  const n = Number.isFinite(inputs) && inputs > 0 ? inputs : 0;
  return Number((out + m.usdPerInputImage * n).toFixed(4));
}

/**
 * What a still request will be drawn on and what it is estimated to cost — everything world-still-proxy decides
 * before it touches a file or the provider, as one pure function so it can be tested.
 *
 * `pictures` reference pictures, `n` candidates. Without pictures the request goes to the generations route on the
 * caller's model (or the default) at `generationRateOf(model)`; with pictures it goes to the edits route on the model
 * `pickReferenceModel` picks. `overGate` is true unless the estimate is a number no greater than `maxCostUsd` — a NaN
 * never opens the gate.
 */
export type StillRequestPlan =
  | { ok: false; error: "references_over_capability"; detail: string; maxReferences: number }
  | {
      ok: true;
      model: string;
      /** The edit model picked for this request's pictures; null when it has none. */
      referenceModel: string | null;
      maxReferences: number;
      referenceModels: ReferenceTier[];
      rate: number;
      estimatedCostUsd: number;
      overGate: boolean;
      /** The caller named a model and pictures are drawn on another. */
      modelOverridden: boolean;
      /** Where the estimate of a request with pictures comes from; null without pictures. */
      costBasis: string | null;
    };

export function planStillRequest(input: {
  pictures: number;
  n: number;
  resolution: string;
  askedModel?: string | null;
  defaultModel: string;
  maxCostUsd: number;
  capOf: (model: string) => number;
  generationRateOf: (model: string) => number;
  models?: readonly ReferenceModel[];
}): StillRequestPlan {
  const models = input.models ?? REFERENCE_MODELS;
  const tiers = referenceTiers(input.capOf, models);
  const { pick, most } = pickReferenceModel(input.pictures, input.capOf, models, input.askedModel ?? null);
  if (!pick) return { ok: false, error: "references_over_capability", detail: `${input.pictures} reference pictures were sent; the image models take at most ${most}. Nothing was generated.`, maxReferences: most };
  const withRefs = input.pictures > 0;
  const model = withRefs ? pick.model : (input.askedModel ?? input.defaultModel);
  const rate = withRefs ? referenceRateUsd(pick, input.resolution, input.pictures) : input.generationRateOf(model);
  const estimatedCostUsd = Number((rate * input.n).toFixed(4));
  return {
    ok: true,
    model,
    referenceModel: withRefs ? pick.model : null,
    maxReferences: most,
    referenceModels: tiers,
    rate,
    estimatedCostUsd,
    overGate: !(estimatedCostUsd <= input.maxCostUsd),
    modelOverridden: withRefs && !!input.askedModel && input.askedModel !== pick.model,
    costBasis: withRefs ? pick.basis : null,
  };
}

export function parseReferenceRequest(raw: unknown): { refs: ReferenceRequest[]; error: string | null } {
  if (raw === undefined || raw === null) return { refs: [], error: null };
  if (!Array.isArray(raw)) return { refs: [], error: "references must be a list" };
  if (raw.length > MAX_LISTED) return { refs: [], error: `at most ${MAX_LISTED} references may be listed` };
  const refs: ReferenceRequest[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const source = o.source === "project_asset" || o.source === "character_feature" ? o.source : null;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const role = typeof o.role === "string" && ROLES.has(o.role) ? o.role : null;
    if (!source || !UUID_RE.test(id) || !role) return { refs: [], error: "each reference needs a source (project_asset | character_feature), a record id and a known role" };
    if (refs.some((x) => x.source === source && x.id === id)) return { refs: [], error: `reference ${id} is listed twice` };
    refs.push({ source, id, role, label: typeof o.label === "string" ? o.label.slice(0, 120) : "" });
  }
  return { refs, error: null };
}

export type AssetRow = { id: string; project_id: string; file_url: string | null; asset_type: string | null; metadata_json: unknown };
export type FeatureRow = { id: string; artist_id: string; storage_path: string | null; file_url: string | null; feature_type?: string | null };

/**
 * The row is the caller's — but the row names a FILE, and the row is written by the client. So the file itself must
 * sit in the folder that belongs to what the row belongs to: a project asset under `<uid>/<projectId>/…`, an artist's
 * picture under `<uid>/<artistId>/…`. (Storage writes are scoped to the writer's own first segment, so a file in the
 * caller's project or artist folder was put there for that project or artist. The first segment is not required to
 * be today's uid: older files sit under an earlier anonymous uid — RISK-002.) A row pointing anywhere else is refused.
 */
export function inFolderOf(path: string, ownerId: string): boolean {
  const parts = path.split("/");
  return parts.length >= 3 && parts[1] === ownerId && parts.every((p) => p !== "" && p !== "." && p !== "..");
}

export type ResolvedReference = { ref: ReferenceRequest; path: string; buckets: readonly string[] };

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/**
 * Hold every reference to the caller. `assets` are the project_assets rows looked up by id; `features` the
 * character_features rows; `ownArtists` the ids of the caller's artists. Order is kept (it is the <IMAGE_n> order).
 */
export function resolveReferences(
  refs: readonly ReferenceRequest[],
  input: { projectId: string; assets: readonly AssetRow[]; features: readonly FeatureRow[]; ownArtists: ReadonlySet<string> },
): { resolved: ResolvedReference[]; refused: { ref: ReferenceRequest; why: string }[] } {
  const assets = new Map(input.assets.map((a) => [a.id, a]));
  const features = new Map(input.features.map((f) => [f.id, f]));
  const resolved: ResolvedReference[] = [];
  const refused: { ref: ReferenceRequest; why: string }[] = [];
  for (const ref of refs) {
    if (ref.source === "project_asset") {
      const a = assets.get(ref.id);
      if (!a || a.project_id !== input.projectId) {
        refused.push({ ref, why: "not an asset of this project" });
        continue;
      }
      const meta = (a.metadata_json ?? {}) as Record<string, unknown>;
      // the bucket the app reads it from — src/lib/queries/projectAssets.ts `bucketForAssetType` is the source of truth
      // (functions cannot import src/); change both together — unless the row says
      const bucket = typeof meta.bucket === "string" ? meta.bucket : a.asset_type === "reference_image" ? "project-references" : "project-clips";
      const mime = typeof meta.mime_type === "string" ? meta.mime_type : "";
      const path = (a.file_url ?? "").trim();
      if (!(ASSET_BUCKETS as readonly string[]).includes(bucket)) {
        refused.push({ ref, why: `its file is in ${bucket}, which this route does not read` });
        continue;
      }
      if (!path || /^https?:\/\//i.test(path) || path.includes("..")) {
        refused.push({ ref, why: "it has no stored file this route can sign" });
        continue;
      }
      if (!inFolderOf(path, input.projectId)) {
        refused.push({ ref, why: "its file is not in this project's folder" });
        continue;
      }
      if (!(mime === "" || mime.startsWith("image/")) || !IMAGE_EXT.test(path)) {
        refused.push({ ref, why: "it is not an image" });
        continue;
      }
      resolved.push({ ref, path, buckets: [bucket] });
    } else {
      const f = features.get(ref.id);
      if (!f || !input.ownArtists.has(f.artist_id)) {
        refused.push({ ref, why: "not a picture of one of your artists" });
        continue;
      }
      // rows from before the multi-angle column carry the file in file_url only (src/lib/queries/characterFeatures.ts)
      const path = (f.storage_path ?? f.file_url ?? "").trim();
      if (!path || /^https?:\/\//i.test(path) || path.includes("..") || !IMAGE_EXT.test(path)) {
        refused.push({ ref, why: "it has no stored image this route can sign" });
        continue;
      }
      if (!inFolderOf(path, f.artist_id)) {
        refused.push({ ref, why: "its file is not in its artist's folder" });
        continue;
      }
      // one bucket per kind, never a fall-through: a same-named file elsewhere is not this picture
      resolved.push({ ref, path, buckets: [(f.feature_type ?? "").startsWith("wardrobe_") ? WARDROBE_BUCKET : ARTIST_BUCKET] });
    }
  }
  return { resolved, refused };
}

/** A provider's error text with any signed-URL token taken out, so a URL it echoes never reaches the caller. */
export function redactSigned(text: string): string {
  return text.replace(/([?&](?:token|sig|signature|X-Amz-[A-Za-z-]+)=)[^&\s"']+/g, "$1…");
}

/** A whole number in [lo, hi], or the default when the value is missing or not a number. */
export function boundedInt(value: unknown, dflt: number, lo: number, hi: number): number {
  const n = Number(value ?? dflt);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : dflt;
}
