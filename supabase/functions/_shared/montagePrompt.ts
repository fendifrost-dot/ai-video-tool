// Deno copy of the pure words of a montage — src/lib/storyboard/montage.ts (the scenes, the style, the sync rule),
// src/lib/storyboard/restage.ts (NEVER_WIDER, the keep list, the restage seconds) and src/lib/shotCompiler/prompts.ts
// (seedanceAnglePrompt, PLACE_LIGHT) with the default look's suffix (src/lib/shotCompiler/lookPresets.ts). Edge
// functions deploy from this folder alone and cannot import "@/…", so the words live twice; montagePrompt.test.ts
// holds the two copies together word for word, so a montage shot from the MCP (montage-shot) is the montage the
// storyboard's own button shoots.

export const MONTAGE_VERSION = "montage-v5-2026-10-17";
export const MONTAGE_LINES_MAX = 1200;
export const MONTAGE_MIN_SCENE_SECONDS = 0.4;
export const MONTAGE_MAX_SCENES = 8;

export const MONTAGE_STYLE =
  "shot like news footage: shaky handheld camerawork, quick optical zooms, 35mm film grain, muted warm night colours, fast cuts. " +
  "Deadpan: nobody and nothing in the place reacts to anything unusual.";

export const MONTAGE_SYNC =
  "Whenever he is on screen his mouth movements are exactly @Video1's at that same second, word for word, in sync from the first frame to the last; " +
  "a cutaway does not pause, repeat or shift the performance — it continues underneath and is where @Video1 is when the picture comes back to him.";

/**
 * B-roll with him in it (Fendi, 23 Oct 2026: "on b roll shots re render the approved shots with no mouth movement. Same
 * scene"): the same montage, his mouth shut in every shot he is in. The edge copy only — the storyboard's button has
 * no still-mouth montage yet.
 */
export const MONTAGE_MOUTH_STILL =
  "No lip sync and no lip movement: his lips stay closed and still and he never mouths the words, in every shot he is in, from the first frame to the last. Transfer the exact movement and timing of @Video1 onto him, beat for beat: the same head turns and nods, the same shoulders and body, the same hands, the same eyes and eyebrows (he blinks, his brows lift and knit, he breathes) at the same seconds, in sync with @Video1; he is alive and moving exactly as he does there, never frozen, stiff or blank. His mouth is his own, natural and shut, the lips together as in a silent take; his face is complete and unchanged.";

/** A SILENT reference (montage-shot `reference`): his mouth is shut in @Video1, so the performance is copied whole and
 * nothing is suppressed (Fendi, 24 Oct 2026: still-mouth re-shoots of a rapping take came out stiff; "non rapping
 * footage should have been used for all b roll shots"). */
export const MONTAGE_SILENT =
  "@Video1 is a silent take: whenever he is on screen his movements and his expression are exactly @Video1's at that same second — head, body, hands, eyes and mouth — in sync from the first frame to the last; " +
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

/** Never a shot of his shoes (montage.ts NO_FEET; Fendi, 17 Oct 2026: "no more shoe shots"). */
export const NO_FEET =
  "No scene is a shot of his shoes or his feet: never a close-up of them, never a cutaway or a tilt down to them.";

/** Never a full-body shot of him (montage.ts WAIST_UP; Fendi, 17 Oct 2026: "Stop the full body shots"). */
export const WAIST_UP =
  "Every shot of him is from the waist up or closer — a medium shot, a medium close-up or a close-up; never a full-body or wide shot of him, his legs and shoes out of the frame.";

export type MontageScene = { from: number; to: number; text: string };

