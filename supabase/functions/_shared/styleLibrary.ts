// Style Learn library. Pure: no network, no provider call, no database.
//
// A learned effect is recreated in this order:
//   1. code — ffmpeg, or a per-frame numpy/shader recipe in scripts/style/recipes.py
//   2. local_model — a free open-source model already named here (MediaPipe, RAFT), run on the machine if it is installed
//   3. generative — only when the effect invents something that was not filmed. The recipe names an AVT
//      function that already exists. This module does not call it.
//
// There is already a public.style_profiles table (timeline color/vfx rows). This library is not that table.

import type { StyleProfile } from "./styleLearn.ts";

export const RECIPE_TIERS = ["code", "local_model", "generative"] as const;
export type RecipeTier = (typeof RECIPE_TIERS)[number];

export type StyleRecipe = {
  tier: RecipeTier;
  /** ffmpeg filter, per_frame python recipe, a local model name, or the existing AVT function. */
  kind: "ffmpeg" | "per_frame" | "local_model" | "avt_tool";
  filter: string | null;
  /** scripts/style/recipes.py --recipe */
  per_frame: string | null;
  params: Record<string, number | string | boolean>;
  timing: string;
  /** Set only for tier generative. An existing AVT edge function. Never a new integration. */
  avt_function: string | null;
  avt_route: string | null;
  /** Why this tier, in plain words. Required when tier is generative. */
  why: string;
};

export type StyleEffect = {
  id: string;
  taxonomy_id: string;
  plain: string;
  names: string[];
  aliases: string[];
  category: string;
  mood: string;
  intensity: number;
  tempo_sync: boolean;
  start: number;
  end: number;
  source_label: string;
  signals: Record<string, number>;
  recipe: StyleRecipe;
  preview: { time: number; thumbnail_jpeg_base64: string; clip: string | null };
  variant_of: string | null;
  effect_key: string;
};

export type StyleResolution = {
  code: number;
  local_model: number;
  generative: number;
  counts: { code: number; local_model: number; generative: number };
};

export type TaxonomyEntry = {
  id: string;
  category: string;
  mood: string;
  names: string[];
  aliases: string[];
  plain: string;
  tempo_sync: boolean;
  recipe: StyleRecipe;
  test: (signals: Record<string, number>) => boolean;
};

const code = (
  filter: string | null,
  perFrame: string | null,
  why: string,
  params: Record<string, number | string | boolean> = {},
  timing = "on the measured window",
): StyleRecipe => ({
  tier: "code",
  kind: perFrame ? "per_frame" : "ffmpeg",
  filter,
  per_frame: perFrame,
  params,
  timing,
  avt_function: null,
  avt_route: null,
  why,
});

const localModel = (name: string, why: string): StyleRecipe => ({
  tier: "local_model",
  kind: "local_model",
  filter: null,
  per_frame: null,
  params: { model: name, cpu_capable: true },
  timing: "on the measured window",
  avt_function: null,
  avt_route: null,
  why,
});

const avt = (fn: string, route: string | null, why: string): StyleRecipe => ({
  tier: "generative",
  kind: "avt_tool",
  filter: null,
  per_frame: null,
  params: {},
  timing: "a new shot, not a filter on this frame",
  avt_function: fn,
  avt_route: route,
  why,
});

