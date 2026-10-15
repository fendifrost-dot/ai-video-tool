// Filing a dressed take — the server steps that are pure: where its bytes may be fetched from, how much may be
// fetched, and conforming them to the length of the cut they were made from (src/lib/storyboard/dress.ts says why).
//
// Pure: no Deno, no network. Used by provider-jobs-tick and tested under vitest.

import { isIsoBmff, retimeMp4 } from "./mp4Retime.ts";
import { validateUrl } from "./urlValidator.ts";

/** The provider CDNs a dressed result may be downloaded from (the object-swap serves from CloudFront). */
export const DRESS_RESULT_HOSTS = [".cloudfront.net", ".higgsfield.ai"];

/** A conformed clip may differ from its source by at most this much, seconds (well under a frame). */
export const CONFORM_TOLERANCE = 0.01;

/**
 * The retime the swap needs is ~1.08 every time (VERIFIED on request 71ff19f4: output 3.62 s ↔ source 3.92 s, output
 * 1.85 s ↔ source 2.00 s; the 1 Oct run measured 1.0005× after conform). A ratio far from that means the provider did
 * something else — trimmed, dropped frames — and a person has to look before the clip is placed on the song.
 */
export const RETIME_RATIO_MIN = 0.9;
export const RETIME_RATIO_MAX = 1.2;

/** The most the server downloads for one dressed result (a 4–5 s 720p swap is ~2–12 MB). */
export const DOWNLOAD_MAX_BYTES = 200 * 1024 * 1024;

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

/**
 * Whether a download may begin, from its headers alone: a declared length over the cap is refused before a byte is
 * read, and (when `strictType`) only a video or an opaque binary is accepted — a CDN error page is not a clip.
 */
export function acceptDownloadHeaders(input: {
  contentLength: string | null;
  contentType: string | null;
  strictType: boolean;
  maxBytes?: number;
}): { ok: true } | { ok: false; why: string } {
  const max = input.maxBytes ?? DOWNLOAD_MAX_BYTES;
  const declared = input.contentLength != null ? Number(input.contentLength) : null;
  if (declared != null && Number.isFinite(declared) && declared > max) {
    return {
      ok: false,
      why: `the result is ${Math.round(declared / 1048576)} MB, over the ${Math.round(max / 1048576)} MB limit`,
    };
  }
  if (input.strictType) {
    const type = (input.contentType ?? "").split(";")[0].trim().toLowerCase();
    if (
      !type.startsWith("video/") &&
      type !== "application/octet-stream" &&
      type !== "binary/octet-stream"
    ) {
      return { ok: false, why: `the result is served as "${type || "unknown"}", not a video` };
    }
  }
  return { ok: true };
}

/**
 * Read a body to the end, counting as it comes: past `maxBytes` the read stops (the caller's abort is called so the
 * connection is dropped) and nothing is kept. One allocation at the end, sized to what came.
 */
export async function readBounded(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  abort: () => void,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        abort();
        throw new Error(
          `the result ran past the ${Math.round(maxBytes / 1048576)} MB download limit — stopped`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

export type ConformRecord = {
  conform_method: "container_timescale";
  output_duration: number;
  conformed_duration: number;
  conformed_to: number;
  retime_ratio: number;
  audio_dropped: number;
};

/** Whether a measured retime ratio is one the swap is known to need; outside it a person looks first. */
export function retimeRatioPlausible(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio >= RETIME_RATIO_MIN && ratio <= RETIME_RATIO_MAX;
}

/**
 * Conform a dressed clip's bytes to the length of the cut it was made from. Throws — the caller then keeps the raw
 * bytes with the reason, and the take is never filed in sync — rather than place a clip that would drift off the
 * song. The bytes are retimed in place: they are the download's own, held by nobody else.
 */
export function conformDressedClip(
  bytes: Uint8Array,
  sourceSeconds: number,
): { bytes: Uint8Array; meta: ConformRecord } {
  if (!isIsoBmff(bytes)) throw new Error("the result is not an MP4 (no ftyp box): refused");
  const r = retimeMp4(bytes, sourceSeconds, { dropAudio: true, inPlace: true });
  if (Math.abs(r.after - sourceSeconds) > CONFORM_TOLERANCE) {
    throw new Error(
      `the dressed clip could not be conformed: it measures ${r.after.toFixed(3)} s after the retime, the source is ${sourceSeconds.toFixed(3)} s`,
    );
  }
  if (!retimeRatioPlausible(r.ratio)) {
    throw new Error(
      `the dressed clip came back ${r.before.toFixed(3)} s for a ${sourceSeconds.toFixed(3)} s source (ratio ${r.ratio.toFixed(3)}, expected about 1.08): the provider may have trimmed or dropped frames — look before it is placed`,
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
