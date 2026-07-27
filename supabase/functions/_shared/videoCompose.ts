// Pure helpers for reassembling an ordered frame sequence (+ optional audio)
// into a video via Fal `fal-ai/ffmpeg-api/compose`. No Deno / DOM globals — so
// vitest exercises this exactly like _shared/maskMorphology.ts.
//
// Compose input shape (verified against fal.ai/models/fal-ai/ffmpeg-api/compose):
//   { tracks: [ { id, type: "video"|"audio"|"image", keyframes: [ { timestamp, duration, url } ] } ] }
// timestamp/duration are MILLISECONDS. Output: { video_url, thumbnail_url }.
//
// An image track with one keyframe per frame (each shown for one frame's worth
// of ms) plays the sequence back at `fps`. An optional audio track lays the
// original master's audio over the whole clip.

export interface ComposeKeyframe {
  timestamp: number;
  duration: number;
  url: string;
}

export interface ComposeTrack {
  id: string;
  type: "video" | "audio" | "image";
  keyframes: ComposeKeyframe[];
}

export interface ComposePayload {
  tracks: ComposeTrack[];
}

/**
 * Build the compose `tracks` payload from ordered signed frame URLs.
 *
 * @param frameUrls  Signed https URLs, already in presentation order.
 * @param fps        Playback frame rate. Must be > 0.
 * @param audioUrl   Optional signed URL whose audio is laid over the clip
 *                   (the master video URL works — compose reads its audio).
 */
export function buildComposeTracks(
  frameUrls: string[],
  fps: number,
  audioUrl?: string | null,
): ComposePayload {
  if (!Array.isArray(frameUrls) || frameUrls.length === 0) {
    throw new Error("buildComposeTracks: no frame URLs");
  }
  if (!(fps > 0)) throw new Error(`buildComposeTracks: invalid fps ${fps}`);

  // Integer-ms per frame. Rounding drift is corrected by anchoring each
  // keyframe's timestamp to i*1000/fps (not by accumulating `frameMs`), so the
  // sequence never slides out of sync over a long clip.
  const frameMs = 1000 / fps;
  const keyframes: ComposeKeyframe[] = frameUrls.map((url, i) => {
    const start = Math.round((i * 1000) / fps);
    const end = Math.round(((i + 1) * 1000) / fps);
    return { timestamp: start, duration: Math.max(1, end - start), url };
  });

  const tracks: ComposeTrack[] = [{ id: "frames", type: "image", keyframes }];

  if (audioUrl) {
    const totalMs = Math.round((frameUrls.length * 1000) / fps);
    tracks.push({
      id: "audio",
      type: "audio",
      keyframes: [{ timestamp: 0, duration: Math.max(frameMs, totalMs), url: audioUrl }],
    });
  }

  return { tracks };
}

function isHttpsUrl(v: unknown): v is string {
  return typeof v === "string" && v.trim().startsWith("https://");
}

/** Pull the output video URL from a compose result, tolerating shape variance. */
export function extractComposeVideoUrl(result: Record<string, unknown>): string | null {
  if (isHttpsUrl(result?.video_url)) return String(result.video_url).trim();
  const video = result?.video as { url?: string } | undefined;
  if (isHttpsUrl(video?.url)) return video!.url!.trim();
  if (isHttpsUrl(result?.url)) return String(result.url).trim();
  const output = result?.output as { url?: string; video_url?: string } | undefined;
  if (isHttpsUrl(output?.video_url)) return String(output!.video_url).trim();
  if (isHttpsUrl(output?.url)) return String(output!.url).trim();
  return null;
}