/** Starter list. An effect may also use any other taxonomy_id; search still matches its own words. */
export const STYLE_TAXONOMY: readonly TaxonomyEntry[] = [
  {
    id: "hard_cut",
    category: "transition",
    mood: "sharp",
    names: ["hard cut", "cut"],
    aliases: ["smash cut", "straight cut"],
    plain: "the picture cuts",
    tempo_sync: true,
    recipe: code(null, null, "A cut is a timing rule. Nothing is generated."),
    test: (s) => (s.hard_cut ?? 0) > 0.5,
  },
  {
    id: "crossfade",
    category: "transition",
    mood: "soft",
    names: ["crossfade", "dissolve"],
    aliases: ["mix", "fade"],
    plain: "one shot dissolves into the next",
    tempo_sync: false,
    recipe: code("xfade=fade", null, "ffmpeg xfade mixes the two shots that were filmed."),
    test: (s) => (s.crossfade ?? 0) > 0.5,
  },
  {
    id: "flash",
    category: "light",
    mood: "hard",
    names: ["flash", "white frame"],
    aliases: ["flash frame", "white hit", "strobe hit"],
    plain: "the screen flashes white",
    tempo_sync: true,
    recipe: code(
      "xfade=fadewhite",
      null,
      "A white frame is a brightness ramp on the frames you have.",
    ),
    test: (s) => (s.luma_spike ?? 0) >= 0.75,
  },
  {
    id: "dip_to_black",
    category: "light",
    mood: "heavy",
    names: ["dip to black", "fade to black"],
    aliases: ["black frame"],
    plain: "the picture drops to black",
    tempo_sync: false,
    recipe: code("fade=t=out:color=black", null, "A fade to black is a brightness ramp."),
    test: (s) => (s.luma_dip ?? 0) >= 0.7,
  },
  {
    id: "whip",
    category: "camera",
    mood: "fast",
    names: ["whip pan"],
    aliases: ["swish pan", "blur transition"],
    plain: "the camera whips and the picture smears",
    tempo_sync: true,
    recipe: code(
      null,
      "motion_blur",
      "The smear is a per-frame blur of the frames that were filmed. It suggests a whip; it is not a new camera move.",
    ),
    test: (s) => (s.whip ?? 0) > 0.5 || ((s.blur ?? 0) > 0.55 && (s.motion_spike ?? 0) > 0.45),
  },
  {
    id: "zoom_punch",
    category: "camera",
    mood: "punchy",
    names: ["zoom punch", "punch-in"],
    aliases: ["snap zoom", "crash zoom"],
    plain: "the shot punches in",
    tempo_sync: true,
    recipe: code("scale+crop", null, "A punch-in is a crop of the filmed frame."),
    test: (s) => (s.zoom ?? 0) >= 0.35,
  },
  {
    id: "shake",
    category: "camera",
    mood: "restless",
    names: ["camera shake"],
    aliases: ["handheld", "wobble"],
    plain: "the frame shakes",
    tempo_sync: false,
    recipe: code(
      "crop sine",
      null,
      "Shake is a small crop offset on the filmed frame. Withheld on a performance take when it is heavy.",
    ),
    test: (s) => (s.shake ?? 0) >= 0.35,
  },
  {
    id: "slow_motion",
    category: "speed",
    mood: "heavy",
    names: ["slow motion"],
    aliases: ["slo-mo", "overcrank"],
    plain: "the picture slows down",
    tempo_sync: false,
    recipe: code("setpts", null, "Speed is a timing rule. On a performance take it stays at 1."),
    test: (s) => (s.speed_slow ?? 0) > 0.5,
  },
  {
    id: "fast_motion",
    category: "speed",
    mood: "fast",
    names: ["fast motion", "speed ramp"],
    aliases: ["undercrank", "ramp"],
    plain: "the picture speeds up",
    tempo_sync: true,
    recipe: code("setpts", null, "Speed is a timing rule. On a performance take it stays at 1."),
    test: (s) => (s.speed_fast ?? 0) > 0.5,
  },
  {
    id: "freeze",
    category: "speed",
    mood: "still",
    names: ["freeze frame"],
    aliases: ["hold frame", "frame hold"],
    plain: "the picture holds still",
    tempo_sync: false,
    recipe: code(null, "freeze", "A freeze repeats a frame that was filmed."),
    test: (s) => (s.freeze ?? 0) >= 0.6,
  },
  {
    id: "grade",
    category: "color",
    mood: "graded",
    names: ["color grade", "grade"],
    aliases: ["lut", "look"],
    plain: "the color is graded",
    tempo_sync: false,
    recipe: code(
      "lut3d",
      null,
      "The grade is a generated .cube from the measured lift, gamma, gain, contrast and saturation.",
    ),
    test: (s) => (s.grade ?? 0) >= 0.35,
  },
  {
    id: "grain",
    category: "texture",
    mood: "filmic",
    names: ["film grain"],
    aliases: ["grain", "noise"],
    plain: "the picture is grainy",
    tempo_sync: false,
    recipe: code("noise", null, "Grain is procedural noise on the filmed frame."),
    test: (s) => (s.grain ?? 0) >= 0.25,
  },
  {
    id: "vignette",
    category: "lens",
    mood: "close",
    names: ["vignette"],
    aliases: ["falloff", "dark corners"],
    plain: "the corners fall dark",
    tempo_sync: false,
    recipe: code("vignette", null, "A vignette is a falloff on the filmed frame."),
    test: (s) => (s.vignette ?? 0) >= 0.25,
  },
  {
    id: "letterbox",
    category: "frame",
    mood: "wide",
    names: ["letterbox"],
    aliases: ["bars", "aspect matte"],
    plain: "black bars frame the picture",
    tempo_sync: false,
    recipe: code("pad", null, "Bars are a pad around the filmed frame."),
    test: (s) => (s.letterbox ?? 0) > 0.5,
  },
  {
    id: "strobe",
    category: "light",
    mood: "hard",
    names: ["strobe"],
    aliases: ["flicker", "pulsing light"],
    plain: "the brightness pulses",
    tempo_sync: true,
    recipe: code(
      "eq=brightness",
      null,
      "A strobe is a timed brightness pulse on the filmed frames.",
    ),
    test: (s) => (s.strobe ?? 0) > 0.5,
  },
  {
    id: "rgb_split",
    category: "glitch",
    mood: "digital",
    names: ["RGB split"],
    aliases: ["chromatic split", "channel offset"],
    plain: "the color channels slide apart",
    tempo_sync: false,
    recipe: code(
      "rgbashift",
      "chromatic",
      "The channels of the filmed frame are slid. Withheld on a performance take.",
    ),
    test: (s) => (s.rgb_shift ?? 0) >= 0.2,
  },
  {
    id: "chromatic_aberration",
    category: "lens",
    mood: "optical",
    names: ["chromatic aberration"],
    aliases: ["color fringing", "fringe"],
    plain: "color fringes the edges",
    tempo_sync: false,
    recipe: code(null, "chromatic", "A small channel shift on the filmed frame."),
    test: (s) => (s.rgb_shift ?? 0) >= 0.08 && (s.rgb_shift ?? 0) < 0.2,
  },
  {
    id: "glitch",
    category: "glitch",
    mood: "broken",
    names: ["glitch"],
    aliases: ["tear", "datamosh-like", "block tear"],
    plain: "rows of the picture tear",
    tempo_sync: false,
    recipe: code(
      null,
      "row_glitch",
      "Rows of the filmed frame are shifted. It does not invent a new object. Withheld on a performance take.",
    ),
    test: (s) => (s.row_tear ?? 0) >= 0.2,
  },
  {
    id: "vhs",
    category: "texture",
    mood: "retro",
    names: ["VHS"],
    aliases: ["tape", "tracking"],
    plain: "it looks like a worn tape",
    tempo_sync: false,
    recipe: code(null, "vhs", "Scanlines, noise and a chroma shift on the filmed frame."),
    test: (s) => (s.vhs ?? 0) >= 0.5,
  },
  {
    id: "halation",
    category: "light",
    mood: "soft",
    names: ["halation"],
    aliases: ["glow", "bloom"],
    plain: "the highlights glow",
    tempo_sync: false,
    recipe: code(null, "halation", "A blur of the bright pixels added back onto the filmed frame."),
    test: (s) => (s.halation ?? 0) >= 0.45,
  },
  {
    id: "light_leak",
    category: "light",
    mood: "warm",
    names: ["light leak"],
    aliases: ["flare", "leak"],
    plain: "a warm leak washes the frame",
    tempo_sync: false,
    recipe: code(
      null,
      "light_leak",
      "A procedural color wash over the filmed frame. Not a new light that was photographed.",
    ),
    test: (s) => (s.light_leak ?? 0) >= 0.45,
  },
  {
    id: "motion_blur",
    category: "camera",
    mood: "fast",
    names: ["motion blur"],
    aliases: ["smear", "directional blur"],
    plain: "the motion smears",
    tempo_sync: false,
    recipe: code(null, "motion_blur", "A directional blur of the filmed frame."),
    test: (s) => (s.blur ?? 0) >= 0.5 && (s.motion ?? 0) >= 0.25,
  },
  {
    id: "mirror",
    category: "frame",
    mood: "graphic",
    names: ["mirror", "split screen"],
    aliases: ["kaleidoscope-like", "symmetry"],
    plain: "the frame mirrors itself",
    tempo_sync: false,
    recipe: code(null, "mirror", "Half the filmed frame is flipped onto the other half."),
    test: (s) => (s.mirror ?? 0) >= 0.65,
  },
  {
    id: "kaleidoscope",
    category: "frame",
    mood: "graphic",
    names: ["kaleidoscope"],
    aliases: ["radial mirror"],
    plain: "the frame repeats in a kaleidoscope",
    tempo_sync: false,
    recipe: code(
      null,
      "kaleidoscope",
      "The filmed frame is tiled and flipped. Nothing new is drawn.",
    ),
    test: (s) => (s.kaleidoscope ?? 0) >= 0.5,
  },
  {
    id: "pixel_sort",
    category: "glitch",
    mood: "digital",
    names: ["pixel sort"],
    aliases: ["pixel sorting", "streak"],
    plain: "pixels streak into lines",
    tempo_sync: false,
    recipe: code(null, "pixel_sort", "Pixels of the filmed frame are sorted into streaks."),
    test: (s) => (s.pixel_sort ?? 0) >= 0.5,
  },
  {
    id: "trails",
    category: "time",
    mood: "ghostly",
    names: ["trails", "echo"],
    aliases: ["ghosting", "feedback", "afterimage"],
    plain: "an echo of the last frame stays on screen",
    tempo_sync: false,
    recipe: code(
      null,
      "trails",
      "The previous filmed frame is mixed back in. A numpy frame difference stands in for optical flow; RAFT is the local upgrade when an occlusion needs a real flow field.",
    ),
    test: (s) => (s.trail ?? 0) >= 0.45,
  },
  {
    id: "lens_distortion",
    category: "lens",
    mood: "wide",
    names: ["lens distortion"],
    aliases: ["barrel", "fisheye"],
    plain: "the lens bows the frame",
    tempo_sync: false,
    recipe: code(null, "lens", "A barrel remap of the filmed frame."),
    test: (s) => (s.lens ?? 0) >= 0.5,
  },
  {
    id: "text_overlay",
    category: "overlay",
    mood: "graphic",
    names: ["text", "caption"],
    aliases: ["titles", "kinetic type", "lower third"],
    plain: "a graphic or words sit on the frame",
    tempo_sync: false,
    recipe: code(
      null,
      null,
      "The detector sees a high-contrast band. It does not read or rewrite the words. Rebuilding the same band is a crop of those pixels, not a new title.",
    ),
    test: (s) => (s.edge_band ?? 0) >= 0.4,
  },
  {
    id: "rotoscope",
    category: "mask",
    mood: "cutout",
    names: ["rotoscope", "cutout"],
    aliases: ["matte", "holdout"],
    plain: "a person or shape is cut out of the frame",
    tempo_sync: false,
    recipe: localModel(
      "mediapipe-selfie-segmenter",
      "The cutout needs a matte. MediaPipe's selfie segmenter is the free local model already used by scripts/edit/face_check.py. It is not called unless that model is on the machine. sam3-segment-proxy exists in AVT and is a paid Fal mask, so it is not this tier.",
    ),
    test: (s) => (s.matte_cutout ?? 0) >= 0.5,
  },
  {
    id: "new_scene",
    category: "generative",
    mood: "new",
    names: ["new scene", "new place"],
    aliases: ["world still", "plate", "hero frame"],
    plain: "a place that was not filmed",
    tempo_sync: false,
    recipe: avt(
      "world-still-proxy",
      "gemini-nano-banana-2.1",
      "This paints a place that was not in the footage. AVT already makes that still with world-still-proxy and the model gemini-nano-banana-2.1 (the Hero Frame / world-still path). Name that model: the tool's default is still Grok, and Grok does not ship without Fendi's words. If the still should move, the storyboard already animates it with Kling through proxy-provider-call (video-providers-higgsfield-model, kling-2.5-turbo-pro-i2v) or with Seedance through montage-shot. This library does not call them.",
    ),
    test: (s) => (s.new_scene ?? 0) >= 0.5,
  },
  {
    id: "garment_replacement",
    category: "generative",
    mood: "wardrobe",
    names: ["wardrobe swap", "garment replacement"],
    aliases: ["dress", "look composite", "clothes"],
    plain: "the clothes are replaced",
    tempo_sync: false,
    recipe: avt(
      "dress-clip",
      "higgsfield-genjutsu",
      "The garment is new pixels on footage that was filmed. On a clip, AVT already does that with dress-clip (Higgsfield Genjutsu through proxy-provider-call). A still uses wardrobe-vton-proxy or compose-look-proxy. His face is put back by the face-preserving recipe, not by a new model. This library does not call the swap.",
    ),
    test: (s) => (s.garment ?? 0) >= 0.5,
  },
  {
    id: "object_insertion",
    category: "generative",
    mood: "new",
    names: ["object insertion", "new object"],
    aliases: ["add a prop", "scene element"],
    plain: "something is added that was never filmed",
    tempo_sync: false,
    recipe: avt(
      "runway-video-edit-proxy",
      "runway-video-to-video",
      "The object was not in the take. AVT already edits an existing clip with runway-video-edit-proxy, or builds a new shot with montage-shot (Seedance 2.5 through Higgsfield). This library does not call them.",
    ),
    test: (s) => (s.new_object ?? 0) >= 0.5,
  },
  {
    id: "face_morph",
    category: "generative",
    mood: "identity",
    names: ["face morph", "face swap"],
    aliases: ["new face", "identity swap"],
    plain: "the face is replaced",
    tempo_sync: false,
    recipe: avt(
      "faceswap-proxy",
      null,
      "A new face is generated content. faceswap-proxy is the route AVT already has. It is not used on Fendi: his face stays the take's own pixels. This library does not call it.",
    ),
    test: (s) => (s.face_morph ?? 0) >= 0.5,
  },
];

