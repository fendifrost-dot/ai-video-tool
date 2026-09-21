// Look truth hierarchy for reference-conditioned wardrobe generation.
//
// ChatGPT ruling 2026-09-21 §3: "composed outfit sheet → primary garment/product refs → detail
// refs → structured Look specification. Keep per-piece references. Store default
// reference_policy on the Look; artist/project defaults may provide fallback."
//
// Everything here is DATA-driven: which images go, in what order, and what the structured
// specification says all come from the Look recipe (`artist_looks.composition_recipe_json`) and
// the pieces' reference galleries. Nothing names a brand, a garment or a project.
//
// Recipe fields read (all optional):
//   wardrobe_feature_ids : string[]      pieces, first = hero piece unless `hero_feature_id`
//   hero_feature_id      : string        which piece is primary
//   outfit_sheet_path    : string        composed outfit image (else artist_looks.generated_storage_path)
//   reference_policy     : ReferencePolicy
//   constraints          : string[]      hard construction facts, composed FIRST into the prompt
//   spec                 : string | Record<string,string>   structured Look specification text
import { isOnModelReference, pathFromRef, sortRefsForFullLookGarment, sortRefsForVtonGarment, type RefImageLike } from "./garmentReference.ts";

export type ReferencePolicy = {
  /** Send the composed outfit sheet first (default true when one exists). */
  outfitSheet?: boolean;
  /** References for the hero piece (on-model / front / three-quarter, then detail). */
  primaryPieceRefs?: number;
  /** References for every other piece. */
  otherPieceRefs?: number;
  /** Total cap for this request (then clamped by the provider capability). */
  maxRefs?: number;
};

export const DEFAULT_REFERENCE_POLICY: Required<ReferencePolicy> = { outfitSheet: true, primaryPieceRefs: 4, otherPieceRefs: 1, maxRefs: 5 };

/** Later layers override earlier ones; numbers are clamped to [1, ceiling]. */
export function resolveReferencePolicy(ceiling: number, ...layers: Array<ReferencePolicy | null | undefined>): Required<ReferencePolicy> {
  const out = { ...DEFAULT_REFERENCE_POLICY };
  for (const l of layers) {
    if (!l || typeof l !== "object") continue;
    if (typeof l.outfitSheet === "boolean") out.outfitSheet = l.outfitSheet;
    for (const k of ["primaryPieceRefs", "otherPieceRefs", "maxRefs"] as const) {
      const v = Number(l[k]);
      if (Number.isFinite(v) && v >= 1) out[k] = Math.min(Math.floor(v), ceiling);
    }
  }
  out.maxRefs = Math.max(1, Math.min(out.maxRefs, ceiling));
  return out;
}

export type LookPieceInput = {
  featureId: string;
  label: string;
  featureType: string;
  refs: RefImageLike[];
  /** storage_path / file_url of the feature row — used only by the flat mode fallback. */
  fallbackPath?: string | null;
};

export type ReferenceRole = "outfit_sheet" | "primary_piece" | "detail" | "other_piece";
export type PlannedReference = { role: ReferenceRole; featureId: string | null; path: string };

function roleForRef(r: RefImageLike, primary: boolean): ReferenceRole {
  if (!primary) return "other_piece";
  return (r.angle ?? "").toLowerCase() === "detail" && !isOnModelReference(r) ? "detail" : "primary_piece";
}

/**
 * Order the references for one request. `mode` "full_look" sends on-model first per piece;
 * "flat" sends flat product shots only (the R4 benchmark configuration), one per piece.
 * Returns the ordered unique paths and the plan that explains each one.
 */
export function orderLookReferences(args: {
  mode: "flat" | "full_look";
  outfitSheetPath?: string | null;
  heroFeatureId: string;
  pieces: LookPieceInput[];
  policy: Required<ReferencePolicy>;
}): { paths: string[]; plan: PlannedReference[] } {
  const { mode, policy } = args;
  const plan: PlannedReference[] = [];
  const seen = new Set<string>();
  const push = (p: PlannedReference) => {
    if (!p.path || seen.has(p.path) || plan.length >= policy.maxRefs) return;
    seen.add(p.path);
    plan.push(p);
  };
  if (mode === "full_look" && policy.outfitSheet && args.outfitSheetPath) {
    push({ role: "outfit_sheet", featureId: null, path: args.outfitSheetPath });
  }
  const ordered = [...args.pieces].sort((a, b) => Number(b.featureId === args.heroFeatureId) - Number(a.featureId === args.heroFeatureId));
  for (const piece of ordered) {
    const primary = piece.featureId === args.heroFeatureId;
    const budget = primary ? policy.primaryPieceRefs : policy.otherPieceRefs;
    const candidates = mode === "full_look"
      ? sortRefsForFullLookGarment(piece.refs)
      : sortRefsForVtonGarment(piece.refs.filter((r) => !isOnModelReference(r)));
    let n = 0;
    for (const r of candidates) {
      if (n >= budget) break;
      const path = pathFromRef(r);
      if (!path || seen.has(path)) continue;
      push({ role: roleForRef(r, primary), featureId: piece.featureId, path });
      n++;
    }
    // A piece with no eligible gallery image contributes nothing (fail closed: no degraded
    // fallback to the row's file in full_look mode; flat mode keeps the R4 rule of the same).
  }
  return { paths: plan.map((p) => p.path), plan };
}

/**
 * Structured Look specification (the last rung of the hierarchy): what the recipe says in
 * words, plus one line per piece. Returned as text the caller may append to the prompt and
 * MUST record in the plan.
 */
export function lookSpecificationText(recipe: { spec?: unknown; name?: string }, pieces: Array<{ label: string; featureType: string }>): string {
  const sentence = (t: string) => (/[.!?]$/.test(t) ? t : t + ".");
  const lines: string[] = [];
  const spec = recipe.spec;
  if (typeof spec === "string" && spec.trim()) lines.push(sentence(spec.trim()));
  else if (spec && typeof spec === "object") {
    const items = Object.entries(spec as Record<string, unknown>)
      .filter(([, v]) => typeof v === "string" && (v as string).trim())
      .map(([k, v]) => `${k}: ${(v as string).trim().replace(/[.;]+$/, "")}`);
    if (items.length) lines.push(`Look specification — ${items.join("; ")}.`);
  }
  const pieceLines = pieces.filter((p) => p.label).map((p) => (p.featureType ? `${p.featureType}: ${p.label}` : p.label));
  if (pieceLines.length) lines.push(`Pieces — ${pieceLines.join("; ")}.`);
  return lines.join(" ");
}

/**
 * Constraints-first composition (same rule as src/lib/heroFrame/grokVideoEditPrompt.ts
 * composeConstraintsFirst): hard construction facts as short imperative sentences BEFORE the
 * descriptive body. If the body already starts with the composed head (the client composed it
 * itself), it is left untouched so nothing is stated twice.
 */
export function composeConstraintsFirst(constraints: readonly string[], body: string): string {
  const cleaned = constraints.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim().replace(/[.\s]+$/, "") + ".");
  if (cleaned.length === 0) return body;
  const head = cleaned.join(" ") + " Follow the reference photos exactly. ";
  return body.startsWith(head) ? body : head + body;
}
