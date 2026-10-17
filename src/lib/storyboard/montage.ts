/**
 * "Montage" — a performance shot re-shot as a fast-cut sequence of angles and cutaways, in ONE reference-to-video
 * call, in the place of its plate.
 *
 * Why one call and this shape (Fendi, 16 Oct 2026): "on every shot we need to be utilizing multiple creative camera
 * angles per performance shot … me rapping into the camera, a quick shot to the side, a zoom in of the polar bear,
 * all on the same platform … a child walking up to the polar bear and petting it … Quick, very quick." The reference
 * is Thuggpapi's Seedance 2.5 montages (docs/research/references/THUGGPAPI_SEEDANCE_MONTAGE_PROMPTS_2026-10.md): one
 * prompt, one global style line, then "Show in order:" with one dash per scene, every scene a second or less, and
 * "everyone treats the impossible like another normal day". That is a prompt shape on the model the restage lane
 * already uses (Seedance 2.5 reference-to-video: @Video1 the take, @Image1 the place), not a new provider — so a
 * montage costs one restage, not one restage per angle.
 *
 * What this module decides is pure: the scenes (the director's lines, each given its seconds), the prompt, and
 * what is recorded. The cut, the upload and the submit are the restage lane's (restage.ts restageBox with the
 * montage as the camera sentence, filed as an ALTERNATE so nothing the director chose is replaced).
 */
import { NEVER_WIDER } from "./restage";

export const MONTAGE_VERSION = "montage-v5-2026-10-17";
/** The longest scene list the dialog takes. */
export const MONTAGE_LINES_MAX = 1200;
/** Scenes shorter than this are not asked for: the model cannot cut faster than it renders. */
export const MONTAGE_MIN_SCENE_SECONDS = 0.4;
export const MONTAGE_MAX_SCENES = 8;

/**
 * The style every scene obeys — Thuggpapi's line, with the night and the sync rule added. "Deadpan" is the realism
 * trick: nobody in the place reacts to the impossible thing, so it reads as filmed, not staged.
 */
export const MONTAGE_STYLE =
  "shot like news footage: shaky handheld camerawork, quick optical zooms, 35mm film grain, muted warm night colours, fast cuts. " +
  "Deadpan: nobody and nothing in the place reacts to anything unusual.";

/** The sync rule: the performance never pauses for a cutaway; whenever he is on screen his mouth is the take's at that second. */
export const MONTAGE_SYNC =
  "Whenever he is on screen his mouth movements are exactly @Video1's at that same second, word for word, in sync from the first frame to the last; " +
  "a cutaway does not pause, repeat or shift the performance — it continues underneath and is where @Video1 is when the picture comes back to him.";

/**
 * Never a shot of his shoes (Fendi, 17 Oct 2026: "no more shoe shots"). With his shoe picture beside the place, the
 * model made the shoes a subject — a cutaway to his Pradas on the Oak Street window montage. The picture stays (a
 * frame that catches his feet still has to show that pair); the shoes are never a scene of their own.
 */
export const NO_FEET =
  "No scene is a shot of his shoes or his feet: never a close-up of them, never a cutaway or a tilt down to them.";

/**
 * Never a full-body shot of him (Fendi, 17 Oct 2026: "Stop the full body shots"). The dress swaps his jacket, cap and
 * glasses reliably; his trousers and shoes are where it drifts, and a wide frame shows them. Every shot of him is
 * framed from the waist up or closer.
 */
export const WAIST_UP =
  "Every shot of him is from the waist up or closer — a medium shot, a medium close-up or a close-up; never a full-body or wide shot of him, his legs and shoes out of the frame.";

export type MontageScene = { from: number; to: number; text: string };

