// One continuous take — the words (montage-shot's `continuous` mode; plan.ts planContinuous is the numbers).
//
// Fendi, 17 Oct 2026: "For the next clips I'm going to cut in Premiere … Do NOT make montages and do NOT cut on the
// beat inside a clip." Every clip is one unbroken take with ONE named camera move from the first frame to the last,
// already moving on frame 1 and still moving on the last, as long as the model allows (handles to trim), waist-up or
// closer, the scene's approved wardrobe, the same cold winter hour in every clip, a clear motion direction at the end
// to cut on, and — for a lip-sync shot — his face to camera with nothing in front of his mouth.
//
// Fendi, 17 Oct 2026, on the lip-sync lane: "a lot of the lip sync footage alters my face and looks crazy" — so nothing
// repaints his mouth afterwards. "Re-render the performance shots with him actually rapping the lyrics on camera … say
// the actual lyric line in the prompt": a take with him gets the song's vocals under it as @Audio1 and the lyric lines
// that fall in it, timed from its first frame; he raps them, and the editor lines the mouth up by hand.
//
// Pure: no Deno, no network. Tested under vitest.

import { NO_FEET, PLACE_LIGHT, WAIST_UP } from "./montagePrompt.ts";

export const CONTINUOUS_VERSION = "continuous-v2-2026-10-17";
/** Seconds the lane asks for: Seedance 2.5 reference renders 4–30 s; Fendi asks 8–10 s "if possible, minimum 5". */
export const CONTINUOUS_MIN_SECONDS = 5;
export const CONTINUOUS_MAX_SECONDS = 15;
export const CONTINUOUS_DEFAULT_SECONDS = 10;
/** The longest line of the director's that goes into the prompt (camera, action, end motion). */
export const CONTINUOUS_LINE_MAX = 600;

export const ONE_TAKE = (seconds: number) =>
  `One continuous take, ${seconds} seconds: a single unbroken shot — no cuts, no edits, no scene change, no fade, no flash, no second angle, from the first frame to the last.`;
export const ALREADY_MOVING =
  "Everything is already moving on the first frame — the camera is mid-move and he is mid-movement: no still opening, no settling frames, no slowing to a stop, no freeze or hold at the end.";
export const FACE_TO_CAMERA =
  "He faces the camera and raps, his mouth clearly visible and unobstructed for the whole take: no hand, microphone, collar or object in front of his face, his hands below his chin.";
export const NOBODY_PERFORMS =
  "Nobody performs to camera and no face fills the frame; he appears only where this says so.";
/** The same hour in every clip of the ending and the hook (Fendi: "cold, winter, consistent with the cold-runway board"). */
export const COLD_HOUR =
  "The hour is the same in every clip: a cold blue winter dusk, the last of the daylight, snow in the air and frost on the glass; warm light comes only from the place's own lamps, downlights and headlights.";
export const CONTINUOUS_LOOK = "24 fps, 35 mm film grain, cinematic and grounded.";

export type ContinuousRequest = {
  seconds: number;
  /** The one camera move, named (slow push-in, 90° orbit, handheld walk-backward, crane down, whip pan …). */
  camera: string;
  /** What happens in the take. */
  action: string;
  /** How it leaves the last frame, for the cut (the camera drifting right, him turning left …). */
  endMotion: string;
  /** He is in it, from @Video1 (his dressed take). False: a shot of the place or a detail, from pictures only. */
  withHim: boolean;
  /** What @Video1 must keep (restageKeep). */
  keep?: string[];
  /** The pictures after the place, in order: @Image2, @Image3 … and what each is. */
  images?: { as: string }[];
  /** The light the shot opens in, from its continuity entity. */
  light?: string | null;
  /** The lyric lines he raps in the take, seconds from its first frame (lyricsInTake). */
  lyrics?: TakeLyric[];
  /** The song's vocals under the take are sent as @Audio1. */
  audio?: boolean;
};

export type TakeLyric = { at: number; text: string };
/** The most lyric lines named in one prompt. */
export const CONTINUOUS_LYRICS_MAX = 16;

/**
 * The lyric lines a take plays over: every line that starts inside [songStart, songStart + seconds), at seconds from the
 * take's first frame (a line already running on frame 1 is at 0), in song order.
 */
