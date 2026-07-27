import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the supabase client BEFORE importing the module under test.
// `vi.hoisted` keeps the mock fn accessible to the hoisted vi.mock factory.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { dispatchScrubProxy, shouldDispatchScrubProxy } from "./dispatchScrubProxy";
import { resolveScrubSource } from "./scrubProxy";

describe("shouldDispatchScrubProxy", () => {
  it("dispatches for a video by mime type", () => {
    expect(shouldDispatchScrubProxy({ mimeType: "video/mp4", fileUrl: "u/1/clip.bin" })).toBe(true);
  });

  it("dispatches for a video by extension when mime is absent", () => {
    expect(shouldDispatchScrubProxy({ fileUrl: "u/1/clip.mov" })).toBe(true);
    expect(shouldDispatchScrubProxy({ fileUrl: "u/1/clip.MP4" })).toBe(true);
    expect(shouldDispatchScrubProxy({ fileUrl: "u/1/clip.webm" })).toBe(true);
  });

  it("does not dispatch for non-video assets", () => {
    expect(shouldDispatchScrubProxy({ mimeType: "image/png", fileUrl: "u/1/still.png" })).toBe(
      false,
    );
    expect(shouldDispatchScrubProxy({ fileUrl: "u/1/notes.txt" })).toBe(false);
  });

  it("skips when a proxy is already ready or processing", () => {
    for (const status of ["ready", "processing"]) {
      expect(
        shouldDispatchScrubProxy({
          mimeType: "video/mp4",
          fileUrl: "u/1/clip.mp4",
          metadata: { scrub_proxy_status: status },
        }),
      ).toBe(false);
    }
  });

  it("re-dispatches when a prior attempt is pending or failed", () => {
    for (const status of ["pending", "failed", undefined]) {
      expect(
        shouldDispatchScrubProxy({
          mimeType: "video/mp4",
          fileUrl: "u/1/clip.mp4",
          metadata: status ? { scrub_proxy_status: status } : {},
        }),
      ).toBe(true);
    }
  });
});

describe("dispatchScrubProxy", () => {
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("invokes the edge function with the asset id for a video", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    const ok = await dispatchScrubProxy("asset-123", {
      mimeType: "video/mp4",
      fileUrl: "u/1/clip.mp4",
    });
    expect(ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("make-scrub-proxy-proxy", {
      body: { assetId: "asset-123" },
    });
  });

  it("does not invoke for a non-video asset", async () => {
    const ok = await dispatchScrubProxy("asset-1", {
      mimeType: "image/png",
      fileUrl: "u/1/still.png",
    });
    expect(ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("returns false (does not throw) when the edge function errors", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const ok = await dispatchScrubProxy("asset-2", {
      mimeType: "video/mp4",
      fileUrl: "u/1/clip.mp4",
    });
    expect(ok).toBe(false);
  });

  it("returns false (does not throw) when invoke rejects", async () => {
    invokeMock.mockRejectedValue(new Error("network down"));
    const ok = await dispatchScrubProxy("asset-3", {
      mimeType: "video/mp4",
      fileUrl: "u/1/clip.mp4",
    });
    expect(ok).toBe(false);
  });
});

describe("dispatch → resolve round-trip", () => {
  it("resolveScrubSource serves the proxy once the transcode writes its pointer", () => {
    const masterBucket = "project-clips";
    const masterPath = "u/1/proj/master.mov";

    // Before the transcode finishes: scrubber uses the master.
    const before = resolveScrubSource(masterBucket, masterPath, {
      mime_type: "video/quicktime",
      scrub_proxy_status: "processing",
      scrub_proxy_path: `${masterPath}.proxy.mp4`,
      scrub_proxy_bucket: masterBucket,
    });
    expect(before).toEqual({ bucket: masterBucket, path: masterPath, isProxy: false });

    // The exact metadata make-scrub-proxy-proxy writes on completion.
    const readyMeta = {
      mime_type: "video/quicktime",
      scrub_proxy_path: `${masterPath}.proxy.mp4`,
      scrub_proxy_bucket: masterBucket,
      scrub_proxy_status: "ready",
    };
    const after = resolveScrubSource(masterBucket, masterPath, readyMeta);
    expect(after).toEqual({
      bucket: masterBucket,
      path: `${masterPath}.proxy.mp4`,
      isProxy: true,
    });
  });
});