const BY_ID = new Map(STYLE_TAXONOMY.map((entry) => [entry.id, entry]));

const SIGNAL_WORDS: Record<string, string> = {
  luma_spike: "the picture suddenly gets very bright",
  luma_dip: "the picture drops dark",
  color_jump: "the color jumps",
  motion_spike: "the picture lurches",
  blur: "the picture smears",
  shake: "the frame shakes",
  zoom: "the shot punches in",
  rgb_shift: "the color channels slide",
  row_tear: "rows of the picture tear",
  strobe: "the brightness pulses",
  edge_band: "a graphic sits on the frame",
  freeze: "the picture holds still",
  mirror: "the frame mirrors itself",
  grain: "the picture is grainy",
  vignette: "the corners fall dark",
};

export function taxonomyById(id: string): TaxonomyEntry | null {
  return BY_ID.get(id) ?? null;
}

export function effectKey(taxonomyId: string, tier: RecipeTier, intensity: number): string {
  return `${taxonomyId}:${tier}:${Math.round(intensity * 5)}`;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function resolutionShare(
  effects: readonly { recipe: { tier: RecipeTier } }[],
): StyleResolution {
  const counts = { code: 0, local_model: 0, generative: 0 };
  for (const effect of effects) counts[effect.recipe.tier] += 1;
  const total = effects.length;
  if (!total) return { code: 0, local_model: 0, generative: 0, counts };
  return {
    code: round3(counts.code / total),
    local_model: round3(counts.local_model / total),
    generative: round3(counts.generative / total),
    counts,
  };
}

function plainFromSignals(signals: Record<string, number>): string {
  const words = Object.entries(signals)
    .filter(([key, value]) => value >= 0.35 && Boolean(SIGNAL_WORDS[key]))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([key]) => SIGNAL_WORDS[key]);
  if (!words.length) return "something distinctive happens in the picture";
  if (words.length === 1) return words[0];
  return `${words[0]}, and ${words[1]}`;
}

