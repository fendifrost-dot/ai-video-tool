// Filing a dressed take — the two server steps that are pure: where its bytes may be fetched from, and conforming
// them to the length of the cut they were made from (src/lib/storyboard/dress.ts says why).
//
// Pure: no Deno, no network. Used by provider-jobs-tick and tested under vitest.

import { retimeMp4 } from "./mp4Retime.ts";
import { validateUrl } from "./urlValidator.ts";

/** The provider CDNs a dressed result may be downloaded from (the object-swap serves from CloudFront). */
export const DRESS_RESULT_HOSTS = [".cloudfront.net", ".higgsfield.ai"];

/** A conformed clip may differ from its source by at most this much, seconds (well under a frame). */
export const CONFORM_TOLERANCE = 0.01;

/**
 * The result URL a dressed job's own row carries (the provider's status answer, or an imported finished swap), when
 * it is safe for the server to fetch: https, a public host, on the provider's CDN. Null otherwise — the caller then
 * asks Control Center for it, as for any job. The row is written by the browser, so its URL is never trusted blindly.
 */
export function dressResultUrl(env: Record<string, unknown> | null | undefined): string | null {
  const raw = env?.resultUrl;
  if (typeof raw !== "string") return null;
  const v = validateUrl(raw);
  if (!v.ok) return null;
  const host = v.url.hostname.toLowerCase();
  return DRESS_RESULT_HOSTS.some((h) => host.endsWith(h)) ? v.url.toString() : null;
}

export type ConformRecord = {
  conform_method: "container_timescale";
  output_duration: number;
  conformed_duration: number;
  conformed_to: number;
  retime_ratio: number;
  audio_dropped: number;
};

/**
 * Conform a dressed clip's bytes to the length of the cut it was made from. Throws — so the job is tried again and,
 * failing that, given up with the reason — rather than file a clip that would drift off the song.
 */
export function conformDressedClip(
  bytes: Uint8Array,
  sourceSeconds: number,
): { bytes: Uint8Array; meta: ConformRecord } {
  const r = retimeMp4(bytes, sourceSeconds, { dropAudio: true });
  if (Math.abs(r.after - sourceSeconds) > CONFORM_TOLERANCE) {
    throw new Error(
      `the dressed clip could not be conformed: it measures ${r.after.toFixed(3)} s after the retime, the source is ${sourceSeconds.toFixed(3)} s`,
    );
  }
  const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
  return {
    bytes: r.bytes,
    meta: {
      conform_method: "container_timescale",
      output_duration: r4(r.before),
      conformed_duration: r4(r.after),
      conformed_to: r4(sourceSeconds),
      retime_ratio: Math.round(r.ratio * 1e6) / 1e6,
      audio_dropped: r.droppedAudio,
    },
  };
}
