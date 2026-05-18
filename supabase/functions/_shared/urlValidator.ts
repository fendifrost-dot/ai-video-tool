/**
 * SSRF protection for the fetch-reference-image edge function.
 *
 * Pure module — no Deno or browser globals. The Deno edge function imports
 * the helpers here; the unit tests (src/lib/edgeFunctions/urlValidator.test.ts)
 * run them in vitest without touching the runtime.
 *
 * Threat model: the user pastes an arbitrary URL that the server will fetch
 * and store. An attacker who controls a wardrobe URL we follow could:
 *   - Hit internal services on localhost/private LAN
 *   - Bounce through DNS rebinding by returning a private IP after redirect
 *   - Slurp a 5 GB file and run us out of memory
 *   - Hand back HTML disguised as an image
 *
 * Defenses applied here:
 *   - Scheme must be https
 *   - Hostname must not be localhost / loopback / private / link-local / reserved
 *   - On redirect, re-validate the new URL before following
 *   - Caller enforces redirect cap (1) and byte cap (20 MB)
 */

export const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_REDIRECTS = 1;
export const FETCH_TIMEOUT_MS = 30_000;

export type UrlValidationError =
  | { ok: false; reason: "invalid_url"; detail?: string }
  | { ok: false; reason: "scheme_not_https"; detail?: string }
  | { ok: false; reason: "host_blocked"; detail?: string }
  | { ok: false; reason: "hostname_invalid"; detail?: string };

export type UrlValidationOk = { ok: true; url: URL };

export type UrlValidationResult = UrlValidationOk | UrlValidationError;

/**
 * Validate a URL is safe to fetch from the edge function. Does NOT do DNS
 * resolution — IP-literal hostnames are rejected directly, and DNS rebinding
 * is mitigated separately (caller re-validates after the first redirect, and
 * the fetch caps bytes + redirects).
 */
export function validateUrl(input: string): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(input);
  } catch (err) {
    return { ok: false, reason: "invalid_url", detail: String(err) };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "scheme_not_https", detail: url.protocol };
  }

  const host = url.hostname.toLowerCase();
  if (!host) {
    return { ok: false, reason: "hostname_invalid", detail: "empty" };
  }

  // Reject hostnames that look obviously local before any IP parsing
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") {
    return { ok: false, reason: "host_blocked", detail: "localhost" };
  }

  // .local (mDNS), .internal (common k8s/internal TLD), .lan, .home, .corp
  const blockedTlds = [".local", ".internal", ".lan", ".home", ".corp", ".intranet", ".private"];
  for (const tld of blockedTlds) {
    if (host.endsWith(tld)) {
      return { ok: false, reason: "host_blocked", detail: `tld:${tld}` };
    }
  }

  // IPv4 literal?
  if (isIpv4Literal(host)) {
    const v = ipv4Class(host);
    if (v !== "public") {
      return { ok: false, reason: "host_blocked", detail: `ipv4:${v}` };
    }
    return { ok: true, url };
  }

  // IPv6 literal? Browsers normalize to [::1] etc. — URL.hostname strips the
  // brackets. Reject any colon-bearing hostname unless it's clearly public,
  // which is hard to assert without a full parser — safest is to reject.
  if (host.includes(":")) {
    return { ok: false, reason: "host_blocked", detail: "ipv6_literal" };
  }

  // Plain DNS hostname. Looks OK.
  return { ok: true, url };
}

export function isIpv4Literal(host: string): boolean {
  // Matches exactly four dot-separated decimal octets, each 0-255.
  // We don't accept hex (0x), octal (0-prefixed) or single-int forms — those
  // are valid in some libc resolvers but rarely encountered in real URLs,
  // and accepting them would let attackers bypass the class check.
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = parseInt(p, 10);
    if (n < 0 || n > 255) return false;
    // No leading zeros (those would be octal in some parsers).
    if (p.length > 1 && p.startsWith("0")) return false;
  }
  return true;
}

export type Ipv4Class =
  | "public"
  | "loopback"
  | "private_a"
  | "private_b"
  | "private_c"
  | "link_local"
  | "shared"
  | "cgnat"
  | "broadcast"
  | "this_network"
  | "multicast"
  | "reserved";

export function ipv4Class(host: string): Ipv4Class {
  const [a, b, c, d] = host.split(".").map((x) => parseInt(x, 10));

  if (a === 0) return "this_network";              // 0.0.0.0/8
  if (a === 10) return "private_a";                // 10.0.0.0/8
  if (a === 127) return "loopback";                // 127.0.0.0/8
  if (a === 169 && b === 254) return "link_local"; // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return "private_b"; // 172.16.0.0/12
  if (a === 192 && b === 168) return "private_c";  // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return "cgnat"; // 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return "reserved"; // 198.18.0.0/15 (benchmarking)
  if (a === 192 && b === 0 && c === 0) return "reserved"; // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return "reserved"; // TEST-NET-1
  if (a === 198 && b === 51 && c === 100) return "reserved"; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return "reserved"; // TEST-NET-3
  if (a >= 224 && a <= 239) return "multicast";    // 224.0.0.0/4
  if (a >= 240) return "reserved";                 // 240.0.0.0/4 (incl. 255.255.255.255)
  return "public";
}

/**
 * Sniff the leading bytes of a fetched body for the canonical JPEG / PNG /
 * WEBP magic numbers. Used as a second check after Content-Type so an
 * attacker can't smuggle HTML disguised as image/jpeg.
 *
 * Pass at least 16 bytes for a reliable result. Returns null if the buffer
 * doesn't match any allowed image format.
 */
export function sniffImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Pick a file extension from a MIME type. Always returns the canonical lowercase
 * form so paths stay deterministic and bucket policies stay consistent.
 */
export function extForMime(mime: string): "jpg" | "png" | "webp" {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error(`unsupported mime: ${mime}`);
  }
}