/** Name every signal bag. Known taxonomy first. Anything loud that no detector owns becomes unclassified, still tier code. */
export function effectsFromSignals(
  events: readonly {
    start: number;
    end: number;
    signals: Record<string, number>;
    source_label?: string;
  }[],
  sourceLabel = "reference",
): StyleEffect[] {
  const effects: StyleEffect[] = [];
  for (const event of events) {
    const hits = STYLE_TAXONOMY.filter((entry) => entry.test(event.signals));
    const chosen = hits.length ? hits : [];
    if (!chosen.length) {
      const loud = Math.max(0, ...Object.values(event.signals));
      if (loud < 0.45) continue;
      const plain = plainFromSignals(event.signals);
      effects.push(
        makeEffect(
          effects.length,
          "unclassified",
          plain,
          ["unclassified event"],
          ["something", "the thing"],
          "open",
          "unknown",
          loud,
          false,
          event,
          sourceLabel,
          code(
            null,
            "signal_replay",
            "The measured brightness, color and motion are replayed on the new clip. No new object is drawn.",
          ),
        ),
      );
      continue;
    }
    for (const entry of chosen) {
      effects.push(
        makeEffect(
          effects.length,
          entry.id,
          entry.plain,
          entry.names,
          entry.aliases,
          entry.category,
          entry.mood,
          loudest(event.signals),
          entry.tempo_sync,
          event,
          sourceLabel,
          entry.recipe,
        ),
      );
    }
  }
  return effects;
}

