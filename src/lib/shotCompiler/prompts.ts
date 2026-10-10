/**
 * Prompt locks + look-preset wrap — mirrors scripts/broll/run_world_batch.py wrap() / angle_prompt().
 * wrapPrompt() is for previews and for callers that bypass the executor; compileToWorldBatch() emits the RAW scene
 * because run_world_batch.py wraps it itself.
 */

import type { LookPreset, MotionContract } from "./types";

export const PROMPT_LOCKS = {
  noOnScreenText: "No on-screen text, captions, logos, or watermarks.",
  noExtraCharacters: "No extra characters not named in the beat.",
  identityHold:
    "Keep face, proportions and skin unchanged; wardrobe changes only under occlusion when wardrobe refs are supplied.",
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

/**
 * Camera move object → what the camera does, in words a video model reads (for world / broll prompts).
 *
 * This used to emit the 2.5D engine's own parameters — "truck 0.16, ease in_out, anamorphic_35, handheld 0.25". They
 * mean something to scripts/edit/camera_engine.py and nothing to an image-to-video model, which received them as the
 * tail of its prompt on the first storyboard → Runs test (2026-10-02). The amount becomes a pace, the handheld number
 * becomes the word, and the lens preset name is dropped (the look preset already carries the lens).
 */
const CAMERA_WORDS: Record<string, (d?: string) => string> = {
  push: () => "pushes in",
  pull: () => "pulls back",
  truck: (d) => `trucks ${d === "left" ? "right to left" : "left to right"}`,
  pan: (d) => `pans ${d === "left" ? "left" : "right"}`,
  pedestal: (d) => `rises ${d === "down" ? "down" : "up"}`.replace("rises down", "lowers"),
  crane: (d) => (d === "up" ? "cranes up" : "cranes down"),
  orbit: (d) => `arcs ${d === "left" ? "left" : "right"} around the subject`,
  whip_pan: (d) => `whips ${d === "left" ? "left" : "right"}`,
  snap_zoom: () => "snaps in",
  dolly_zoom: () => "holds the subject while the background rushes (dolly zoom)",
  handheld: () => "is handheld, breathing with the action",
  static: () => "is locked off",
};

export function cameraMoveToSentence(move: {
  type: string;
  amount: number;
  ease?: string;
  handheld?: number;
  lens?: string;
  direction?: string;
}): string {
  const words = CAMERA_WORDS[move.type];
  if (!words) return "";
  const still = move.type === "static" || move.type === "handheld" || move.type === "dolly_zoom";
  const pace = still ? "" : move.type === "whip_pan" || move.type === "snap_zoom" ? "" : move.amount >= 0.2 ? " fast" : " slowly";
  const hand = move.type !== "handheld" && (move.handheld ?? 0) >= 0.3 ? ", handheld" : "";
  return `The camera ${words(move.direction)}${pace}${hand}.`;
}

/**
 * How he is put into the place. Told only "lit by that environment's light sources", the model keeps the take's own
 * even light on him whatever the place looks like: in a blacked-out place he came back front-lit, and against a dark
 * one with a pale fringe round him — a cut-out, not a man standing there. So the light is said both ways (what the
 * place has, and what must not be added) and the edge and the texture are named.
 */
export const PLACE_LIGHT =
  "Place him inside the environment of @Image1, lit only by the light that environment has: where @Image1 is dark he is dark, " +
  "and nothing adds a key light, a fill light or a glow on him that the place does not have. " +
  "He has no bright outline, halo or cut-out edge against the background, and he has the same focus and grain as the place. " +
  "The environment is still, only he and the camera move.";

const STILL_PLACE = "The environment is still, only he and the camera move.";
/**
 * The same, for a shot whose request carries timed changes of the place or its light. "The environment is still"
 * beside "from 4.7 s the pool of light dies" is one request saying two things: the first restaging asked for with a
 * timed script would have been told both.
 */
export const PLACE_LIGHT_CHANGING = PLACE_LIGHT.replace(
  STILL_PLACE,
  "The environment changes only as the timed changes say, at the seconds they say; until then and apart from them it is still, and only he and the camera move.",
);

/** What a restaging dresses him in: each garment by what it is called, in the order its picture is sent, and the outfit's own words. */
export type DressWords = { pieces: readonly string[]; words?: string };

/**
 * The sentences that dress him from pictures. The take's clothes are refused by name first — told only "he wears
 * the coat of @Image2" beside a take in a camouflage shirt, the model has two answers for what is on his body. Each
 * garment is named by the position of its own picture (the place, when there is one, is @Image1, so the garments
 * follow it). What the pictures do not replace is the take's: his glasses and jewellery are his, and a restaging that
 * dropped them would be a different man. The shape is the one the shot-19 tests of 10 Oct 2026 were asked with
 * (docs/research/results/2026-10-10-dressed-restage) — the shape, not the words: those tests named each garment's
 * construction by hand, and this names it by its wardrobe label. This wording has not been sent to the model yet.
 */
export function dressSentences(dress: DressWords, firstImage: number): string {
  const names = dress.pieces.map((label, i) => `the garment of @Image${firstImage + i} (${label.replace(/\s+/g, " ").trim()})`);
  const list = names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const one = dress.pieces.length === 1;
  const words = (dress.words ?? "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  return [
    "He does NOT wear the clothes of @Video1.",
    `He wears ${list}.`,
    words ? `As the outfit is worn: ${words}.` : "",
    `Reproduce ${one ? "it" : "each"} exactly as its picture shows it — cut, colour, fabric, seams, hardware and any mark on it — and do not redesign it; its front is worn to the front of his body.`,
    `${one ? "It replaces" : "Each replaces"} what he wears in its place in @Video1; anything else he has on in @Video1 — his glasses, his jewellery — stays exactly as it is there.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Seedance angle prompt — mirror run_world_batch.py angle_prompt().
 * @Video1 = real take (identity from the clip). keep[] wardrobe constants required.
 * `opts.timedChanges` = the angle sentence carries a script of changes inside the shot (storyboard/temporal.ts).
 * `opts.dress` = he is dressed from garment pictures instead of keeping the take's clothes (storyboard/restage.ts);
 * the Python runner has no such thing and refuses a shot that carries one.
 */
export function seedanceAnglePrompt(
  angle: string,
  keep: string[],
  look: LookPreset | null | undefined,
  withImage: boolean,
  opts: { timedChanges?: boolean; dress?: DressWords | null } = {},
): string {
  const keepStr = keep.filter(Boolean).join(", ") || "his face, hair, skin and every piece of wardrobe";
  const dress = opts.dress && opts.dress.pieces.length > 0 ? opts.dress : null;
  const parts = [
    `@Video1 is the performer, rapping to camera. Re-shoot the exact same performance from a second camera: ${angle}`,
    // "everything identical" beside "he does not wear the clothes of @Video1" is one request saying two things
    dress
      ? `Keep ${keepStr} identical to @Video1 — and most of all the same mouth movements at the same moments, word for word, in sync with @Video1 from the first frame to the last.`
      : `Keep everything identical to @Video1 — ${keepStr} — and most of all the same mouth movements at the same moments, word for word, in sync with @Video1 from the first frame to the last.`,
  ];
  if (dress) parts.push(dressSentences(dress, withImage ? 2 : 1));
  if (withImage) {
    parts.push(opts.timedChanges ? PLACE_LIGHT_CHANGING : PLACE_LIGHT);
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
