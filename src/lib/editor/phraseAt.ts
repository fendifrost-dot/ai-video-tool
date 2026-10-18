import type { EditClip, EditMarker, EditSequence } from "../../../supabase/functions/edit-render/model";
import { phraseLoopWindow } from "./playback";

const PHRASE_KINDS = new Set(["lyric", "lipsync"]);

function markerEnd(m: EditMarker): number {
  return m.timeOut != null && m.timeOut > m.timeIn ? m.timeOut : m.timeIn + 2;
}

function covers(m: EditMarker, t: number): boolean {
  return t >= m.timeIn - 1e-6 && t < markerEnd(m) - 1e-6;
}

/**
 * Resolve the lyric/lipsync phrase for Loop phrase.
 * Marker times are on the sequence timeline (not the song clock).
 * Preference: phrase covering the playhead → phrase linked to the selected clip
 * → phrase overlapping the selected clip’s timeline range → nearest phrase.
 */
export function phraseAtPlayhead(input: {
  sequence: EditSequence;
  playhead: number;
  selectedClip?: EditClip | null;
}): EditMarker | null {
  const phrases = input.sequence.markers.filter((m) => PHRASE_KINDS.has(m.kind));
  if (!phrases.length) return null;

  const atHead = phrases.find((m) => covers(m, input.playhead));
  if (atHead) return atHead;

  const clip = input.selectedClip ?? null;
  if (clip) {
    const byClipId = phrases.find((m) => m.clipId && m.clipId === clip.id);
    if (byClipId) return byClipId;
    const overlapping = phrases.find(
      (m) => m.timeIn < clip.timelineOut - 1e-6 && markerEnd(m) > clip.timelineIn + 1e-6,
    );
    if (overlapping) return overlapping;
  }

  // Nearest by start time
  let best: EditMarker | null = null;
  let bestDist = Infinity;
  for (const m of phrases) {
    const mid = (m.timeIn + markerEnd(m)) / 2;
    const d = Math.abs(mid - input.playhead);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

/** Timeline loop window for a phrase marker, with pre-roll. */
export function loopWindowForPhrase(
  marker: EditMarker,
  sequenceDuration: number,
  preRoll = 0.35,
): { start: number; end: number } {
  return phraseLoopWindow({
    timeIn: marker.timeIn,
    timeOut: marker.timeOut,
    preRoll,
    sequenceDuration,
  });
}
