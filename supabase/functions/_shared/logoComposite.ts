/**
 * Post-VTON logo composite for Deno edge (ImageScript decode/encode).
 */

import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

export type LogoPlacementHint = "upper_left_chest" | "center_chest";

export type LogoPlacement = {
  logo_asset_id?: string | null;
  front_asset_id?: string | null;
  source_bbox_norm: [number, number, number, number];
  target_region?: "chest_band";
  placement_hint?: LogoPlacementHint;
  target_bbox_norm?: [number, number, number, number] | null;
};

export type PixelRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array;
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
  return {
    logo_asset_id: typeof o.logo_asset_id === "string" ? o.logo_asset_id : null,
    front_asset_id: typeof o.front_asset_id === "string" ? o.front_asset_id : null,
    source_bbox_norm: [x, y, w, h],
    target_region: "chest_band",
    placement_hint,
    target_bbox_norm,
  };
}

function isNavyPixel(r: number, g: number, b: number): boolean {
  if (r > 95 || g > 95) return false;
  if (b < 45) return false;
  return b > r + 8 && b > g + 5;
}

export function detectChestBand(img: RgbaImage): PixelRect {
  const { width, height, data } = img;
  const yStart = Math.floor(height * 0.12);
  const yEnd = Math.floor(height * 0.58);
  const rowScores: number[] = [];
  for (let y = yStart; y < yEnd; y++) {
    let navy = 0;
    let samples = 0;
    for (let x = Math.floor(width * 0.15); x < Math.floor(width * 0.85); x++) {
      const i = (y * width + x) * 4;
      if (isNavyPixel(data[i], data[i + 1], data[i + 2])) navy++;
      samples++;
    }
    rowScores.push(samples > 0 ? navy / samples : 0);
  }
  const threshold = 0.08;
  let bandStart = -1;
  let bandEnd = -1;
  for (let i = 0; i < rowScores.length; i++) {
    if (rowScores[i] >= threshold) {
      if (bandStart < 0) bandStart = i;
      bandEnd = i;
    }
  }
  if (bandStart < 0 || bandEnd - bandStart < 2) {
    return {
      left: Math.floor(width * 0.2),
      top: Math.floor(height * 0.22),
      right: Math.floor(width * 0.8),
      bottom: Math.floor(height * 0.42),
    };
  }
  const top = yStart + bandStart;
  const bottom = yStart + bandEnd + 1;
  let left = width;
  let right = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!isNavyPixel(data[i], data[i + 1], data[i + 2])) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (right <= left) {
    return {
      left: Math.floor(width * 0.2),
      top,
      right: Math.floor(width * 0.8),
      bottom,
    };
  }
  return { left, top, right: right + 1, bottom };
}

function targetRectForLogo(
  img: RgbaImage,
  band: PixelRect,
  logoAspect: number,
  hint: LogoPlacementHint = "upper_left_chest",
  manualNorm?: [number, number, number, number] | null,
): PixelRect {
  if (manualNorm) {
    const [nx, ny, nw, nh] = manualNorm;
    return {
      left: Math.round(nx * img.width),
      top: Math.round(ny * img.height),
      right: Math.round((nx + nw) * img.width),
      bottom: Math.round((ny + nh) * img.height),
    };
  }
  const bandW = band.right - band.left;
  const bandH = band.bottom - band.top;
  let targetW = Math.round(bandW * 0.38);
  let targetH = Math.round(targetW / Math.max(logoAspect, 0.1));
  if (targetH > bandH * 0.75) {
    targetH = Math.round(bandH * 0.75);
    targetW = Math.round(targetH * logoAspect);
  }
  const padX = hint === "center_chest"
    ? Math.round((bandW - targetW) / 2)
    : Math.round(bandW * 0.06);
  const padY = Math.round((bandH - targetH) * 0.2);
  const left = band.left + padX;
  const top = band.top + padY;
  return {
    left,
    top,
    right: left + targetW,
    bottom: top + targetH,
  };
}

function resizeRgba(src: RgbaImage, dstW: number, dstH: number): RgbaImage {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / dstH) * src.height));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / dstW) * src.width));
      const si = (sy * src.width + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return { width: dstW, height: dstH, data: out };
}

function cropRgba(
  img: RgbaImage,
  left: number,
  top: number,
  width: number,
  height: number,
): RgbaImage {
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, left + x));
      const sy = Math.min(img.height - 1, Math.max(0, top + y));
      const si = (sy * img.width + sx) * 4;
      const di = (y * width + x) * 4;
      out[di] = img.data[si];
      out[di + 1] = img.data[si + 1];
      out[di + 2] = img.data[si + 2];
      out[di + 3] = img.data[si + 3];
    }
  }
  return { width, height, data: out };
}

function alphaComposite(
  base: RgbaImage,
  logo: RgbaImage,
  target: PixelRect,
): RgbaImage {
  const out = new Uint8Array(base.data);
  const tw = target.right - target.left;
  const th = target.bottom - target.top;
  const scaled = resizeRgba(logo, tw, th);
  for (let y = 0; y < th; y++) {
    const dy = target.top + y;
    if (dy < 0 || dy >= base.height) continue;
    for (let x = 0; x < tw; x++) {
      const dx = target.left + x;
      if (dx < 0 || dx >= base.width) continue;
      const li = (y * tw + x) * 4;
      const bi = (dy * base.width + dx) * 4;
      const a = scaled.data[li + 3] / 255;
      if (a <= 0.01) continue;
      const ia = 1 - a;
      out[bi] = Math.round(scaled.data[li] * a + out[bi] * ia);
      out[bi + 1] = Math.round(scaled.data[li + 1] * a + out[bi + 1] * ia);
      out[bi + 2] = Math.round(scaled.data[li + 2] * a + out[bi + 2] * ia);
      out[bi + 3] = 255;
    }
  }
  return { width: base.width, height: base.height, data: out };
}

