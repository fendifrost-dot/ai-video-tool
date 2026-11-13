// Contract for the Runway video-edit body. No provider call, no spend.
// Field names: runwayml/sdk-python video_to_video_create_params.py, read 2026-11-13.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  RUNWAY_EDIT_VIDEO_FIELD,
  buildRunwayVideoEditRequest,
  runwayEditVideoField,
} from "./contract.ts";

const VIDEO = "https://example.supabase.co/storage/v1/object/sign/project-clips/take.mp4?token=x";
const FRAME =
  "https://example.supabase.co/storage/v1/object/sign/project-references/frame.png?token=x";
const GARMENT =
  "https://example.supabase.co/storage/v1/object/sign/project-references/garment.png?token=x";
const PROMPT = "Keep his face. Change only the jacket.";

const here = dirname(fileURLToPath(import.meta.url));
const proxySource = readFileSync(resolve(here, "./index.ts"), "utf8");

describe("runway edit video field per model", () => {
  it("records promptVideo only for seedance2_5", () => {
    expect(RUNWAY_EDIT_VIDEO_FIELD).toEqual({
      seedance2_5: "promptVideo",
      aleph2: "videoUri",
      gemini_omni_flash: "videoUri",
      "gemini_omni_flash_1.1": "videoUri",
    });
    expect(runwayEditVideoField("seedance2_5")).toBe("promptVideo");
    expect(runwayEditVideoField("aleph2")).toBe("videoUri");
    expect(runwayEditVideoField("gemini_omni_flash")).toBe("videoUri");
    expect(runwayEditVideoField("gemini_omni_flash_1.1")).toBe("videoUri");
  });

  it("refuses a model whose source-clip field is not recorded", () => {
    expect(() => runwayEditVideoField("gen4_aleph")).toThrow(
      /runway_edit_video_field_unrecorded:gen4_aleph/,
    );
  });
});

describe("buildRunwayVideoEditRequest", () => {
  it("sends promptVideo for seedance2_5 edit and does not send videoUri", () => {
    const body = buildRunwayVideoEditRequest({
      model: "seedance2_5",
      contract: "mode_edit",
      videoUrl: VIDEO,
      promptText: PROMPT,
      references: [{ uri: GARMENT }],
    });
    expect(body).toEqual({
      model: "seedance2_5",
      promptVideo: VIDEO,
      mode: "edit",
      promptText: PROMPT,
      duration: "auto",
      references: [{ uri: GARMENT }],
    });
    expect(body).not.toHaveProperty("videoUri");
    expect(body).not.toHaveProperty("ratio");
    expect(body).not.toHaveProperty("contentModeration");
  });

  it("keeps videoUri on aleph2, with keyframes and contentModeration, and no edit-mode fields", () => {
    const body = buildRunwayVideoEditRequest({
      model: "aleph2",
      contract: "aleph2",
      videoUrl: VIDEO,
      promptText: PROMPT,
      keyframes: [{ uri: FRAME, seconds: 3.5 }],
    });
    expect(body).toEqual({
      model: "aleph2",
      videoUri: VIDEO,
      promptText: PROMPT,
      keyframes: [{ uri: FRAME, seconds: 3.5 }],
      contentModeration: { publicFigureThreshold: "low" },
    });
    expect(body).not.toHaveProperty("promptVideo");
    expect(body).not.toHaveProperty("mode");
    expect(body).not.toHaveProperty("duration");
    expect(body).not.toHaveProperty("ratio");
    expect(body).not.toHaveProperty("references");
  });

  it("keeps videoUri on gemini_omni_flash and gemini_omni_flash_1.1", () => {
    for (const model of ["gemini_omni_flash", "gemini_omni_flash_1.1"] as const) {
      const body = buildRunwayVideoEditRequest({
        model,
        contract: "mode_edit",
        videoUrl: VIDEO,
        promptText: PROMPT,
        references: [{ uri: GARMENT }],
      });
      expect(body).toEqual({
        model,
        videoUri: VIDEO,
        mode: "edit",
        promptText: PROMPT,
        duration: "auto",
        references: [{ uri: GARMENT }],
      });
      expect(body).not.toHaveProperty("promptVideo");
      expect(body).not.toHaveProperty("ratio");
      expect(body).not.toHaveProperty("contentModeration");
    }
  });

  it("omits empty keyframe and reference lists", () => {
    const aleph = buildRunwayVideoEditRequest({
      model: "aleph2",
      contract: "aleph2",
      videoUrl: VIDEO,
      promptText: PROMPT,
      keyframes: [],
    });
    expect(aleph).not.toHaveProperty("keyframes");

    const seed = buildRunwayVideoEditRequest({
      model: "seedance2_5",
      contract: "mode_edit",
      videoUrl: VIDEO,
      promptText: PROMPT,
      references: [],
    });
    expect(seed).not.toHaveProperty("references");
    expect(seed.promptVideo).toBe(VIDEO);
  });
});

describe("the proxy uses the contract builder", () => {
  it("does not inline videoUri on the mode=edit Runway body", () => {
    expect(proxySource).toContain("buildRunwayVideoEditRequest(");
    expect(proxySource).not.toContain('videoUri: videoUrl, mode: "edit"');
    // The Control Center hop stays on the normalized field. CC re-derives the wire body.
    expect(proxySource).toContain("videoUri: videoUrl");
  });
});
