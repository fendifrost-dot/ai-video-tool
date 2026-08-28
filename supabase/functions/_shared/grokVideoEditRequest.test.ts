import { describe, expect, it } from "vitest";
import { buildGrokVideoEditXaiBody } from "./grokVideoEditRequest.ts";

describe("buildGrokVideoEditXaiBody", () => {
  it("uses struct forms for video and reference_images", () => {
    const body = buildGrokVideoEditXaiBody({
      model: "grok-imagine-video",
      prompt: "test",
      videoUrl: "https://example.com/video.mp4",
      referenceUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
    });

    expect(body.video).toEqual({ url: "https://example.com/video.mp4" });
    expect(body.reference_images).toEqual([
      { url: "https://example.com/a.jpg" },
      { url: "https://example.com/b.jpg" },
    ]);
    expect(body.reference_images.every((r) => typeof r === "object" && "url" in r)).toBe(true);
    expect(body.reference_images.some((r) => typeof r === "string")).toBe(false);
  });
});