async function decodeToRgba(bytes: Uint8Array): Promise<RgbaImage> {
  const img = await Image.decode(bytes);
  return {
    width: img.width,
    height: img.height,
    data: new Uint8Array(img.bitmap),
  };
}

async function encodePng(img: RgbaImage): Promise<Uint8Array> {
  const out = new Image(img.width, img.height);
  out.bitmap.set(img.data);
  return await out.encode();
}

function cropNormBbox(img: RgbaImage, norm: [number, number, number, number]): RgbaImage {
  const [nx, ny, nw, nh] = norm;
  const left = Math.round(nx * img.width);
  const top = Math.round(ny * img.height);
  const w = Math.max(1, Math.round(nw * img.width));
  const h = Math.max(1, Math.round(nh * img.height));
  return cropRgba(img, left, top, w, h);
}

export type LogoCompositeResult = {
  bytes: Uint8Array;
  method: "bbox_affine_alpha_blend";
  band: PixelRect;
  target: PixelRect;
  logo_source: "asset" | "front_crop";
};

export async function compositeLogoOntoVton(
  vtonBytes: Uint8Array,
  logoBytes: Uint8Array,
  placement: LogoPlacement,
  logoSource: "asset" | "front_crop",
): Promise<LogoCompositeResult> {
  const base = await decodeToRgba(vtonBytes);
  const logoImg = await decodeToRgba(logoBytes);
  const logoAspect = logoImg.width / Math.max(logoImg.height, 1);
  const band = detectChestBand(base);
  const target = targetRectForLogo(
    base,
    band,
    logoAspect,
    placement.placement_hint ?? "upper_left_chest",
    placement.target_bbox_norm,
  );
  const composited = alphaComposite(base, logoImg, target);
  const bytes = await encodePng(composited);
  return {
    bytes,
    method: "bbox_affine_alpha_blend",
    band,
    target,
    logo_source: logoSource,
  };
}

export type ResolvedLogoAssets = {
  placement: LogoPlacement;
  logoBytes: Uint8Array;
  logoSource: "asset" | "front_crop";
};

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = { storage: any; from: (t: string) => any };

export async function downloadStoragePath(
  admin: SupabaseAdmin,
  path: string,
): Promise<Uint8Array> {
  const buckets = ["product-assets", "wardrobe-refs"];
  for (const bucket of buckets) {
    const { data, error } = await admin.storage.from(bucket).download(path);
    if (!error && data) return new Uint8Array(await data.arrayBuffer());
  }
  throw new Error(`asset_download_failed:${path}`);
}

export async function resolveLogoAssets(
  admin: SupabaseAdmin,
  wardrobeFeatureId: string,
): Promise<ResolvedLogoAssets | null> {
  const { data: wardrobe } = await admin
    .from("character_features")
    .select("metadata_json")
    .eq("id", wardrobeFeatureId)
    .maybeSingle();

  let placement = parseLogoPlacement(
    (wardrobe?.metadata_json as Record<string, unknown> | null)?.logo_placement,
  );

  let productId: string | null = null;
  if (!placement) {
    const { data: link } = await admin
      .from("product_wardrobe_links")
      .select("product_id")
      .eq("character_feature_id", wardrobeFeatureId)
      .maybeSingle();
    productId = link?.product_id ?? null;
    if (productId) {
      const { data: product } = await admin
        .from("products")
        .select("metadata_json")
        .eq("id", productId)
        .maybeSingle();
      placement = parseLogoPlacement(
        (product?.metadata_json as Record<string, unknown> | null)?.logo_placement,
      );
    }
  } else {
    const { data: link } = await admin
      .from("product_wardrobe_links")
      .select("product_id")
      .eq("character_feature_id", wardrobeFeatureId)
      .maybeSingle();
    productId = link?.product_id ?? null;
  }

  if (!placement) return null;

  let logoBytes: Uint8Array | null = null;
  let logoSource: "asset" | "front_crop" = "front_crop";

  if (placement.logo_asset_id && productId) {
    const { data: logoAsset } = await admin
      .from("product_assets")
      .select("storage_path, file_url")
      .eq("id", placement.logo_asset_id)
      .eq("product_id", productId)
      .maybeSingle();
    const logoPath = logoAsset?.storage_path ?? logoAsset?.file_url;
    if (logoPath) {
      logoBytes = await downloadStoragePath(admin, logoPath);
      logoSource = "asset";
    }
  }

  if (!logoBytes && productId) {
    const frontId = placement.front_asset_id;
    let frontPath: string | null = null;
    if (frontId) {
      const { data: frontAsset } = await admin
        .from("product_assets")
        .select("storage_path, file_url")
        .eq("id", frontId)
        .eq("product_id", productId)
        .maybeSingle();
      frontPath = frontAsset?.storage_path ?? frontAsset?.file_url ?? null;
    }
    if (!frontPath) {
      const { data: frontAsset } = await admin
        .from("product_assets")
        .select("storage_path, file_url")
        .eq("product_id", productId)
        .eq("asset_role", "front")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      frontPath = frontAsset?.storage_path ?? frontAsset?.file_url ?? null;
    }
    if (!frontPath) return null;
    const frontBytes = await downloadStoragePath(admin, frontPath);
    const frontImg = await decodeToRgba(frontBytes);
    const cropped = cropNormBbox(frontImg, placement.source_bbox_norm);
    logoBytes = await encodePng(cropped);
    logoSource = "front_crop";
  }

  if (!logoBytes) return null;
  return { placement, logoBytes, logoSource };
}
