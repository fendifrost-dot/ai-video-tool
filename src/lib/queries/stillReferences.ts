/**
 * Whether the still generator takes reference pictures, asked of the generator itself.
 *
 * A free dry-run (world-still-proxy `dryRun: true`, nothing billed): a generator that takes pictures answers
 * `referencesAccepted: true`, the most pictures any of its edit models takes, and each model with its own limit and
 * estimate; one that does not (deployed before reference delivery) answers without
 * them, and the storyboard then says that the pictures are NOT sent rather than hand them to a server that would drop
 * them.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * One edit model the generator can draw a still with pictures on, as the generator itself reports it: how many
 * pictures it takes and what a picture is estimated to cost on it. The app plans and prices with these — it keeps no
 * model names or prices of its own for a request with pictures.
 */
export type StillReferenceTier = { model: string | null; max: number; usdPerImage: Record<string, number>; usdPerInputImage: number };

/**
 * `max`: the most pictures any listed model takes. `tiers`: the models in the order the generator tries them — a
 * request is drawn on the first that takes all its pictures, so `tiers[0]` is the model of every still that fits it.
 */
export type StillReferenceSupport = { accepted: boolean; max: number; model: string | null; tiers: StillReferenceTier[] };

/** The conservative limit when the generator does not say (xAI images/edits on grok-imagine-image-quality: 3, verified 2026-09-21). */
export const DEFAULT_STILL_REFERENCE_CAP = 3;
/** What a still with pictures is assumed to cost when the generator names no rate (the plain still's list rate; rates.ts). */
const ASSUMED_USD_PER_IMAGE = 0.07;

const oneTier = (model: string | null, max: number): StillReferenceTier => ({ model, max, usdPerImage: { "2k": ASSUMED_USD_PER_IMAGE }, usdPerInputImage: 0 });

/** What the app assumes before the generator has answered, or when it does not take pictures. */
export const NO_STILL_REFERENCE_SUPPORT: StillReferenceSupport = { accepted: false, max: DEFAULT_STILL_REFERENCE_CAP, model: null, tiers: [oneTier(null, DEFAULT_STILL_REFERENCE_CAP)] };

function readTiers(raw: unknown): StillReferenceTier[] {
  if (!Array.isArray(raw)) return [];
  const out: StillReferenceTier[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    const max = Number(o.maxReferences);
    if (typeof o.model !== "string" || !Number.isFinite(max) || max < 0) continue;
    const usdPerImage: Record<string, number> = {};
    for (const [k, v] of Object.entries((o.usdPerImage ?? {}) as Record<string, unknown>)) if (Number.isFinite(Number(v)) && Number(v) >= 0) usdPerImage[k.toLowerCase()] = Number(v);
    const perInput = Number(o.usdPerInputImage);
    out.push({ model: o.model, max: Math.floor(max), usdPerImage: Object.keys(usdPerImage).length ? usdPerImage : { "2k": ASSUMED_USD_PER_IMAGE }, usdPerInputImage: Number.isFinite(perInput) && perInput >= 0 ? perInput : 0 });
  }
  return out;
}

export function readSupport(data: Record<string, unknown> | null | undefined): StillReferenceSupport {
  const accepted = data?.referencesAccepted === true;
  const stated = Number(data?.maxReferences);
  const one = accepted && Number.isFinite(stated) && stated >= 0 ? stated : DEFAULT_STILL_REFERENCE_CAP;
  const model = typeof data?.referenceModel === "string" ? data.referenceModel : null;
  // a generator that lists its models: the most is the largest of them (its `maxReferences` stays the usual model's
  // limit, for an app published before the list existed). One deployed before the list answers one limit and at most
  // one model: that is its one tier.
  const listed = accepted ? readTiers(data?.referenceModels) : [];
  if (listed.length) return { accepted, max: listed.reduce((a, t) => Math.max(a, t.max), 0), model, tiers: listed };
  return { accepted, max: one, model, tiers: [oneTier(model, one)] };
}

/** The model a still with `pictures` reference pictures is drawn on: the first listed that takes them all. Null when none does. */
export function stillTierFor(support: Pick<StillReferenceSupport, "tiers">, pictures: number): StillReferenceTier | null {
  return support.tiers.find((t) => t.max >= pictures) ?? null;
}

/** How many pictures the usual model takes: a still that fits it is drawn on it, and no picture a shot can do without goes past it. */
export function baseCapOf(support: Pick<StillReferenceSupport, "tiers" | "max">): number {
  return Math.min(support.max, usualTier(support)?.max ?? support.max);
}

/** The usual model: the first listed that takes any picture at all (one set to 0 by an override draws no still with pictures). */
function usualTier(support: Pick<StillReferenceSupport, "tiers">): StillReferenceTier | null {
  return support.tiers.find((t) => t.max > 0) ?? null;
}

/** The estimate of ONE candidate picture drawn with `pictures` reference pictures on `tier` (2K, as stills are asked for). */
export function stillRateUsd(tier: StillReferenceTier, pictures: number, resolution = "2k"): number {
  const key = resolution.toLowerCase();
  const out = Object.hasOwn(tier.usdPerImage, key) ? tier.usdPerImage[key] : Math.max(...Object.values(tier.usdPerImage));
  return Number((out + tier.usdPerInputImage * Math.max(0, pictures)).toFixed(4));
}

/**
 * What the confirmation says about the price and the model of a still that goes with `pictures` reference pictures.
 * On the usual model: the long-standing caveat. On another: that it IS another, and what is not yet known about it —
 * the director is told before the first still is drawn on a model his other stills were not drawn on.
 */
export function stillCostNote(support: StillReferenceSupport, pictures: number): string {
  if (!support.accepted || pictures <= 0) return "";
  const tier = stillTierFor(support, pictures);
  const base = usualTier(support);
  if (!tier || !base || tier === base) return " (the edits route is assumed to cost the same as a plain still; unverified)";
  return ` (an estimate from the list price of ${tier.model}: ${pictures} pictures are more than ${base.model ?? "the usual image model"} takes (${base.max}), so this still is drawn on a different model from your stills with up to ${base.max} pictures. What it bills, and how exactly it reproduces a garment, are not yet verified — check each piece against its photo)`;
}

export function useStillReferenceSupport(projectId: string | undefined) {
  return useQuery<StillReferenceSupport>({
    queryKey: ["still_reference_support", projectId ?? "_none_"],
    enabled: !!projectId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<Record<string, unknown>>("world-still-proxy", {
        body: { projectId, prompt: "capability probe", dryRun: true, references: [] },
      });
      if (error) return NO_STILL_REFERENCE_SUPPORT;
      return readSupport(data);
    },
  });
}
