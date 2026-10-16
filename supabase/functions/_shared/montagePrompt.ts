// Deno copy of the pure words of a montage — src/lib/storyboard/montage.ts (the scenes, the style, the sync rule),
// src/lib/storyboard/restage.ts (NEVER_WIDER, the keep list, the restage seconds) and src/lib/shotCompiler/prompts.ts
// (seedanceAnglePrompt, PLACE_LIGHT) with the default look's suffix (src/lib/shotCompiler/lookPresets.ts). Edge
// functions deploy from this folder alone and cannot import "@/…", so the words live twice; montagePrompt.test.ts
// holds the two copies together word for word, so a montage shot from the MCP (montage-shot) is the montage the
// storyboard's own button shoots.

export const MONTAGE_VERSION = "montage-v1-2026-10-16";
export const MONTAGE_LINES_MAX = 1200;
export const MONTAGE_MIN_SCENE_SECONDS = 0.4;
export const MONTAGE_MAX_SCENES = 8;

export const MONTAGE_STYLE =
  "shot like news footage: shaky handheld camerawork, quick optical zooms, 35mm film grain, muted warm night colours, fast cuts. " +
  "Deadpan: nobody and nothing in the place reacts to anything unusual.";

export const MONTAGE_SYNC =
  "Whenever he is on screen his mouth movements are exactly @Video1's at that same second, word for word, in sync from the first frame to the last; " +
  "a cutaway does not pause, repeat or shift the performance — it continues underneath and is where @Video1 is when the picture comes back to him.";

export const NEVER_WIDER =
  "Never show more of his body than @Video1 shows, in any frame from the first to the last: whatever is out of frame in @Video1 stays out of frame here.";

export const PLACE_LIGHT =
  "Place him inside the environment of @Image1, lit only by the light that environment has: where @Image1 is dark he is dark, " +
  "and nothing adds a key light, a fill light or a glow on him that the place does not have. " +
  "He has no bright outline, halo or cut-out edge against the background, and he has the same focus and grain as the place. " +
  "The environment is still, only he and the camera move.";

/** The default look (film_bar_v1) every storyboard restaging is sent with. */
export const DEFAULT_LOOK_PRESET_ID = "film_bar_v1";
export const DEFAULT_LOOK_SUFFIX =
  "24fps film grain. Cinematic, gritty, found-footage aesthetic. No clean or polished shots; it always feels captured in the moment.";

/** What the model accepts as a source, seconds (restage.ts). */
export const RESTAGE_MIN_SECONDS = 4;
export const RESTAGE_MAX_SECONDS = 12;
export const RESTAGE_RESOLUTION = "720p" as const;
export const FRAME_ALLOWANCE = 0.042;

export type MontageScene = { from: number; to: number; text: string };

export function defaultMontageLines(thing: string | null): string {
  const it = thing?.trim() || null;
  return [
    "him rapping straight to camera, a medium shot from the waist up, the place behind him",
    "HARD CUT to his profile from the side, a different camera, still rapping",
    it
      ? `HARD CUT to a tight shot of ${it}, a quick optical zoom in on its face; it does not react`
      : "HARD CUT to a quick optical zoom past him down the street, traffic and lights",
    it
      ? `HARD CUT: a small child walks up to ${it} and pets it; it stays calm; nobody reacts`
      : "HARD CUT: a passer-by walks through behind him without a glance",
  ].join("\n");
}

