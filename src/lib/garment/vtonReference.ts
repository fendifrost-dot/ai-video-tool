/**
 * Smart garment reference selection for VTON and Seedream.
 *
 * VTON models (IDM-VTON, Leffa) take ONE garment image per call. Flat
 * product-front shots transfer better than on-model lifestyle photos.
 * Multi-angle galleries are sorted so front/flat wins over on-model.
 */

export const VTON_GARMENT_ANGLE_PRIORITY = [
  "front",
  "three-quarter",
  "detail",
  "side",
  "back",
  "other",
] as const;

export type RefImageLike = {
  storage_path?: string | null;
  url?: string | null;
  angle?: string | null;
  label?: string | null;
};

export function pathFromRef(r: RefImageLike): string | null {
  const p = r.storage_path ?? r.url ?? null;
  return typeof p === "string" && p.length > 0 ? p : null;
}

/** Heuristic: deprioritize lifestyle / on-model shots for VTON garment input. */
export function isOnModelReference(r: RefImageLike): boolean {
  const label = (r.label ?? "").toLowerCase();
  const angle = (r.angle ?? "").toLowerCase();
  if (angle === "on_model" || angle === "on-model" || angle === "on_model_reference") {
    return true;
  }
  return /\b(on[- ]?model|wearing|worn|styled|lookbook|lifestyle)\b/.test(label);
}

export function sortRefsForVtonGarment<T extends RefImageLike>(refs: T[]): T[] {
  if (refs.length <= 1) return [...refs];
  const priority = new Map(
    VTON_GARMENT_ANGLE_PRIORITY.map((a, i) => [a, i]),
  );
  return [...refs].sort((a, b) => {
    const aOnModel = isOnModelReference(a);
    const bOnModel = isOnModelReference(b);
    if (aOnModel !== bOnModel) return aOnModel ? 1 : -1;
    const aPri = priority.get((a.angle ?? "") as (typeof VTON_GARMENT_ANGLE_PRIORITY)[number]) ?? 50;
    const bPri = priority.get((b.angle ?? "") as (typeof VTON_GARMENT_ANGLE_PRIORITY)[number]) ?? 50;
    return aPri - bPri;
  });
}

/** Pick the single best storage path for a VTON garment_image_url. */
export function pickVtonGarmentPath(
  refs: RefImageLike[],
  fallbackPath?: string | null,
): string | null {
  const sorted = sortRefsForVtonGarment(refs);
  for (const r of sorted) {
    const p = pathFromRef(r);
    if (p) return p;
  }
  return fallbackPath ?? null;
}

/** Sort refs for full-look hero transfer — on-model geometry first. */
export function sortRefsForFullLookGarment<T extends RefImageLike>(refs: T[]): T[] {
  if (refs.length <= 1) return [...refs];
  const priority = new Map(
    VTON_GARMENT_ANGLE_PRIORITY.map((a, i) => [a, i]),
  );
  return [...refs].sort((a, b) => {
    const aOnModel = isOnModelReference(a);
    const bOnModel = isOnModelReference(b);
    if (aOnModel !== bOnModel) return aOnModel ? -1 : 1;
    const aPri = priority.get((a.angle ?? "") as (typeof VTON_GARMENT_ANGLE_PRIORITY)[number]) ?? 50;
    const bPri = priority.get((b.angle ?? "") as (typeof VTON_GARMENT_ANGLE_PRIORITY)[number]) ?? 50;
    return aPri - bPri;
  });
}

/** Pick garment ref for hero full-look transfer (prefers on-model SL shots). */
export function pickFullLookGarmentPath(
  refs: RefImageLike[],
  fallbackPath?: string | null,
): string | null {
  const sorted = sortRefsForFullLookGarment(refs);
  for (const r of sorted) {
    const p = pathFromRef(r);
    if (p) return p;
  }
  return fallbackPath ?? null;
}

/** Ordered unique paths for Seedream / multi-ref round-robin (front angles first). */
export function orderedRefPathsForComposer(
  refs: RefImageLike[],
  fallbackPath?: string | null,
): string[] {
  const sorted = sortRefsForVtonGarment(refs);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of sorted) {
    const p = pathFromRef(r);
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  if (out.length === 0 && fallbackPath && !seen.has(fallbackPath)) {
    out.push(fallbackPath);
  }
  return out;
}

/** Map wardrobe feature_type → Fal IDM-VTON category. */
export function vtonCategoryForFeatureType(featureType: string): string {
  if (featureType === "wardrobe_bottom") return "lower_body";
  if (featureType === "wardrobe_footwear") return "lower_body";
  return "upper_body";
}

/** Guess angle from filename when user bulk-imports product shots. */
export function guessAngleFromFilename(name: string): (typeof VTON_GARMENT_ANGLE_PRIORITY)[number] | "other" {
  const base = name.toLowerCase().replace(/\.[^.]+$/, "");
  const tokens = base.split(/[^a-z0-9]+/).filter(Boolean);
  const hasToken = (...words: string[]) =>
    words.some((w) => tokens.includes(w) || base.includes(w));

  if (hasToken("back", "rear", "verso")) return "back";
  if (hasToken("side", "profile", "lateral")) return "side";
  if (hasToken("threequarter", "quarter") || /3\s*4|three.?quarter/.test(base)) {
    return "three-quarter";
  }
  if (hasToken("detail", "close", "collar", "zip", "texture", "macro")) return "detail";
  if (hasToken("model", "wearing", "worn", "lookbook", "lifestyle", "styled")) return "other";
  if (hasToken("front", "flat", "product", "pack")) return "front";
  return "front";
}
