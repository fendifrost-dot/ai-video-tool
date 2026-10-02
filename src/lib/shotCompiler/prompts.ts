/**
 * Prompt locks + look-preset wrap — mirrors scripts/broll/run_world_batch.py wrap() / angle_prompt().
 */

import type { LookPreset, MotionContract } from "./types";

export const PROMPT_LOCKS = {
  noOnScreenText: "No on-screen text, captions, logos, or watermarks.",
  noExtraCharacters: "No extra characters not named in the beat.",
  identityHold:
    "Keep face, proportions, glasses, and skin unchanged; wardrobe changes only under occlusion when wardrobe refs are supplied.",
  diegeticOnly: "Diegetic sound only — the song bed is timeline-side.",
} as const;

const DEFAULT_MAX_CHARS = 1000;

/**
 * Preamble + scene (+ motion) + suffix. Providers cap the prompt: drop preamble first, then suffix, never the scene.
 * For i2v where the still already carries the look, pass preamble=false.
 */
export function wrapPrompt(
  prompt: string,
  look: LookPreset | null | undefined,
  opts: { motion?: string; maxChars?: number; preamble?: boolean } = {},
): string {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const usePreamble = opts.preamble !== false;
  const pre = usePreamble ? (look?.preamble ?? "").trim() : "";
  const suf = (look?.shot_suffix ?? "").trim();
  const core = prompt.trim() + (opts.motion?.trim() ? ` ${opts.motion.trim()}` : "");
  for (const parts of [
    [pre, core, suf],
    [core, suf],
    [core],
  ] as const) {
    const out = parts.filter(Boolean).join(" ");
    if (out.length <= maxChars) return out;
  }
  return core.slice(0, maxChars);
}

/** Motion contract → one motion sentence for shots.json `motion` field. */
export function motionContractToSentence(m: MotionContract): string {
  return [m.entrance, m.primary, m.secondary, m.exit].filter((s) => s?.trim()).join(" ");
}

/** Camera move object → compact motion clause (for world / broll prompts). */
export function cameraMoveToSentence(move: {
  type: string;
  amount: number;
  ease?: string;
  handheld?: number;
  lens?: string;
  direction?: string;
}): string {
  const bits = [
    `${move.type} ${move.amount}`,
    move.ease ? `ease ${move.ease}` : "",
    move.direction ? move.direction : "",
    move.lens ? move.lens : "",
    move.handheld != null ? `handheld ${move.handheld}` : "",
  ].filter(Boolean);
  return bits.join(", ");
}

/**
 * Seedance angle prompt — mirror run_world_batch.py angle_prompt().
 * @Video1 = real take (identity from the clip). keep[] wardrobe constants required.
 */
export function seedanceAnglePrompt(
  angle: string,
  keep: string[],
  look: LookPreset | null | undefined,
  withImage: boolean,
): string {
  const keepStr = keep.filter(Boolean).join(", ") || "his face, hair, skin and every piece of wardrobe";
  const parts = [
    `@Video1 is the performer, rapping to camera. Re-shoot the exact same performance from a second camera: ${angle}`,
    `Keep everything identical to @Video1 — ${keepStr} — and most of all the same mouth movements at the same moments, word for word, in sync with @Video1 from the first frame to the last.`,
  ];
  if (withImage) {
    parts.push(
      "Place him inside the environment of @Image1, lit by that environment's light sources; the environment is still, only he and the camera move.",
    );
  } else {
    parts.push("The same room, the same light.");
  }
  if (look?.shot_suffix) parts.push(look.shot_suffix);
  return parts.join(" ");
}

/** Append standard negative bans where the provider accepts them (Kling / Qwen). */
export function negativePromptLocks(): string {
  return [
    "on-screen text",
    "captions",
    "logos",
    "watermarks",
    "extra people",
    "warped face",
    "plastic skin",
  ].join(", ");
}
