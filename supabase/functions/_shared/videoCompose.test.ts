import { describe, expect, it } from "vitest";
import { buildComposeTracks, extractComposeVideoUrl } from "./videoCompose";

describe("buildComposeTracks", () => {
  it("makes one image keyframe per frame at the right fps timing", () => {
    const urls = ["https://f/0.jpg", "https://f/1.jpg", "https://f/2.jpg"];
    const { tracks } = buildComposeTracks(urls, 24);
    expect(tracks).toHaveLength(1);
    const img = tracks[0];
    expect(img.type).toBe("image");
    expect(img.keyframes).toHaveLength(3);
    expect(img.keyframes[0]).toEqual({ timestamp: 0, duration: 42, url: urls[0] });
    // Anchored to i*1000/fps so rounding never accumulates.
    expect(img.keyframes[1].timestamp).toBe(42);
    expect(img.keyframes[2].timestamp).toBe(83);
  });

  it("keyframe timestamps are monotonic with no accumulated drift over many frames", () => {
    const urls = Array.from({ length: 240 }, (_, i) => `https://f/${i}.jpg`);
    const { tracks } = buildComposeTracks(urls, 30);
    const ks = tracks[0].keyframes;
    for (let i = 1; i < ks.length; i++) {
      expect(ks[i].timestamp).toBeGreaterThan(ks[i - 1].timestamp);
    }
    // 240 frames @ 30fps == 8s == last frame starts at 7966ms (239*1000/30).
    expect(ks[239].timestamp).toBe(Math.round((239 * 1000) / 30));
  });

  it("adds an audio track spanning the whole clip when an audio URL is given", () => {
    const urls = ["https://f/0.jpg", "https://f/1.jpg"];
    const { tracks } = buildComposeTracks(urls, 25, "https://master.mp4");
    expect(tracks).toHaveLength(2);
    const audio = tracks[1];
    expect(audio.type).toBe("audio");
    expect(audio.keyframes).toHaveLength(1);
    expect(audio.keyframes[0].timestamp).toBe(0);
    expect(audio.keyframes[0].url).toBe("https://master.mp4");
    // 2 frames @ 25fps == 80ms total.
    expect(audio.keyframes[0].duration).toBe(80);
  });

  it("rejects empty frames or non-positive fps", () => {
    expect(() => buildComposeTracks([], 24)).toThrow();
    expect(() => buildComposeTracks(["https://f/0.jpg"], 0)).toThrow();
    expect(() => buildComposeTracks(["https://f/0.jpg"], -5)).toThrow();
  });
});

describe("extractComposeVideoUrl", () => {
  it("reads the canonical video_url", () => {
    expect(extractComposeVideoUrl({ video_url: "https://out.mp4" })).toBe("https://out.mp4");
  });
  it("falls back through common shapes", () => {
    expect(extractComposeVideoUrl({ video: { url: "https://a.mp4" } })).toBe("https://a.mp4");
    expect(extractComposeVideoUrl({ output: { video_url: "https://b.mp4" } })).toBe(
      "https://b.mp4",
    );
    expect(extractComposeVideoUrl({ url: "https://c.mp4" })).toBe("https://c.mp4");
  });
  it("returns null when nothing usable is present", () => {
    expect(extractComposeVideoUrl({})).toBeNull();
    expect(extractComposeVideoUrl({ video_url: "http://insecure.mp4" })).toBeNull();
  });
});
