import { describe, expect, it } from "vitest";
import { GROK_VIDEO_EDIT_PROMPT } from "../../../src/lib/heroFrame/grokVideoEditPrompt.ts";
import { EDIT_R4_PRODUCT } from "../../../src/lib/heroFrame/editR4ProductIds.ts";
import { pickGrokVideoEditReferencePaths } from "./garmentReference.ts";
import { buildGrokVideoEditXaiBody, redactSignedUrls } from "./grokVideoEditRequest.ts";

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

  it("EDIT-R4-PRODUCT-1 envelope: edits endpoint shape, frozen prompt, one flat ref", () => {
    const paths = pickGrokVideoEditReferencePaths(
      [
        {
          angle: "on_model",
          label: "on-model YSL model (IMG_5541)",
          storage_path: EDIT_R4_PRODUCT.onModelReferencePath,
        },
        {
          angle: "front",
          storage_path: EDIT_R4_PRODUCT.flatReferencePath,
        },
      ],
      EDIT_R4_PRODUCT.onModelReferencePath,
      1,
    );
    expect(paths).toEqual([EDIT_R4_PRODUCT.flatReferencePath]);

    const body = buildGrokVideoEditXaiBody({
      model: "grok-imagine-video",
      prompt: GROK_VIDEO_EDIT_PROMPT,
      videoUrl: "https://storage.example/source.mp4?token=secret",
      referenceUrls: [`https://storage.example/${EDIT_R4_PRODUCT.flatReferencePath}?token=secret`],
    });

    expect(body.model).toBe("grok-imagine-video");
    expect(body.prompt).toBe(GROK_VIDEO_EDIT_PROMPT);
    expect(body.video).toEqual({ url: "https://storage.example/source.mp4?token=secret" });
    expect(body.reference_images).toHaveLength(1);
    expect(body.reference_images[0]).toEqual({
      url: `https://storage.example/${EDIT_R4_PRODUCT.flatReferencePath}?token=secret`,
    });
    expect(JSON.stringify(body)).not.toContain("onmodel");

    const redacted = redactSignedUrls(body) as typeof body;
    expect(redacted.video.url).toBe("https://storage.example/source.mp4?<signed>");
    expect(redacted.prompt).toBe(GROK_VIDEO_EDIT_PROMPT);
  });
});
