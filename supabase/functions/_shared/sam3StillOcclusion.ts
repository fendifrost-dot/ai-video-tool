/**
 * SAM-3 occlusion fetch for Architecture C still-repair (edge only).
 *
 * Calls Control Center SwitchX `segment-image` with the same secrets as
 * `sam3-segment-proxy` — does NOT touch Grok proxies or widen their auth.
 *
 * Builds α = outfit − dilate(hands) − dilate(face).
 *
 * FAIL-CLOSED for `"sam3"`: outfit AND hands AND face must all resolve.
 * Partial masks (outfit-only, missing hands, missing face) return ok:false
 * and never emit occlusion_source `"sam3"`.
 */

import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";
import {
  buildCompleteSam3OcclusionAlpha,
  sam3MaskedRgbToAlpha,
  type OcclusionSource,
  type RgbaImage,
} from "./stillRepairOcclusion.ts";

const SIGN_TTL = 2700;

function ccSwitchxUrl(composeLookCcUrl: string): string {
  return composeLookCcUrl.replace(/\/compose-look\/?$/, "/switchx-restyle");
}

export type Sam3OcclusionResult =
  | {
      ok: true;
      alpha: Float32Array;
      width: number;
      height: number;
      occlusion_source: "sam3";
      prompts: { outfit: string; hands: string; face: string };
    }
  | {
      ok: false;
      reason: string;
      occlusion_source: "unavailable";
    };

async function decodeMaskedRgb(bytes: Uint8Array): Promise<RgbaImage> {
  const img = await Image.decode(bytes);
  return { width: img.width, height: img.height, data: new Uint8Array(img.bitmap) };
}

async function segmentOne(input: {
  switchxUrl: string;
  proxySecret: string;
  imageUrl: string;
  prompt: string;
}): Promise<RgbaImage | null> {
  const segResp = await fetch(input.switchxUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Proxy-Secret": input.proxySecret,
    },
    body: JSON.stringify({
      action: "segment-image",
      image_url: input.imageUrl,
      prompt: input.prompt,
    }),
  });
  const segText = await segResp.text();
  let segJson: Record<string, unknown> = {};
  try {
    segJson = JSON.parse(segText) as Record<string, unknown>;
  } catch {
    /* keep empty */
  }
  if (!segResp.ok) return null;
  const imageUrl = segJson.image_url;
  if (typeof imageUrl !== "string" || !imageUrl) return null;
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) return null;
  const bytes = new Uint8Array(await imgResp.arrayBuffer());
  try {
    return await decodeMaskedRgb(bytes);
  } catch {
    return null;
  }
}

/**
 * Resolve complete SAM-3 outfit−hands−face α for a still in project storage.
 * Returns ok:false (never `"sam3"`) when any required segment fails.
 */
export async function resolveSam3StillOcclusion(input: {
  // deno-lint-ignore no-explicit-any
  admin: { storage: any };
  stillBucket: string;
  stillPath: string;
  dilatePx?: number;
  outfitPrompt?: string;
  handsPrompt?: string;
  facePrompt?: string;
}): Promise<Sam3OcclusionResult> {
  const composeCcUrl = Deno.env.get("COMPOSE_LOOK_CC_URL") ?? "";
  const proxySecret =
    Deno.env.get("SWITCHX_PROXY_SECRET")?.trim() ||
    Deno.env.get("COMPOSE_LOOK_PROXY_SECRET")?.trim() ||
    "";
  if (!composeCcUrl || !proxySecret) {
    return {
      ok: false,
      reason: "sam3_secrets_missing",
      occlusion_source: "unavailable",
    };
  }

  const { data: signed, error: signErr } = await input.admin.storage
    .from(input.stillBucket)
    .createSignedUrl(input.stillPath, SIGN_TTL);
  if (signErr || !signed?.signedUrl) {
    return {
      ok: false,
      reason: "sam3_still_sign_failed",
      occlusion_source: "unavailable",
    };
  }

  const switchxUrl = ccSwitchxUrl(composeCcUrl);
  const outfitPrompt = input.outfitPrompt ?? "clothing";
  const handsPrompt = input.handsPrompt ?? "hands";
  const facePrompt = input.facePrompt ?? "face";

  const outfitImg = await segmentOne({
    switchxUrl,
    proxySecret,
    imageUrl: signed.signedUrl,
    prompt: outfitPrompt,
  });
  if (!outfitImg) {
    return { ok: false, reason: "sam3_outfit_failed", occlusion_source: "unavailable" };
  }

  // REQUIRED for Architecture C logo_chest: hands + face must succeed.
  // Do not treat occluders as best-effort — partial masks must not report "sam3".
  const handsImg = await segmentOne({
    switchxUrl,
    proxySecret,
    imageUrl: signed.signedUrl,
    prompt: handsPrompt,
  });
  if (!handsImg) {
    return { ok: false, reason: "sam3_hands_failed", occlusion_source: "unavailable" };
  }

  const faceImg = await segmentOne({
    switchxUrl,
    proxySecret,
    imageUrl: signed.signedUrl,
    prompt: facePrompt,
  });
  if (!faceImg) {
    return { ok: false, reason: "sam3_face_failed", occlusion_source: "unavailable" };
  }

  const built = buildCompleteSam3OcclusionAlpha({
    width: outfitImg.width,
    height: outfitImg.height,
    outfit: sam3MaskedRgbToAlpha(outfitImg),
    hands: sam3MaskedRgbToAlpha(handsImg),
    face: sam3MaskedRgbToAlpha(faceImg),
    dilatePx: input.dilatePx ?? 12,
  });
  if (!built.ok) {
    return { ok: false, reason: built.reason, occlusion_source: "unavailable" };
  }

  return {
    ok: true,
    alpha: built.alpha,
    width: outfitImg.width,
    height: outfitImg.height,
    occlusion_source: "sam3",
    prompts: { outfit: outfitPrompt, hands: handsPrompt, face: facePrompt },
  };
}

export type { OcclusionSource };