function loudest(signals: Record<string, number>): number {
  const values = Object.values(signals);
  return values.length ? Math.max(...values) : 0;
}

function makeEffect(
  index: number,
  taxonomyId: string,
  plain: string,
  names: string[],
  aliases: string[],
  category: string,
  mood: string,
  intensity: number,
  tempo: boolean,
  event: { start: number; end: number; signals: Record<string, number> },
  sourceLabel: string,
  recipe: StyleRecipe,
): StyleEffect {
  const clamped = Math.max(0, Math.min(1, intensity));
  return {
    id: `fx-${index}`,
    taxonomy_id: taxonomyId,
    plain,
    names,
    aliases,
    category,
    mood,
    intensity: round3(clamped),
    tempo_sync: tempo,
    start: round3(event.start),
    end: round3(Math.max(event.end, event.start + 0.04)),
    source_label: sourceLabel,
    signals: event.signals,
    recipe,
    preview: { time: round3(event.start), thumbnail_jpeg_base64: "", clip: null },
    variant_of: null,
    effect_key: effectKey(taxonomyId, recipe.tier, clamped),
  };
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "on",
  "and",
  "or",
  "it",
  "of",
  "to",
  "in",
  "at",
  "thing",
  "that",
  "this",
  "with",
  "for",
  "is",
]);

