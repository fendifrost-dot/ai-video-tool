import { describe, expect, it } from "vitest";
import {
  readScrubProxyMeta,
  resolveScrubSource,
  scrubProxyReady,
} from "./scrubProxy";

describe("readScrubProxyMeta", () => {
  it("returns empty for non-object metadata", () => {
    expect(readScrubProxyMeta(null)).toEqual({});
    expect(readScrubProxyMeta(undefined)).toEqual({});
    expect(readScrubProxyMeta("nope")).toEqual({});
  });

  it("extracts proxy pointer fields, ignoring unrelated keys", () => {
    expect(
      readScrubProxyMeta({
        mime_type: "video/mp4",
        scrub_proxy_path: "u/1/p.mp4",
        scrub_proxy_bucket: "project-references",
        scrub_proxy_status: "ready",
      }),
    ).toEqual({
      scrub_proxy_path: "u/1/p.mp4",
      scrub_proxy_bucket: "project-references",
      scrub_proxy_status: "ready",
    });
  });

  it("drops an unrecognised status", () => {
    expect(readScrubProxyMeta({ scrub_proxy_status: "bogus" })).toEqual({});
  });
});

describe("scrubProxyReady", () => {
  it("is true only when status is ready AND a path is present", () => {
    expect(scrubProxyReady({ scrub_proxy_status: "ready", scrub_proxy_path: "p.mp4" })).toBe(true);
    expect(scrubProxyReady({ scrub_proxy_status: "ready" })).toBe(false);
    expect(scrubProxyReady({ scrub_proxy_status: "processing", scrub_proxy_path: "p.mp4" })).toBe(
      false,
    );
    expect(scrubProxyReady({})).toBe(false);
  });
});

describe("resolveScrubSource", () => {
  it("falls back to the master when no proxy exists (today's behavior)", () => {
    expect(resolveScrubSource("project-references", "u/1/master.mov", { mime_type: "video/mp4" })).toEqual(
      { bucket: "project-references", path: "u/1/master.mov", isProxy: false },
    );
  });

  it("falls back to the master while the transcode is still running", () => {
    const src = resolveScrubSource("project-references", "u/1/master.mov", {
      scrub_proxy_status: "processing",
      scrub_proxy_path: "u/1/proxy.mp4",
    });
    expect(src).toEqual({ bucket: "project-references", path: "u/1/master.mov", isProxy: false });
  });

  it("prefers a ready proxy and defaults its bucket to the master's", () => {
    const src = resolveScrubSource("project-references", "u/1/master.mov", {
      scrub_proxy_status: "ready",
      scrub_proxy_path: "u/1/proxy.mp4",
    });
    expect(src).toEqual({ bucket: "project-references", path: "u/1/proxy.mp4", isProxy: true });
  });

  it("honors an explicit proxy bucket when set", () => {
    const src = resolveScrubSource("project-references", "u/1/master.mov", {
      scrub_proxy_status: "ready",
      scrub_proxy_path: "u/1/proxy.mp4",
      scrub_proxy_bucket: "project-clips",
    });
    expect(src).toEqual({ bucket: "project-clips", path: "u/1/proxy.mp4", isProxy: true });
  });
});
