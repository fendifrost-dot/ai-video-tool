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

  // IPv4 literal — any form. We deliberately go through normalizeIpv4Host
  // (which handles decimal, octal, hex, and single-integer forms) before
  // checking the class, so an attacker can't slip a loopback or private IP
  // past us by writing it as "0177.0.0.1" / "0x7f.0.0.1" / "2130706433".
  //
  // Node 22's URL parser already normalizes these forms on `new URL()`, but
  // Deno (which actually runs this edge function in prod) does not — so we
  // re-normalize here for portability.
  const normalizedIpv4 = normalizeIpv4Host(host);
  if (normalizedIpv4) {
    const v = ipv4Class(normalizedIpv4);
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


/**
 * Normalize an IPv4 host expressed in any of the common alternate forms to its
 * canonical decimal dotted-quad. Returns null if `host` is not a valid IPv4
 * literal in any form. The defenses in validateUrl rely on this — we want to
 * catch obfuscation attempts (octal `0177.0.0.1`, hex `0x7f.0.0.1`, integer
 * `2130706433`) and classify them through ipv4Class as if they were written
 * in decimal.
 *
 * Forms accepted (matching the historic Berkeley inet_aton behavior that
 * libc resolvers and most browsers still honor):
 *   - 4-part dotted quad: a.b.c.d   each 8 bits
 *   - 3-part:             a.b.c     a,b are 8-bit; c is 16-bit
 *   - 2-part:             a.b       a is 8-bit; b is 24-bit
 *   - 1-part:             a         32-bit integer (e.g. 2130706433 == 127.0.0.1)
 *
 * Within each part: leading "0x"/"0X" → hex; leading "0" → octal; otherwise
 * decimal. Any digit outside the radix → reject the whole host.
 */
export function normalizeIpv4Host(host: string): string | null {
  if (host.length === 0 || host.length > 64) return null;

  const parts = host.split(".");
  if (parts.length < 1 || parts.length > 4) return null;

  const values: number[] = [];
  for (const part of parts) {
    const n = parseIpv4Segment(part);
    if (n === null) return null;
    values.push(n);
  }

  // Per-part max widths (in bits) for each form length.
  const maxByLen: Record<number, number[]> = {
    1: [32],
    2: [8, 24],
    3: [8, 8, 16],
    4: [8, 8, 8, 8],
  };
  const widths = maxByLen[values.length];
  for (let i = 0; i < values.length; i++) {
    const w = widths[i];
    const max = w === 32 ? 0xffffffff : (1 << w) - 1;
    if (values[i] < 0 || values[i] > max) return null;
  }

  // Pack into a single 32-bit big-endian integer.
  let packed = 0;
  if (values.length === 1) {
    packed = values[0] >>> 0;
  } else if (values.length === 2) {
    packed = (((values[0] & 0xff) << 24) | (values[1] & 0xffffff)) >>> 0;
  } else if (values.length === 3) {
    packed =
      (((values[0] & 0xff) << 24) |
        ((values[1] & 0xff) << 16) |
        (values[2] & 0xffff)) >>>
      0;
  } else {
    packed =
      (((values[0] & 0xff) << 24) |
        ((values[1] & 0xff) << 16) |
        ((values[2] & 0xff) << 8) |
        (values[3] & 0xff)) >>>
      0;
  }

  const a = (packed >>> 24) & 0xff;
  const b = (packed >>> 16) & 0xff;
  const c = (packed >>> 8) & 0xff;
  const d = packed & 0xff;
  return `${a}.${b}.${c}.${d}`;
}

function parseIpv4Segment(s: string): number | null {
  if (s.length === 0) return null;
  // Hex: 0x... / 0X...
  if (s.length >= 3 && (s[0] === "0") && (s[1] === "x" || s[1] === "X")) {
    const body = s.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(body)) return null;
    // Cap reasonable length — 32-bit hex is 8 chars; allow leading zeros.
    if (body.length > 16) return null;
    const n = parseInt(body, 16);
    if (!Number.isFinite(n)) return null;
    return n;
  }
  // Octal: leading 0 with more digits, all 0-7
  if (s.length > 1 && s[0] === "0") {
    if (!/^[0-7]+$/.test(s)) return null;
    const n = parseInt(s, 8);
    if (!Number.isFinite(n)) return null;
    return n;
  }
  // Decimal
  if (!/^[0-9]+$/.test(s)) return null;
  // Single "0" is a valid decimal zero.
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}
