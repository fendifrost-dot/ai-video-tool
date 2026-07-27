/**
 * Scrub-proxy resolution — pick what the Hero Frame Studio scrubber should decode.
 *
 * A 4K master can be 2 GB of HEVC that no browser will scrub smoothly (and often
 * won't decode in a media element at all — see webCodecsFrame.ts). The fix Fendi
 * chose: at upload, transcode a lightweight ~720p H.264 "scrub proxy" alongside the
 * untouched master, and point the in-tool preview/scrubber at the proxy so the
 * browser never has to decode the master. The hero frame is still pulled at FULL
 * resolution from the master at the chosen timestamp.
 *
 * The transcode itself runs OUTSIDE this repo (an external worker — see the P3
 * handoff notes). This module is only the client-side contract + resolver: it reads
 * the proxy pointer an upstream transcode writes onto the asset's `metadata_json`
 * and decides, purely, which (bucket, path) the scrubber should sign and load.
 *
 * Until a proxy exists the resolver returns the master, so callers behave exactly
 * as they do today — this is a no-op no-regression foundation.
 */

export type ScrubProxyStatus = "pending" | "processing" | "ready" | "failed";

/** Proxy pointer fields an upstream transcode step writes onto asset.metadata_json. */
export interface ScrubProxyMeta {
  /** Storage path of the ~720p H.264 proxy, once transcoded. */
  scrub_proxy_path?: string;
  /** Bucket holding the proxy; defaults to the master's bucket when omitted. */
  scrub_proxy_bucket?: string;
  /** Lifecycle of the transcode job. Only "ready" makes the proxy usable. */
  scrub_proxy_status?: ScrubProxyStatus;
}

const STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "processing",
  "ready",
  "failed",
]);

/** Normalize an asset's raw `metadata_json` (Json/unknown) into the proxy fields. */
export function readScrubProxyMeta(metadata: unknown): ScrubProxyMeta {
  if (!metadata || typeof metadata !== "object") return {};
  const m = metadata as Record<string, unknown>;
  const path = typeof m.scrub_proxy_path === "string" ? m.scrub_proxy_path : undefined;
  const bucket = typeof m.scrub_proxy_bucket === "string" ? m.scrub_proxy_bucket : undefined;
  const status =
    typeof m.scrub_proxy_status === "string" && STATUSES.has(m.scrub_proxy_status)
      ? (m.scrub_proxy_status as ScrubProxyStatus)
      : undefined;
  return {
    ...(path ? { scrub_proxy_path: path } : {}),
    ...(bucket ? { scrub_proxy_bucket: bucket } : {}),
    ...(status ? { scrub_proxy_status: status } : {}),
  };
}

/** A proxy is usable only when the transcode finished AND wrote a path. */
export function scrubProxyReady(meta: ScrubProxyMeta): boolean {
  return meta.scrub_proxy_status === "ready" && Boolean(meta.scrub_proxy_path);
}

export interface ScrubSource {
  bucket: string;
  path: string;
  /** True when this points at the proxy rather than the master. */
  isProxy: boolean;
}

/**
 * Resolve the source the SCRUBBER should load: the ready proxy if one exists,
 * otherwise the full-quality master. Capture must always use the master
 * separately — never this — to keep the hero frame full-resolution.
 */
export function resolveScrubSource(
  masterBucket: string,
  masterPath: string,
  metadata: unknown,
): ScrubSource {
  const meta = readScrubProxyMeta(metadata);
  if (scrubProxyReady(meta)) {
    return {
      bucket: meta.scrub_proxy_bucket ?? masterBucket,
      path: meta.scrub_proxy_path as string,
      isProxy: true,
    };
  }
  return { bucket: masterBucket, path: masterPath, isProxy: false };
}
