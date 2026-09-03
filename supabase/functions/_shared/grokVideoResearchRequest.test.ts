import { describe, expect, it } from "vitest";
import {
  buildResearchEditVideoBody,
  buildResearchImageToVideoBody,
  buildResearchReferenceToVideoBody,
} from "./grokVideoResearchRequest.ts";

describe("research proxy xAI bodies — endpoint-specific", () => {
  it("edit_video uses video object, never video_url", () => {
    const body = buildResearchEditVideoBody({
      model: "grok-imagine-video",
      prompt: "keep identity",
      videoUrl: "https://example.com/source.mp4",
    });
    expect(body.video).toEqual({ url: "https://example.com/source.mp4" });
    expect(body).not.toHaveProperty("video_url");
    expect(body.reference_images).toBeUndefined();
  });

  it("edit_video attaches reference_images as object array when refs exist", () => {
    const body = buildResearchEditVideoBody({
      model: "grok-imagine-video",
      prompt: "swap outfit",
      videoUrl: "https://example.com/source.mp4",
      referenceUrls: ["https://example.com/flat.jpg"],
    });
    expect(body.video).toEqual({ url: "https://example.com/source.mp4" });
    expect(body.reference_images).toEqual([{ url: "https://example.com/flat.jpg" }]);
    expect(body.reference_images?.some((r) => typeof r === "string")).toBe(false);
  });

  it("generations reference_to_video uses object-array reference_images", () => {
    const body = buildResearchReferenceToVideoBody({
      model: "grok-imagine-video",
      prompt: "r2v",
      referenceUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
      duration: 5,
    });
    expect(body.reference_images).toEqual([
      { url: "https://example.com/a.jpg" },
      { url: "https://example.com/b.jpg" },
    ]);
    expect(body.reference_images.every((r) => typeof r === "object" && "url" in r)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('"https://example.com/a.jpg"]');
  });

  it("generations image_to_video uses image object, never a bare string", () => {
    const body = buildResearchImageToVideoBody({
      model: "grok-imagine-video",
      prompt: "i2v",
      imageUrl: "https://example.com/first.jpg",
      duration: 5,
    });
    expect(body.image).toEqual({ url: "https://example.com/first.jpg" });
    expect(typeof body.image).toBe("object");
    expect(body).not.toHaveProperty("image_url");
  });
});