export function lyricsInTake(
  lines: { start_seconds: unknown; end_seconds?: unknown; text: unknown }[],
  songStart: number,
  seconds: number,
): TakeLyric[] {
  const end = songStart + seconds;
  return lines
    .map((l) => ({ start: Number(l.start_seconds), stop: Number(l.end_seconds ?? l.start_seconds), text: typeof l.text === "string" ? l.text.replace(/\s+/g, " ").trim() : "" }))
    .filter((l) => Number.isFinite(l.start) && l.text && l.start < end && (l.start >= songStart || l.stop > songStart))
    .sort((a, b) => a.start - b.start)
    .slice(0, CONTINUOUS_LYRICS_MAX)
    .map((l) => ({ at: Math.round(Math.max(0, l.start - songStart) * 10) / 10, text: l.text.slice(0, 120) }));
}

/** He raps the song: @Audio1 (when sent) and the words, timed from the first frame. */
export function rapsTheLines(lyrics: TakeLyric[], audio: boolean): string {
  const words = lyrics.map((l) => `at ${l.at.toFixed(1)} s "${l.text.replace(/"/g, "'")}"`).join(", ");
  const toTheSong = audio
    ? "@Audio1 is the song's vocals under this take: he raps along to it, in time with it, at its tempo, his lips shaping each word as it is sung."
    : "He raps at the song's tempo, his lips shaping each word.";
  return words
    ? `${toTheSong} He is actually rapping on camera, mouth clearly open and closing on every syllable, and these are the exact words, from the first frame: ${words}.`
    : `${toTheSong} He is actually rapping on camera, mouth clearly open and closing on every syllable.`;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, CONTINUOUS_LINE_MAX);
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** The whole prompt for one continuous take. */
export function continuousPrompt(r: ContinuousRequest): string {
  const camera = clean(r.camera);
  const action = clean(r.action);
  const end = clean(r.endMotion);
  const pictures = (r.images ?? []).map((p, i) => `@Image${i + 2} is ${clean(p.as)}.`);
  const parts = r.withHim
    ? [
        "@Video1 is the performer: his face, build, wardrobe and the way he moves; his performance there is a reference for his body, not a timeline to copy.",
        ONE_TAKE(r.seconds),
        `It happens in the place of @Image1.${pictures.length ? ` ${pictures.join(" ")}` : ""}`,
        `The camera move, the only one: ${sentence(camera)} It runs from the first frame to the last at one steady pace.`,
        ALREADY_MOVING,
        sentence(action),
        WAIST_UP,
        NO_FEET,
        FACE_TO_CAMERA,
        rapsTheLines(r.lyrics ?? [], !!r.audio),
        `On the last frames: ${end} — still moving on the very last frame, so the edit can cut on the motion.`,
        `Keep everything identical to @Video1 — ${(r.keep ?? []).filter(Boolean).join(", ") || "his face, skin and build, and every piece of his wardrobe"}; nothing he wears changes during the take.`,
        // the place may move here (headlights flaring, snow falling): only the montage's "the environment is still" goes
        PLACE_LIGHT.replace(" The environment is still, only he and the camera move.", ""),
      ]
    : [
        ONE_TAKE(r.seconds),
        `It happens in the place of @Image1.${pictures.length ? ` ${pictures.join(" ")}` : ""}`,
        `The camera move, the only one: ${sentence(camera)} It runs from the first frame to the last at one steady pace.`,
        ALREADY_MOVING.replace(" and he is mid-movement", " and whatever moves in the place is mid-movement"),
        sentence(action),
        NOBODY_PERFORMS,
        `On the last frames: ${end} — still moving on the very last frame, so the edit can cut on the motion.`,
      ];
  return [...parts, COLD_HOUR, r.light?.trim() ? `The light: ${r.light.trim()}` : "", CONTINUOUS_LOOK].filter(Boolean).join(" ");
}

/** Whole seconds to ask for: the request clamped to what the lane takes (default: the longest the brief wants). */
export function continuousSeconds(requested: unknown): number {
  const n = typeof requested === "number" && Number.isFinite(requested) ? Math.round(requested) : CONTINUOUS_DEFAULT_SECONDS;
  return Math.min(CONTINUOUS_MAX_SECONDS, Math.max(CONTINUOUS_MIN_SECONDS, n));
}

/** Where on the song the take's first frame is put: the shot's window centred in it (handles both sides), never before 0. */
export function continuousSongStart(shotStart: number, shotEnd: number, seconds: number): number {
  const lead = Math.max(0, (seconds - (shotEnd - shotStart)) / 2);
  return Math.round(Math.max(0, shotStart - lead) * 1000) / 1000;
}