/** "the thing at 0:42", "0:42", "at 1.5", "42s". */
export function timeInQuery(query: string): number | null {
  const clock = /(\d{1,2}):(\d{1,2}(?:\.\d+)?)/.exec(query);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const seconds = /(?:\bat\b|\b@)\s*(\d+(?:\.\d+)?)\s*s?\b/.exec(query.toLowerCase());
  if (seconds) return Number(seconds[1]);
  const bare = /^(\d+(?:\.\d+)?)s$/.exec(query.trim().toLowerCase());
  if (bare) return Number(bare[1]);
  return null;
}

export function searchEffects(effects: readonly StyleEffect[], query: string): StyleEffect[] {
  const text = query.trim();
  if (!text) return effects.filter((effect) => !effect.variant_of);
  const time = timeInQuery(text);
  if (time !== null && (text.includes(":") || /\bat\b|\bs$|\b@/.test(text.toLowerCase()))) {
    return effects.filter((effect) => time >= effect.start - 0.2 && time <= effect.end + 0.2);
  }
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP.has(token));
  if (!tokens.length) return [];
  return effects
    .map((effect) => {
      const hay = [
        effect.plain,
        effect.taxonomy_id,
        effect.category,
        effect.mood,
        ...effect.names,
        ...effect.aliases,
      ]
        .join(" ")
        .toLowerCase();
      const score = tokens.filter((token) => hay.includes(token)).length;
      return { effect, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.effect);
}

/** Same recipe key and a close intensity: keep the first as the canonical effect and link the rest. */
export function foldEffects(
  existing: readonly StyleEffect[],
  incoming: readonly StyleEffect[],
): { effects: StyleEffect[]; merged: { id: string; variant_of: string }[] } {
  const effects = existing.map((effect) => ({ ...effect }));
  const merged: { id: string; variant_of: string }[] = [];
  for (const effect of incoming) {
    const canonical = effects.find(
      (row) => !row.variant_of && row.effect_key === effect.effect_key,
    );
    if (!canonical) {
      effects.push({ ...effect, variant_of: null });
      continue;
    }
    let id = effect.id;
    if (effects.some((row) => row.id === id)) id = `${id}-v${effects.length}`;
    effects.push({ ...effect, id, variant_of: canonical.id });
    merged.push({ id, variant_of: canonical.id });
  }
  return { effects, merged };
}

/**
 * Cut rhythm from one profile, effects from any number of others.
 * The result is a profile the planner can use. It does not re-read a video.
 */
export function composeStyle(
  rhythm: StyleProfile,
  picked: readonly StyleEffect[],
  label?: string,
): StyleProfile {
  const next: StyleProfile = {
    ...rhythm,
    source: { ...rhythm.source, label: label || `${rhythm.source.label} + picked effects` },
    transitions: { ...rhythm.transitions },
    fx: { ...rhythm.fx },
    grade: { ...rhythm.grade },
    effects: picked.map((effect, index) => ({ ...effect, id: `fx-${index}`, variant_of: null })),
    resolution: resolutionShare(picked),
  };
  const ids = new Set(picked.map((effect) => effect.taxonomy_id));
  if (ids.has("flash")) next.transitions.flash = Math.max(next.transitions.flash, 0.34);
  if (ids.has("crossfade")) next.transitions.crossfade = Math.max(next.transitions.crossfade, 0.34);
  if (ids.has("whip")) next.transitions.whip = Math.max(next.transitions.whip, 0.34);
  if (ids.has("rgb_split") || ids.has("chromatic_aberration"))
    next.fx = { ...next.fx, rgb_split: true };
  if (ids.has("glitch")) next.fx = { ...next.fx, glitch: true };
  if (ids.has("strobe")) next.fx = { ...next.fx, strobe: true };
  const grade = picked.find((effect) => effect.taxonomy_id === "grade");
  if (grade) {
    const contrast = grade.recipe.params.contrast;
    const saturation = grade.recipe.params.saturation;
    next.grade = {
      ...next.grade,
      contrast: typeof contrast === "number" ? contrast : next.grade.contrast,
      saturation: typeof saturation === "number" ? saturation : next.grade.saturation,
    };
  }
  const sentences = picked.map((effect) => effect.plain);
  next.summary = sentences.length
    ? `Cut rhythm from ${rhythm.source.label}. ${sentences.join(". ")}.`
    : rhythm.summary;
  if (next.summary.length > 4000) next.summary = next.summary.slice(0, 3997) + "...";
  return next;
}

export type StyleResult<T> = { ok: true; value: T } | { ok: false; error: string };

function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function num(v: unknown, name: string, min: number, max: number): number | string {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    return `${name} must be a number from ${min} to ${max}`;
  return v;
}

export function parseStyleEffects(raw: unknown): StyleResult<StyleEffect[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw) || raw.length > 400)
    return { ok: false, error: "effects must be an array of at most 400" };
  const effects: StyleEffect[] = [];
  for (const item of raw) {
    const row = rec(item);
    if (!row) return { ok: false, error: "each effect must be an object" };
    if (typeof row.id !== "string" || row.id.length === 0 || row.id.length > 80)
      return { ok: false, error: "effect id is required" };
    if (
      typeof row.taxonomy_id !== "string" ||
      row.taxonomy_id.length === 0 ||
      row.taxonomy_id.length > 80
    )
      return { ok: false, error: "taxonomy_id is required" };
    if (typeof row.plain !== "string" || row.plain.length < 3 || row.plain.length > 400)
      return { ok: false, error: "plain description is required" };
    if (!Array.isArray(row.names) || row.names.some((name) => typeof name !== "string"))
      return { ok: false, error: "names must be strings" };
    if (!Array.isArray(row.aliases) || row.aliases.some((name) => typeof name !== "string"))
      return { ok: false, error: "aliases must be strings" };
    const start = num(row.start, "effect start", 0, 60 * 60);
    const end = num(row.end, "effect end", 0, 60 * 60);
    const intensity = num(row.intensity, "intensity", 0, 1);
    if (typeof start === "string" || typeof end === "string" || typeof intensity === "string") {
      return {
        ok: false,
        error: [start, end, intensity].find((part) => typeof part === "string") as string,
      };
    }
    if (end <= start) return { ok: false, error: `effect ${row.id} has a bad range` };
    const recipe = rec(row.recipe);
    if (!recipe || !(RECIPE_TIERS as readonly string[]).includes(String(recipe.tier)))
      return { ok: false, error: "recipe.tier must be code, local_model, or generative" };
    if (
      recipe.tier === "generative" &&
      (typeof recipe.why !== "string" ||
        recipe.why.length < 12 ||
        typeof recipe.avt_function !== "string")
    ) {
      return {
        ok: false,
        error: "a generative effect names an existing AVT function and says why in plain words",
      };
    }
    const signals = rec(row.signals) ?? {};
    for (const value of Object.values(signals)) {
      if (typeof value !== "number" || !Number.isFinite(value))
        return { ok: false, error: "signals must be numbers" };
    }
    const preview = rec(row.preview) ?? {};
    const thumb =
      typeof preview.thumbnail_jpeg_base64 === "string" ? preview.thumbnail_jpeg_base64 : "";
    if (thumb.length > 120000) return { ok: false, error: "thumbnail is too large" };
    effects.push({
      id: row.id,
      taxonomy_id: row.taxonomy_id,
      plain: row.plain,
      names: row.names as string[],
      aliases: row.aliases as string[],
      category: typeof row.category === "string" ? row.category : "",
      mood: typeof row.mood === "string" ? row.mood : "",
      intensity,
      tempo_sync: row.tempo_sync === true,
      start,
      end,
      source_label: typeof row.source_label === "string" ? row.source_label : "",
      signals: signals as Record<string, number>,
      recipe: {
        tier: recipe.tier as RecipeTier,
        kind:
          recipe.kind === "per_frame" || recipe.kind === "local_model" || recipe.kind === "avt_tool"
            ? recipe.kind
            : "ffmpeg",
        filter: typeof recipe.filter === "string" ? recipe.filter : null,
        per_frame: typeof recipe.per_frame === "string" ? recipe.per_frame : null,
        params: (rec(recipe.params) as StyleRecipe["params"]) ?? {},
        timing: typeof recipe.timing === "string" ? recipe.timing : "",
        avt_function: typeof recipe.avt_function === "string" ? recipe.avt_function : null,
        avt_route: typeof recipe.avt_route === "string" ? recipe.avt_route : null,
        why: typeof recipe.why === "string" ? recipe.why : "",
      },
      preview: {
        time: typeof preview.time === "number" ? preview.time : start,
        thumbnail_jpeg_base64: thumb,
        clip: typeof preview.clip === "string" ? preview.clip : null,
      },
      variant_of: typeof row.variant_of === "string" ? row.variant_of : null,
      effect_key:
        typeof row.effect_key === "string"
          ? row.effect_key
          : effectKey(row.taxonomy_id, recipe.tier as RecipeTier, intensity),
    });
  }
  return { ok: true, value: effects };
}

export function parseResolution(raw: unknown, effects: readonly StyleEffect[]): StyleResolution {
  if (effects.length) return resolutionShare(effects);
  const row = rec(raw);
  const counts = rec(row?.counts);
  if (
    !counts ||
    typeof counts.code !== "number" ||
    typeof counts.local_model !== "number" ||
    typeof counts.generative !== "number"
  ) {
    return resolutionShare([]);
  }
  const codeN = counts.code as number;
  const localN = counts.local_model as number;
  const genN = counts.generative as number;
  const total = codeN + localN + genN;
  if (!total)
    return {
      code: 0,
      local_model: 0,
      generative: 0,
      counts: { code: 0, local_model: 0, generative: 0 },
    };
  return {
    code: round3(codeN / total),
    local_model: round3(localN / total),
    generative: round3(genN / total),
    counts: { code: codeN, local_model: localN, generative: genN },
  };
}
