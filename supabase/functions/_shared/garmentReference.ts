// Deno copy of src/lib/garment/vtonReference.ts — edge functions deploy
// independently and cannot import from the Vite src tree.

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

export function vtonCategoryForFeatureType(featureType: string): string {
  if (featureType === "wardrobe_bottom") return "lower_body";
  if (featureType === "wardrobe_footwear") return "lower_body";
  return "upper_body";
}