export function thingOfLabel(label: string | null | undefined): string | null {
  const l = (label ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();
  if (!l) return null;
  if (/\bbear\b/.test(l)) return "the polar bear";
  if (/\b(t ?rex|dino(saur)?)\b/.test(l)) return "the T-rex";
  if (/\bhorse\b/.test(l)) return "the horse";
  const m =
    /\b(tiger|lion|elephant|giraffe|dog|cat|deer|moose|gorilla|penguin|camel|cow|goat)\b/.exec(l);
  return m ? `the ${m[1]}` : null;
}

const TIME_RE = /^\s*(\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?)\s*s?\s*[:：]?\s*(.*)$/i;

export function planMontageScenes(
  lines: string,
  seconds: number,
): { ok: true; scenes: MontageScene[] } | { ok: false; why: string } {
  if (!(seconds > 0)) return { ok: false, why: "the montage has no length" };
  const raw = lines
    .split("\n")
    .map((l) => l.replace(/^\s*[—–\-•*]\s*/, "").trim())
    .filter(Boolean);
  if (raw.length === 0) return { ok: false, why: "write at least one scene, one per line" };
  if (raw.length > MONTAGE_MAX_SCENES)
    return {
      ok: false,
      why: `at most ${MONTAGE_MAX_SCENES} scenes — the model cannot cut faster than that in ${seconds} s`,
    };
  const parsed = raw.map((line) => {
    const m = TIME_RE.exec(line);
    if (m && m[3].trim())
      return {
        from: Number(m[1]) as number | null,
        to: Number(m[2]) as number | null,
        text: m[3].trim(),
      };
    return { from: null as number | null, to: null as number | null, text: line };
  });
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const scenes: MontageScene[] = [];
  let at = 0;
  let i = 0;
  while (i < parsed.length) {
    const p = parsed[i];
    if (p.from != null && p.to != null) {
      if (!(p.to > p.from) || p.to > seconds + 1e-6)
        return { ok: false, why: `"${p.text.slice(0, 40)}" has a window outside 0–${seconds} s` };
      if (p.from < at - 1e-6)
        return {
          ok: false,
          why: `"${p.text.slice(0, 40)}" starts at ${p.from} s, before the scene ahead of it ends (${r1(at)} s)`,
        };
      if (p.from > at + 1e-6 && scenes.length === 0 && i > 0)
        return { ok: false, why: "the first scene has to start at 0 s" };
      scenes.push({ from: r1(p.from), to: r1(p.to), text: p.text });
      at = p.to;
      i++;
      continue;
    }
    let j = i;
    while (j < parsed.length && parsed[j].from == null) j++;
    const gapEnd = j < parsed.length ? (parsed[j].from as number) : seconds;
    const count = j - i;
    const each = (gapEnd - at) / count;
    if (each < MONTAGE_MIN_SCENE_SECONDS - 1e-6)
      return {
        ok: false,
        why: `${count} scene${count === 1 ? "" : "s"} in ${r1(gapEnd - at)} s leaves ${each.toFixed(2)} s each — fewer scenes, or give the quick ones their own seconds (at least ${MONTAGE_MIN_SCENE_SECONDS} s)`,
      };
    for (let k = i; k < j; k++) {
      const to = k === j - 1 ? gapEnd : at + each;
      scenes.push({ from: r1(at), to: r1(to), text: parsed[k].text });
      at = to;
    }
    i = j;
  }
  if (Math.abs(at - seconds) > 1e-6)
    return {
      ok: false,
      why: `the scenes end at ${r1(at)} s; the montage is ${seconds} s — the last scene has to reach the end`,
    };
  for (let k = 0; k < scenes.length; k++) {
    const s = scenes[k];
    if (s.to - s.from < MONTAGE_MIN_SCENE_SECONDS - 1e-6)
      return {
        ok: false,
        why: `scene ${k + 1} ("${s.text.slice(0, 40)}") is ${(s.to - s.from).toFixed(1)} s — at least ${MONTAGE_MIN_SCENE_SECONDS} s`,
      };
  }
  return { ok: true, scenes };
}

export function montageScript(scenes: readonly MontageScene[]): string {
  return [
    "Show in order, in seconds from the first frame:",
    ...scenes.map((s) => `— ${s.from.toFixed(1)}–${s.to.toFixed(1)} s: ${s.text}`),
  ].join("\n");
}

export function montagePrompt(scenes: readonly MontageScene[]): string {
  return [
    `a fast-cut montage in the place of @Image1, ${MONTAGE_STYLE}`,
    montageScript(scenes),
    MONTAGE_SYNC,
    NEVER_WIDER,
  ].join(" ");
}

export function montageRecord(
  scenes: readonly MontageScene[],
  thing: string | null,
): { version: string; scenes: MontageScene[]; thing: string | null } {
  return {
    version: MONTAGE_VERSION,
    scenes: scenes.map((s) => ({ ...s })),
    thing: thing?.trim() || null,
  };
}

/** What is kept of him, word for word — the take's own description when Setup has one (restage.ts restageKeep). */
export function restageKeep(take: { shows?: string | null }): string[] {
  const shows = take.shows?.trim();
  return shows
    ? [`his face, skin and build`, shows]
    : [
        "his face, skin and build",
        "every piece of his wardrobe and everything he wears, exactly as in @Video1",
      ];
}

/** Whole seconds to ask the model for (restage.ts restageSeconds). Null = too long to restage in one piece. */
export function restageSeconds(shotSeconds: number, lead = FRAME_ALLOWANCE): number | null {
  const need = Math.ceil(shotSeconds + lead - 1e-3);
  const seconds = Math.max(RESTAGE_MIN_SECONDS, need);
  return seconds > RESTAGE_MAX_SECONDS ? null : seconds;
}

/**
 * The whole prompt a restaging is sent (prompts.ts seedanceAnglePrompt with an image and no timed changes): the
 * performer, the camera sentence, the keep list, the place and its light, the look's suffix.
 */
export function seedanceAnglePrompt(
  angle: string,
  keep: string[],
  lookSuffix: string | null = DEFAULT_LOOK_SUFFIX,
): string {
  const keepStr =
    keep.filter(Boolean).join(", ") || "his face, hair, skin and every piece of wardrobe";
  const parts = [
    `@Video1 is the performer, rapping to camera. Re-shoot the exact same performance from a second camera: ${angle}`,
    `Keep everything identical to @Video1 — ${keepStr} — and most of all the same mouth movements at the same moments, word for word, in sync with @Video1 from the first frame to the last.`,
    PLACE_LIGHT,
  ];
  if (lookSuffix) parts.push(lookSuffix);
  return parts.join(" ");
}

/** Seedance 2.5 at 720p with a video input as long as the output (worldBatch/estimate.ts seedanceUsd, config/provider_rates.json seedance_tokens). */
export const SEEDANCE_TOKENS = {
  usd_per_1000_tokens: { "480p": 0.0214, "720p": 0.0214, "1080p": 0.0234 },
  video_input_factor: 0.6,
  pixels: { "480p": 409920, "720p": 921600, "1080p": 2073600 },
  frames_per_second: 24,
  divisor: 1024,
} as const;

export function seedanceUsd(
  resolution: keyof typeof SEEDANCE_TOKENS.pixels,
  outputSeconds: number,
  inputSeconds: number = outputSeconds,
): number {
  const t = SEEDANCE_TOKENS;
  const tokens = Math.ceil(
    (t.pixels[resolution] * (inputSeconds + outputSeconds) * t.frames_per_second) / t.divisor,
  );
  return (
    (tokens / 1000) *
    t.usd_per_1000_tokens[resolution] *
    (inputSeconds > 0 ? t.video_input_factor : 1)
  );
}
