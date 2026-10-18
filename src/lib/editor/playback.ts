import {
  framesToSeconds,
  secondsToFrames,
  videoClips,
  type EditClip,
  type EditSequence,
} from "../../../supabase/functions/edit-render/model";

/** Active picture clip at a timeline time (seconds from sequence start). */
export function clipAtTime(seq: EditSequence, timelineSeconds: number): EditClip | null {
  const clips = videoClips(seq);
  for (const c of clips) {
    if (timelineSeconds >= c.timelineIn - 1e-6 && timelineSeconds < c.timelineOut - 1e-6) {
      return c;
    }
  }
  // Inclusive end for the last frame of the last clip
  const last = clips[clips.length - 1];
  if (last && Math.abs(timelineSeconds - last.timelineOut) < 1 / seq.fps) return last;
  return null;
}

/** Source-file time that should play for a given timeline time. */
export function sourceTimeAt(
  clip: EditClip,
  timelineSeconds: number,
): number {
  const speed = clip.speed > 0 ? clip.speed : 1;
  const into = Math.max(0, timelineSeconds - clip.timelineIn);
  return clip.sourceIn + into * speed;
}

/** Song clock for a timeline time (applies master song offset exactly once). */
export function songTimeAt(seq: EditSequence, timelineSeconds: number): number {
  return seq.songOffset + timelineSeconds;
}

export function formatTimecode(seconds: number, fps: number): string {
  const f = Math.max(1, Math.round(fps));
  const total = Math.max(0, Math.round(seconds * f));
  const frames = total % f;
  const totalSec = Math.floor(total / f);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const ff = String(frames).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}:${ff}`;
  return `${mm}:${ss}:${ff}`;
}

export function stepFrame(seconds: number, fps: number, delta: number): number {
  const frame = secondsToFrames(seconds, fps) + delta;
  return framesToSeconds(Math.max(0, frame), fps);
}

/** Loop window around a marker/phrase with pre-roll (seconds). */
export function phraseLoopWindow(input: {
  timeIn: number;
  timeOut: number | null;
  preRoll: number;
  sequenceDuration: number;
}): { start: number; end: number } {
  const end = input.timeOut != null && input.timeOut > input.timeIn ? input.timeOut : input.timeIn + 2;
  const start = Math.max(0, input.timeIn - input.preRoll);
  return { start, end: Math.min(input.sequenceDuration, end) };
}
