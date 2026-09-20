// Shared, pure "Look generation contract" for AVT.
//
// One input schema + one prompt composer that EVERY look-generation lane can
// reuse (generative look_composite, garment-truth, Compose / Virtual Sample,
// and any future project's look lane). It is dependency-free so it can be:
//   - unit-tested with vitest, and
//   - imported by Deno edge functions (grok-image-look-composite, …).
//
// WHY THIS EXISTS (mechanism, not a one-off):
// The Hero Frame / Compose lanes shipped close-up "car-selfie" garbage because
// framing was left to whatever prose the caller happened to type. There was no
// mechanical guarantee that a wardrobe look would be full-body, 9:16, feet
// visible, logo un-warped. This module makes framing a first-class, typed input
// and DERIVES the framing constraints + protective negatives from it — the
// caller can no longer forget them. No project-specific (YSL) strings live here.

import { composeLookCompositePrompt } from "./lookCompositePrompt.ts";

/** How the subject should be framed in the generated look.
 *  - full_body: head-to-toe, feet visible — the DEFAULT for wardrobe looks.
 *  - hero:      waist-up hero portrait (still vertical). Wardrobe upper-body.
 *  - broll:     no forced framing; the lane opts into whatever crop it wants. */
export type LookFraming = "full_body" | "hero" | "broll";

/** The one shared input schema for every look-generation lane. */
export type LookGenerationInput = {
  /** Identity anchor storage path(s) — WHO the person is. At least one. */
  identityPaths: string[];
  /** Optional garment/look reference still — WHAT they wear (garment lanes). */
  garmentPath?: string | null;
  /** Positive prompt: the look, wardrobe, scene. Required. */
  prompt: string;
  /** Optional caller negatives — merged with the framing defaults. */
  negativePrompt?: string | null;
  /** Target aspect ratio, "W:H". Defaults to 9:16 (vertical). */
  aspect?: string;
  /** Framing intent. Defaults to full_body for wardrobe looks. */
  framing?: LookFraming;
};

export type ComposedLookGeneration = {
  aspect: string;
  framing: LookFraming;
  /** Base prompt + mechanically-injected framing sentence. */
  positivePrompt: string;
  /** Caller negatives merged with framing-default negatives (deduped). */
  negativePrompt: string | null;
  /** Final single string to hand to a one-prompt engine (xAI /images/edits):
   *  positive + an "Avoid: …" clause. */
  promptSent: string;
};

export const DEFAULT_ASPECT = "9:16";
export const DEFAULT_FRAMING: LookFraming = "full_body";

/** Framing constraint sentence, parameterised by aspect. Empty = no injection. */
function framingPositive(framing: LookFraming, aspect: string): string {
  switch (framing) {
    case "full_body":
      return (
        `Full-body head-to-toe composition in a ${aspect} vertical frame: ` +
        `the entire subject is visible from the top of the head down to the feet, ` +
        `with the feet resting near the bottom edge and the floor/ground beneath them. ` +
        `Full headroom, complete outfit and silhouette in view, standing at a natural distance from camera.`
      );
    case "hero":
      return (
        `Hero portrait composition in a ${aspect} vertical frame: waist-up framing of ` +
        `the subject, confident and centered, wardrobe and upper silhouette clearly visible.`
      );
    case "broll":
      return "";
  }
}

/** Protective negatives that must never be forgotten for a given framing. */
function framingNegatives(framing: LookFraming): string[] {
  switch (framing) {
    case "full_body":
      return [
        "close-up",
        "headshot",
        "cropped face",
        "face crop",
        "cropped at the waist",
        "cropped at the knees",
        "cut-off legs",
        "feet out of frame",
        "feet cut off",
        "bare legs",
        "exposed thighs",
        "warped logo",
        "distorted text",
        "extra limbs",
      ];
    case "hero":
      return ["extreme close-up", "cropped face", "warped logo", "distorted text", "extra limbs"];
    case "broll":
      return [];
  }
}

/** Split a comma/newline-separated negative string into trimmed tokens. */
function splitNegatives(neg?: string | null): string[] {
  if (!neg) return [];
  return neg
    .split(/[,\n]/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

/** Merge framing-default negatives with caller negatives, deduped case-insensitively.
 *  Caller order is preserved first so their emphasis leads; framing defaults fill in. */
export function mergeNegatives(callerNeg: string | null | undefined, framing: LookFraming): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of [...splitNegatives(callerNeg), ...framingNegatives(framing)]) {
    const key = tok.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tok);
  }
  return out.length ? out.join(", ") : null;
}

/** Parse "W:H" (or "W/H", "W x H") into a numeric ratio. Returns null if unparseable. */
export function parseAspectRatio(aspect: string | null | undefined): number | null {
  if (!aspect) return null;
  const m = aspect.trim().match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!(w > 0) || !(h > 0)) return null;
  return w / h;
}

/**
 * THE mechanism: turn a LookGenerationInput into the exact prompt/negatives an
 * engine should receive, with framing constraints injected deterministically.
 *
 * Same behaviour for every lane — garment-truth callers pass framing:"broll"
 * (source photo already fixes the crop) and still get the protective negatives
 * merged; generative look_composite callers pass framing:"full_body" and get
 * head-to-toe constraints. No caller can silently ship a close-up wardrobe look.
 */
export function composeLookGeneration(input: LookGenerationInput): ComposedLookGeneration {
  const aspect = (input.aspect ?? "").trim() || DEFAULT_ASPECT;
  const framing = input.framing ?? DEFAULT_FRAMING;
  const base = (input.prompt ?? "").trim();

  const inject = framingPositive(framing, aspect);
  const positivePrompt = inject ? `${base}\n\n${inject}` : base;
  const negativePrompt = mergeNegatives(input.negativePrompt, framing);
  const promptSent = composeLookCompositePrompt(positivePrompt, negativePrompt);

  return { aspect, framing, positivePrompt, negativePrompt, promptSent };
}