/**
 * The scenes as the dialog's prefill — the ORCA shape (Fendi, 16 Oct 2026: "the only montages that were executed
 * correctly was the bear and orca montages … the others look like I'm pasted on another video"). The place opens
 * WITHOUT him; he appears only in profile / three-quarter / from a low angle, anchored to something in the place (a
 * rail, a pole, a pillar, a door frame), never "straight to camera, a medium shot" — that line is the paste-in: the
 * model re-stages him flat in front of the place. `thing` is the one unusual thing in the place; the cutaways look at
 * it. "HARD CUT" on every cut line (without it the first live run was one continuous camera move). No "snap back to
 * him" closing scene: asked for one, the model spends its last frames on it as a flash or a freeze (16 Oct 2026); the
 * edit owns the cut back.
 */
export function defaultMontageLines(thing: string | null): string {
  const it = thing?.trim() || null;
  return [
    it ? `the place: a wide shot with ${it} in it, the people around going about their business; he is not in it` : "the place: a wide shot of it, the people in it going about their business; he is not in it",
    "HARD CUT to him in profile from the side, a three-quarter angle: standing with a hand on something in the place (a rail, a pole, a pillar, a door frame), rapping; he belongs in the place, not pasted in front of it",
    it ? `HARD CUT to a tight shot of ${it}, a quick optical zoom in on its face; it does not react` : "HARD CUT to a tight shot of a detail of the place, a quick optical zoom in; nobody reacts",
    it ? `HARD CUT to a low angle from below: him leaning on something in the place, rapping, ${it} behind his shoulder; nobody looks at him` : "HARD CUT to a low angle from below: him leaning on something in the place, rapping, the place behind his shoulder; nobody looks at him",
  ].join("\n");
}

/** How much of a montage's tail the edit never uses: the model's last frames are a frozen or flashed closing beat. */
export const MONTAGE_TAIL_TRIM_SECONDS = 0.12;

/**
 * The one unusual thing in a plate, from the plate's label (`plate_79th_lafayette_bear_edge` → "the polar bear"):
 * the cutaways look at it. A label naming nothing unusual gives null, and the montage uses street cutaways.
 * (The first dry run read the label's LAST word and asked for "a quick optical zoom onto the edge".)
 */
export function thingOfLabel(label: string | null | undefined): string | null {
  // labels are snake_case: an underscore is a word character to a regex, so the words are split first
  const l = (label ?? "").toLowerCase().replace(/[_-]+/g, " ").trim();
  if (!l) return null;
  if (/\bbear\b/.test(l)) return "the polar bear";
  if (/\b(t ?rex|dino(saur)?)\b/.test(l)) return "the T-rex";
  if (/\bhorse\b/.test(l)) return "the horse";
  const m = /\b(tiger|lion|elephant|giraffe|dog|cat|deer|moose|gorilla|penguin|camel|cow|goat)\b/.exec(l);
  return m ? `the ${m[1]}` : null;
}

