/**
 * SKU-level logo placement for post-VTON deterministic composite.
 * Stored on products.metadata_json.logo_placement (and optionally wardrobe).
 *
 * Placement strategy (locked):
 * 1. SKU-defined source_bbox_norm + optional logo_asset_id (manual, once per product)
 * 2. Chest-band detection refines target on VTON output
 * 3. Optional target_bbox_norm overrides detection (manual VTON-space bbox)
 * SAM/segmentation is a future safety boundary — not primary placement.
 */

export type LogoPlacementHint = "upper_left_chest" | "center_chest";

export type LogoPlacement = {
  /** Transparent PNG asset, or cropped from front via source_bbox_norm */
  logo_asset_id?: string | null;
  /** Flat front asset the bbox was drawn on */
  front_asset_id?: string | null;
  /** Normalized [x, y, w, h] on front_asset where logo lives */
  source_bbox_norm: [number, number, number, number];
  target_region?: "chest_band";
  placement_hint?: LogoPlacementHint;
  /** Optional manual target on VTON output (0–1); overrides band detection when set */
  target_bbox_norm?: [number, number, number, number] | null;
  /** Per-SKU minimum logo height in pixels on VTON output (readability floor) */
  min_target_height_px?: number | null;
};

export function parseLogoPlacement(raw: unknown): LogoPlacement | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const bbox = o.source_bbox_norm;
  if (!Array.isArray(bbox) || bbox.length !== 4) return null;
  const nums = bbox.map((n) => Number(n));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) return null;
  const [x, y, w, h] = nums;
  if (w <= 0 || h <= 0) return null;
  const hint = o.placement_hint;
  const placement_hint =
    hint === "center_chest" || hint === "upper_left_chest" ? hint : "upper_left_chest";
  let target_bbox_norm: LogoPlacement["target_bbox_norm"] = null;
  if (Array.isArray(o.target_bbox_norm) && o.target_bbox_norm.length === 4) {
    const t = o.target_bbox_norm.map((n) => Number(n));
    if (t.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
      target_bbox_norm = t as [number, number, number, number];
    }
  }
  let min_target_height_px: LogoPlacement["min_target_height_px"] = null;
  if (o.min_target_height_px != null) {
    const n = Number(o.min_target_height_px);
    if (Number.isFinite(n) && n >= 16 && n <= 256) {
      min_target_height_px = Math.round(n);
    }
  }
  return {
    logo_asset_id: typeof o.logo_asset_id === "string" ? o.logo_asset_id : null,
    front_asset_id: typeof o.front_asset_id === "string" ? o.front_asset_id : null,
    source_bbox_norm: [x, y, w, h],
    target_region: "chest_band",
    placement_hint,
    target_bbox_norm,
    min_target_height_px,
  };
}

export function logoPlacementFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): LogoPlacement | null {
  if (!metadata) return null;
  return parseLogoPlacement(metadata.logo_placement);
}

export function clampNormBbox(
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number, number, number] {
  const nx = Math.max(0, Math.min(1, x));
  const ny = Math.max(0, Math.min(1, y));
  const nw = Math.max(0.01, Math.min(1 - nx, w));
  const nh = Math.max(0.01, Math.min(1 - ny, h));
  return [nx, ny, nw, nh];
}
