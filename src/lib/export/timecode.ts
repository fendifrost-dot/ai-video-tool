/** Canonical timing is integer frames; seconds/timecode are derived for display/export. */

export function framesToSeconds(frames: number, frameRate: number): number {
  if (frameRate <= 0) return 0;
  return frames / frameRate;
}

export function secondsToFrames(seconds: number, frameRate: number): number {
  if (frameRate <= 0) return 0;
  return Math.round(seconds * frameRate);
}

/** SMPTE-style timecode HH:MM:SS:FF at the given frame rate. */
export function framesToTimecode(frames: number, frameRate: number): string {
  if (frameRate <= 0) return "00:00:00:00";
  const ff = frames % frameRate;
  const totalSeconds = Math.floor(frames / frameRate);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}:${pad(ff, 2)}`;
}