const TIME_RE = /^\s*(\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*(\d+(?:\.\d+)?)\s*s?\s*[:：]?\s*(.*)$/i;

/**
 * The director's lines as scenes with seconds. A line may say its own window ("2.0-2.7 s: …"); the lines between
 * two timed ones (or before the first, or after the last) share the gap equally, in order. The result covers
 * [0, seconds] exactly, in order, no gaps, no overlaps.
 */
export function planMontageScenes(lines: string, seconds: number): { ok: true; scenes: MontageScene[] } | { ok: false; why: string } {
  if (!(seconds > 0)) return { ok: false, why: "the montage has no length" };
  const raw = lines
    .split("\n")
    .map((l) => l.replace(/^\s*[—–\-•*]\s*/, "").trim())
    .filter(Boolean);
  if (raw.length === 0) return { ok: false, why: "write at least one scene, one per line" };
  if (raw.length > MONTAGE_MAX_SCENES) return { ok: false, why: `at most ${MONTAGE_MAX_SCENES} scenes — the model cannot cut faster than that in ${seconds} s` };
  const parsed = raw.map((line) => {
    const m = TIME_RE.exec(line);
    if (m && m[3].trim()) return { from: Number(m[1]) as number | null, to: Number(m[2]) as number | null, text: m[3].trim() };
    return { from: null as number | null, to: null as number | null, text: line };
  });
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const scenes: MontageScene[] = [];
  let at = 0;
  let i = 0;
  while (i < parsed.length) {
    const p = parsed[i];
    if (p.from != null && p.to != null) {
      if (!(p.to > p.from) || p.to > seconds + 1e-6) return { ok: false, why: `"${p.text.slice(0, 40)}" has a window outside 0–${seconds} s` };
      if (p.from < at - 1e-6) return { ok: false, why: `"${p.text.slice(0, 40)}" starts at ${p.from} s, before the scene ahead of it ends (${r1(at)} s)` };
      if (p.from > at + 1e-6 && scenes.length === 0 && i > 0) return { ok: false, why: "the first scene has to start at 0 s" };
      scenes.push({ from: r1(p.from), to: r1(p.to), text: p.text });
      at = p.to;
      i++;
      continue;
    }
    // a run of untimed lines up to the next timed one (or the end) shares that gap equally
    let j = i;
    while (j < parsed.length && parsed[j].from == null) j++;
    const gapEnd = j < parsed.length ? (parsed[j].from as number) : seconds;
    const count = j - i;
    const each = (gapEnd - at) / count;
    if (each < MONTAGE_MIN_SCENE_SECONDS - 1e-6)
      return { ok: false, why: `${count} scene${count === 1 ? "" : "s"} in ${r1(gapEnd - at)} s leaves ${each.toFixed(2)} s each — fewer scenes, or give the quick ones their own seconds (at least ${MONTAGE_MIN_SCENE_SECONDS} s)` };
    for (let k = i; k < j; k++) {
      const to = k === j - 1 ? gapEnd : at + each;
      scenes.push({ from: r1(at), to: r1(to), text: parsed[k].text });
      at = to;
    }
    i = j;
  }
  if (Math.abs(at - seconds) > 1e-6) return { ok: false, why: `the scenes end at ${r1(at)} s; the montage is ${seconds} s — the last scene has to reach the end` };
  for (let k = 0; k < scenes.length; k++) {
    const s = scenes[k];
    if (s.to - s.from < MONTAGE_MIN_SCENE_SECONDS - 1e-6) return { ok: false, why: `scene ${k + 1} ("${s.text.slice(0, 40)}") is ${(s.to - s.from).toFixed(1)} s — at least ${MONTAGE_MIN_SCENE_SECONDS} s` };
  }
  return { ok: true, scenes };
}

/** The "Show in order" block: one dash per scene, with its seconds from the first frame. */
export function montageScript(scenes: readonly MontageScene[]): string {
  return ["Show in order, in seconds from the first frame:", ...scenes.map((s) => `— ${s.from.toFixed(1)}–${s.to.toFixed(1)} s: ${s.text}`)].join("\n");
}

/**
 * The camera sentence the restage lane sends for a montage (its `angle`): the style, the scenes, the sync rule and
 * the never-wider rule. The restage prompt (shotCompiler/prompts.ts seedanceAnglePrompt) wraps it with "@Video1 is
 * the performer… Re-shoot the exact same performance from a second camera: <this>", the keep list and the place.
 */
export function montagePrompt(scenes: readonly MontageScene[]): string {
  return [`a fast-cut montage in the place of @Image1, ${MONTAGE_STYLE}`, montageScript(scenes), MONTAGE_SYNC, NEVER_WIDER, NO_FEET, WAIST_UP].join(" ");
}

/**
 * The people of a scene (Fendi, 17 Oct 2026, of the first Oak Street chase: "It doesn't have the same characters from
 * the Gemini image"). A scene still with its own people in it (worlds/scene_*, plateMotion v5) goes to the model as a
 * picture, and this sentence makes them the cast: the same people, never stand-ins the model invents.
 */
export function castLine(image: number): string {
  return `The people in this place are the people in @Image${image}: the same faces, the same clothes, the same things in their hands, in every shot they are in; nobody new takes their place.`;
}

/**
 * A montage of a shot he is not in (Fendi, 17 Oct 2026: "These all need to be montage shots so a continuous running
 * out of the store is unacceptable"). No take goes to the model: the place, its people and the camera only, in the
 * same fast cuts. The whole prompt, less the look's suffix.
 */
export const BROLL_PLACE =
  "Everything happens in the place of @Image1, in its light and its weather; the people in it and the camera move, nothing is pasted in.";
/** No shoe shots of anyone (Fendi, 17 Oct 2026: "no more shoe shots" — a b-roll montage opened on running boots). */
export const BROLL_NO_FEET =
  "No scene is a close-up of anyone's shoes or feet: never a cutaway or a tilt down to them.";
export function brollMontagePrompt(scenes: readonly MontageScene[], castImage: number | null = null): string {
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

/**
 * The scenes of a montage that renders longer than its shot (a b-roll shot of 1.5 s still renders the model's 4 s
 * minimum): the lines share the SHOT's seconds, and the last scene holds to the end of the render, which the edit
 * never plays.
 */
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

/** What is recorded on the job beside the prompt, so a result can be judged against what was asked. */
export function montageRecord(
  scenes: readonly MontageScene[],
  thing: string | null,
  footwear: MontageFootwear | null = null,
  more: { cast?: { id: string } | null; broll?: boolean; cutOn?: { beats: number; cuts: number } | null } = {},
): { version: string; scenes: MontageScene[]; thing: string | null; footwear?: { id: string; label: string }; cast?: { id: string }; broll?: true; cutOn?: { beats: number; cuts: number } } {
  return {
    version: MONTAGE_VERSION,
    scenes: scenes.map((s) => ({ ...s })),
    thing: thing?.trim() || null,
    ...(footwear ? { footwear: { id: footwear.id, label: footwear.label } } : {}),
    ...(more.cast ? { cast: { id: more.cast.id } } : {}),
    ...(more.broll ? { broll: true as const } : {}),
    ...(more.cutOn ? { cutOn: { ...more.cutOn } } : {}),
  };
}

/**
 * His shoes. The takes are cut at the waist, so a montage's low angles and cutaways show feet the footage never had,
 * and the model made up shoes he would not wear (Fendi, 16 Oct 2026: "the tool created shoes for me … shoes that I
 * would not wear" — America's Cup Pradas, black patent with the black jackets, cream with the Mastic). The outfit's
 * footwear picture goes to the model as the second image, after the place, and this sentence names it.
 */
export const FOOTWEAR_BUCKET = "wardrobe-refs" as const;
export type MontageFootwear = { id: string; bucket: typeof FOOTWEAR_BUCKET; path: string; label: string; words: string | null };

/** The first footwear picture among the pieces he wears in the shot, in the outfit's order; null when none is on file. */
export function montageFootwear(
  garmentIds: readonly string[],
  items: readonly { id: string; feature_type: string; label: string; storage_path: string | null; dimensions_description?: string | null }[],
): MontageFootwear | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const id of garmentIds) {
    const i = byId.get(id);
    if (i && i.feature_type === "wardrobe_footwear" && i.storage_path)
      return { id: i.id, bucket: FOOTWEAR_BUCKET, path: i.storage_path, label: i.label.trim(), words: i.dimensions_description?.trim() || null };
  }
  return null;
}

/** The sentence that goes with the shoe picture (@Image2: the place is @Image1). Empty when there is no picture. */
export function footwearLine(footwear: Pick<MontageFootwear, "label" | "words"> | null): string {
  if (!footwear) return "";
  const what = [footwear.label.trim(), footwear.words?.trim().replace(/[.\s]+$/, "")].filter(Boolean).join(": ");
  return `His shoes are the pair in @Image2 (${what}); whenever his feet are in a frame he wears exactly that pair, never any other shoes.`;
}