export function defaultMontageLines(thing: string | null): string {
  const it = thing?.trim() || null;
  return [
    it ? `the place: a wide shot with ${it} in it, the people around going about their business; he is not in it` : "the place: a wide shot of it, the people in it going about their business; he is not in it",
    "HARD CUT to him in profile from the side, a three-quarter angle: standing with a hand on something in the place (a rail, a pole, a pillar, a door frame), rapping; he belongs in the place, not pasted in front of it",
    it ? `HARD CUT to a tight shot of ${it}, a quick optical zoom in on its face; it does not react` : "HARD CUT to a tight shot of a detail of the place, a quick optical zoom in; nobody reacts",
    it ? `HARD CUT to a medium close-up from chest height: him leaning on something in the place, rapping, ${it} behind his shoulder; nobody looks at him` : "HARD CUT to a medium close-up from chest height: him leaning on something in the place, rapping, the place behind his shoulder; nobody looks at him",
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

export function montagePrompt(scenes: readonly MontageScene[], mouth?: "still" | "silent"): string {
  return [
    `a fast-cut montage in the place of @Image1, ${MONTAGE_STYLE}`,
    montageScript(scenes),
    mouth === "still" ? MONTAGE_MOUTH_STILL : mouth === "silent" ? MONTAGE_SILENT : MONTAGE_SYNC,
    NEVER_WIDER,
    NO_FEET,
    WAIST_UP,
  ].join(" ");
}

/** The people of a scene still with its own people in it (montage.ts castLine). */
export function castLine(image: number): string {
  return `The people in this place are the people in @Image${image}: the same faces, the same clothes, the same things in their hands, in every shot they are in; nobody new takes their place.`;
}

/** A montage of a shot he is not in (montage.ts brollMontagePrompt): the place, its people and the camera only. */
export const BROLL_PLACE =
  "Everything happens in the place of @Image1, in its light and its weather; the people in it and the camera move, nothing is pasted in.";
/** No shoe shots of anyone (Fendi, 17 Oct 2026: "no more shoe shots" — a b-roll montage opened on running boots). */
export const BROLL_NO_FEET =
  "No scene is a close-up of anyone's shoes or feet: never a cutaway or a tilt down to them.";
export function brollMontagePrompt(
  scenes: readonly MontageScene[],
  castImage: number | null = null,
): string {
  return [
    `a fast-cut montage in the place of @Image1, ${MONTAGE_STYLE}`,
    montageScript(scenes),
    BROLL_PLACE,
    BROLL_NO_FEET,
    castImage != null ? castLine(castImage) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The lines share the shot's seconds; the last scene holds to the end of the render (montage.ts planShotMontageScenes). */
export function planShotMontageScenes(
  lines: string,
  shotSeconds: number,
  renderSeconds: number,
): { ok: true; scenes: MontageScene[] } | { ok: false; why: string } {
  const own = Math.round(Math.min(shotSeconds, renderSeconds) * 10) / 10;
  const planned = planMontageScenes(lines, own);
  if (!planned.ok) return planned;
  const scenes = planned.scenes.map((s) => ({ ...s }));
  scenes[scenes.length - 1].to = Math.round(renderSeconds * 10) / 10;
  return { ok: true, scenes };
}

/**
 * Beat-locked scenes — the house rule for cutting a montage to the song (Fendi, 17 Oct 2026: "are we going to keep
 * doing 4 second clips or cut to the exact song taking into account transitions and beats … write that workflow into
 * the tool"). The edit already cuts every shot on the song's beat grid (treatment/grid.ts: beats, downbeats, lyric
 * line starts, section changes). Inside a shot, untimed lines are cut on the song's beats too: the lines share the
 * part of the clip the edit plays (shotIn–shotOut, clip seconds), each cut moved onto the nearest beat that keeps
 * every scene at least MONTAGE_MIN_SCENE_SECONDS; the first scene starts at the clip's first frame (a head handle
 * before the shot belongs to it) and the last holds to the end of the render. A cut with no usable beat near it stays
 * on its even share. Lines that carry their own seconds are the director's and are kept as written (`null` here — the
 * caller plans them with planMontageScenes, as it does lines the shot has no room for). One render per shot, never one render across shots: the model's cuts
 * drift a few frames, and a clip shared by two shots would leak one scene across the edit's cut.
 */
export function planBeatLockedScenes(
  lines: string,
  opts: { renderSeconds: number; shotIn: number; shotOut: number; beats: readonly number[] },
): { ok: true; scenes: MontageScene[]; locked: number } | { ok: false; why: string } | null {
  const raw = lines
    .split("\n")
    .map((l) => l.replace(/^\s*[—–\-•*]\s*/, "").trim())
    .filter(Boolean);
  if (raw.length === 0) return { ok: false, why: "write at least one scene, one per line" };
  if (raw.some((l) => { const m = TIME_RE.exec(l); return !!m && !!m[3].trim(); })) return null;
  if (raw.length > MONTAGE_MAX_SCENES)
    return { ok: false, why: `at most ${MONTAGE_MAX_SCENES} scenes — the model cannot cut faster than that` };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const end = opts.renderSeconds;
  const a = Math.max(0, Math.min(opts.shotIn, end));
  const b = Math.max(a, Math.min(opts.shotOut, end));
  const n = raw.length;
  const min = MONTAGE_MIN_SCENE_SECONDS;
  // more lines than the part the edit plays has room for: they share the whole render, as before (the caller's plan)
  if (n * min > b - a + 1e-6) return null;
  const beats = [...opts.beats].filter((t) => Number.isFinite(t)).sort((x, y) => x - y);
  const cuts: number[] = [];
  let locked = 0;
  let prev = 0;
  for (let k = 1; k < n; k++) {
    const target = a + ((b - a) * k) / n;
    // every scene the edit shows keeps at least `min` inside the window: the ones before this cut and the ones after it
    const lo = Math.max(prev, a) + min;
    const hi = b - min * (n - k);
    let best: number | null = null;
    for (const t of beats) {
      if (t < lo - 1e-6 || t > hi + 1e-6 || t <= a + 1e-6 || t >= b - 1e-6) continue;
      if (best == null || Math.abs(t - target) < Math.abs(best - target)) best = t;
    }
    const nearEnough = best != null && Math.abs(best - target) <= (b - a) / n / 2 + 1e-6;
    const cut = nearEnough ? best! : Math.min(Math.max(target, lo), hi);
    if (nearEnough) locked++;
    cuts.push(cut);
    prev = cut;
  }
  const edges = [0, ...cuts, end];
  const scenes = raw.map((text, i) => ({ from: r2(edges[i]), to: r2(edges[i + 1]), text }));
  for (let k = 0; k < scenes.length; k++)
    if (scenes[k].to - scenes[k].from < min - 1e-6)
      return { ok: false, why: `scene ${k + 1} would be ${(scenes[k].to - scenes[k].from).toFixed(2)} s — fewer scenes` };
  return { ok: true, scenes, locked };
}

export function montageRecord(
  scenes: readonly MontageScene[],
  thing: string | null,
  footwear: MontageFootwear | null = null,
  more: { cast?: { id: string } | null; broll?: boolean; cutOn?: { beats: number; cuts: number } | null; mouth?: "still" | "silent" } = {},
): {
  version: string;
  scenes: MontageScene[];
  thing: string | null;
  footwear?: { id: string; label: string };
  cast?: { id: string };
  broll?: true;
  cutOn?: { beats: number; cuts: number };
  mouth?: "still" | "silent";
} {
  return {
    version: MONTAGE_VERSION,
    scenes: scenes.map((s) => ({ ...s })),
    thing: thing?.trim() || null,
    ...(footwear ? { footwear: { id: footwear.id, label: footwear.label } } : {}),
    ...(more.cast ? { cast: { id: more.cast.id } } : {}),
    ...(more.broll ? { broll: true as const } : {}),
    ...(more.cutOn ? { cutOn: { ...more.cutOn } } : {}),
    ...(more.mouth === "still" || more.mouth === "silent" ? { mouth: more.mouth } : {}),
  };
}

/** His shoes: the outfit's footwear picture, sent as @Image2 after the place (montage.ts montageFootwear / footwearLine). */
export type MontageFootwear = {
  id: string;
  bucket: string;
  path: string;
  label: string;
  words: string | null;
};
export const FOOTWEAR_BUCKET = "wardrobe-refs";

export function montageFootwear(
  garmentIds: readonly string[],
  items: readonly {
    id: string;
    feature_type: string;
    label: string;
    storage_path: string | null;
    dimensions_description?: string | null;
  }[],
): MontageFootwear | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const id of garmentIds) {
    const i = byId.get(id);
    if (i && i.feature_type === "wardrobe_footwear" && i.storage_path)
      return {
        id: i.id,
        bucket: FOOTWEAR_BUCKET,
        path: i.storage_path,
        label: i.label.trim(),
        words: i.dimensions_description?.trim() || null,
      };
  }
  return null;
}

export function footwearLine(footwear: Pick<MontageFootwear, "label" | "words"> | null): string {
  if (!footwear) return "";
  const what = [footwear.label.trim(), footwear.words?.trim().replace(/[.\s]+$/, "")]
    .filter(Boolean)
    .join(": ");
  return `His shoes are the pair in @Image2 (${what}); whenever his feet are in a frame he wears exactly that pair, never any other shoes.`;
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
  mouth?: "still" | "silent",
): string {
  const keepStr =
    keep.filter(Boolean).join(", ") || "his face, hair, skin and every piece of wardrobe";
  // a still mouth: the SAME performance, copied moment for moment, minus the lip movement (Fendi, 24 Oct 2026: the
  // "reference for his body, not a timeline to copy" framing came back "completely still ... stiff as a board";
  // "my movements should be the exact same as the bad lip sync render with no lip sync")
  const parts = mouth === "still"
    ? [
        `@Video1 is the performer. Re-shoot the exact same performance from a second camera: ${angle}`,
        `Keep everything identical to @Video1 — ${keepStr} — and most of all the same movements at the same moments: his head, body, hands, eyes and expression move exactly as in @Video1 from the first frame to the last, with his lips together and still as in a silent take; nothing he wears changes during the take.`,
        PLACE_LIGHT,
      ]
    : mouth === "silent"
    ? [
        // a silent reference: the whole performance copied, mouth included (shut in @Video1), nothing to suppress
        `@Video1 is the performer. Re-shoot the exact same performance from a second camera: ${angle}`,
        `Keep everything identical to @Video1 — ${keepStr} — and most of all the same movements at the same moments: his head, body, hands, eyes, expression and mouth move exactly as in @Video1 from the first frame to the last; nothing he wears changes during the take.`,
        PLACE_LIGHT,
      ]
    : [
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
