import { describe, it, expect } from "vitest";
import {
  validateUrl,
  isIpv4Literal,
  ipv4Class,
  sniffImageMime,
  extForMime,
  MAX_BYTES,
  MAX_REDIRECTS,
  ALLOWED_MIME_TYPES,
} from "../../../supabase/functions/_shared/urlValidator";

describe("validateUrl — scheme", () => {
  it("accepts https", () => {
    const r = validateUrl("https://example.com/cat.jpg");
    expect(r.ok).toBe(true);
  });
  it("rejects http", () => {
    const r = validateUrl("http://example.com/cat.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("scheme_not_https");
  });
  it("rejects file://", () => {
    const r = validateUrl("file:///etc/passwd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("scheme_not_https");
  });
  it("rejects data: URIs", () => {
    const r = validateUrl("data:image/png;base64,iVBORw0KGgo=");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("scheme_not_https");
  });
  it("rejects gopher://", () => {
    const r = validateUrl("gopher://example.com/_internal");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("scheme_not_https");
  });
  it("rejects garbage strings", () => {
    const r = validateUrl("not a url");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_url");
  });
});

describe("validateUrl — local hosts", () => {
  const localish = [
    "https://localhost/x.jpg",
    "https://anything.localhost/x.jpg",
    "https://service.local/x.jpg",
    "https://kubernetes.default.internal/x.jpg",
    "https://my-printer.lan/x.jpg",
    "https://router.home/x.jpg",
    "https://intranet.corp/x.jpg",
    "https://thing.intranet/x.jpg",
    "https://thing.private/x.jpg",
  ];
  for (const url of localish) {
    it(`rejects ${url}`, () => {
      const r = validateUrl(url);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("host_blocked");
    });
  }
});

describe("validateUrl — IPv4 private ranges", () => {
  const cases: Array<[string, string]> = [
    ["https://127.0.0.1/", "loopback"],
    ["https://127.5.0.1/", "loopback"],
    ["https://10.0.0.1/", "private_a"],
    ["https://10.255.255.254/", "private_a"],
    ["https://172.16.0.1/", "private_b"],
    ["https://172.20.5.5/", "private_b"],
    ["https://172.31.255.254/", "private_b"],
    ["https://192.168.1.1/", "private_c"],
    ["https://192.168.0.0/", "private_c"],
    ["https://169.254.169.254/", "link_local"], // EC2 metadata — classic SSRF target
    ["https://0.0.0.0/", "this_network"],
    ["https://100.64.0.1/", "cgnat"],
    ["https://224.0.0.1/", "multicast"],
    ["https://239.255.255.250/", "multicast"],
    ["https://255.255.255.255/", "reserved"],
  ];
  for (const [url, expectedClass] of cases) {
    it(`rejects ${url} (${expectedClass})`, () => {
      const r = validateUrl(url);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe("host_blocked");
        expect(r.detail).toBe(`ipv4:${expectedClass}`);
      }
    });
  }

  it("accepts a public IP literal", () => {
    const r = validateUrl("https://8.8.8.8/x.jpg");
    expect(r.ok).toBe(true);
  });

  it("rejects 172.32.x.x (just outside private_b)", () => {
    // 172.32.0.0 is OUTSIDE the 172.16.0.0/12 private range, so it's public
    // by RFC. We're correctly NOT blocking it — this test pins that behavior.
    const r = validateUrl("https://172.32.0.1/x.jpg");
    expect(r.ok).toBe(true);
  });

  it("rejects 172.15.x.x just below private_b range — actually public, allowed", () => {
    const r = validateUrl("https://172.15.0.1/x.jpg");
    expect(r.ok).toBe(true);
  });
});

describe("validateUrl — IPv6", () => {
  it("rejects ::1 loopback", () => {
    const r = validateUrl("https://[::1]/x.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("host_blocked");
  });
  it("rejects fe80:: link-local", () => {
    const r = validateUrl("https://[fe80::1]/x.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("host_blocked");
  });
  it("rejects 2001:db8:: public-looking IPv6 (conservative)", () => {
    // We reject ALL ipv6 literals; we don't have a full v6 classifier and
    // would rather refuse than risk a private-ish address slipping through.
    const r = validateUrl("https://[2001:db8::1]/x.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toBe("ipv6_literal");
  });
});

describe("validateUrl — obfuscation attempts", () => {
  it("rejects octal-form IP (leading zero) after URL normalization", () => {
    // Modern URL parsing normalizes 0177.0.0.1 -> 127.0.0.1, so this should
    // be blocked as loopback by the standard IPv4 classifier.
    const r = validateUrl("https://0177.0.0.1/x.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("host_blocked");
      expect(r.detail).toBe("ipv4:loopback");
    }
  });
  it("rejects userinfo URLs with embedded credentials and private host", () => {
    const r = validateUrl("https://user:pass@127.0.0.1/x.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("host_blocked");
  });
});

describe("isIpv4Literal", () => {
  it("matches valid dotted quads", () => {
    expect(isIpv4Literal("8.8.8.8")).toBe(true);
    expect(isIpv4Literal("0.0.0.0")).toBe(true);
    expect(isIpv4Literal("255.255.255.255")).toBe(true);
  });
  it("rejects octets > 255", () => {
    expect(isIpv4Literal("256.1.1.1")).toBe(false);
    expect(isIpv4Literal("999.1.1.1")).toBe(false);
  });
  it("rejects leading-zero octets (octal smuggling)", () => {
    expect(isIpv4Literal("010.0.0.1")).toBe(false);
    expect(isIpv4Literal("0177.0.0.1")).toBe(false);
  });
  it("rejects wrong number of octets", () => {
    expect(isIpv4Literal("1.2.3")).toBe(false);
    expect(isIpv4Literal("1.2.3.4.5")).toBe(false);
  });
  it("rejects hex form", () => {
    expect(isIpv4Literal("0x7f.0.0.1")).toBe(false);
  });
});

describe("ipv4Class", () => {
  it("classifies private + reserved ranges", () => {
    expect(ipv4Class("127.0.0.1")).toBe("loopback");
    expect(ipv4Class("10.255.0.1")).toBe("private_a");
    expect(ipv4Class("172.16.0.0")).toBe("private_b");
    expect(ipv4Class("172.31.255.255")).toBe("private_b");
    expect(ipv4Class("172.32.0.0")).toBe("public");
    expect(ipv4Class("192.168.0.0")).toBe("private_c");
    expect(ipv4Class("169.254.169.254")).toBe("link_local");
    expect(ipv4Class("100.64.0.0")).toBe("cgnat");
    expect(ipv4Class("100.127.255.255")).toBe("cgnat");
    expect(ipv4Class("100.128.0.0")).toBe("public");
    expect(ipv4Class("8.8.8.8")).toBe("public");
    expect(ipv4Class("1.1.1.1")).toBe("public");
    expect(ipv4Class("224.0.0.1")).toBe("multicast");
  });
});

describe("sniffImageMime", () => {
  it("detects JPEG magic", () => {
    const b = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    expect(sniffImageMime(b)).toBe("image/jpeg");
  });
  it("detects PNG magic", () => {
    const b = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    expect(sniffImageMime(b)).toBe("image/png");
  });
  it("detects WEBP magic", () => {
    const b = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(sniffImageMime(b)).toBe("image/webp");
  });
  it("rejects HTML disguised as image", () => {
    const html = new TextEncoder().encode("<!DOCTYPE html><html><body>");
    expect(sniffImageMime(html)).toBeNull();
  });
  it("rejects empty / tiny buffers", () => {
    expect(sniffImageMime(new Uint8Array(0))).toBeNull();
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
  it("rejects GIF (we don't support it)", () => {
    const gif = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x10, 0x00, 0x10, 0x00, 0xf0, 0x00,
    ]);
    expect(sniffImageMime(gif)).toBeNull();
  });
});

describe("extForMime", () => {
  it("maps allowed MIMEs", () => {
    expect(extForMime("image/jpeg")).toBe("jpg");
    expect(extForMime("image/png")).toBe("png");
    expect(extForMime("image/webp")).toBe("webp");
  });
  it("throws on unsupported", () => {
    expect(() => extForMime("image/gif")).toThrow();
    expect(() => extForMime("text/html")).toThrow();
  });
});

describe("constants", () => {
  it("MAX_BYTES is 20 MB", () => {
    expect(MAX_BYTES).toBe(20 * 1024 * 1024);
  });
  it("MAX_REDIRECTS is 1", () => {
    expect(MAX_REDIRECTS).toBe(1);
  });
  it("ALLOWED_MIME_TYPES is exactly jpeg/png/webp", () => {
    expect([...ALLOWED_MIME_TYPES].sort()).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});
