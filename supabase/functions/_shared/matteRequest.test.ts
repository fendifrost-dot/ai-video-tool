import { describe, expect, it } from "vitest";
import {
  buildMatteInput,
  MATTE_MAX_SECONDS,
  matteEstimateUsd,
  matteFrames,
  matteResultUrls,
  matteSourceCheck,
} from "./matteRequest";

describe("matteRequest", () => {
  it("asks for a separate H.264 alpha video of a person with refined edges", () => {
    expect(buildMatteInput("https://x.test/v.mp4")).toEqual({
      video_url: "https://x.test/v.mp4",
      output_codec: "h264",
      refine_foreground_edges: true,
      subject_is_person: true,
    });
  });

  it("counts frames from the source's length and rate, 24 fps when unknown", () => {
    expect(matteFrames(4.004)).toBe(96);
    expect(matteFrames(4.004, 30)).toBe(120);
    expect(matteFrames(0.01, null)).toBe(1);
  });

  it("prices the matte by the 30-frame unit, prorated and rounded up", () => {
    const e = matteEstimateUsd(96);
    expect(e.usd).toBeCloseTo(0.072, 4);
    expect(e.upper).toBeCloseTo(0.09, 4);
    expect(e.text).toContain("96 frames");
    expect(matteEstimateUsd(30)).toMatchObject({ usd: 0.0225, upper: 0.0225 });
  });

  it("refuses what cannot be sent and says why", () => {
    expect(matteSourceCheck({ seconds: 8, isVideo: true })).toEqual({ ok: true });
    expect(matteSourceCheck({ seconds: 8, isVideo: false })).toMatchObject({
      ok: false,
      why: expect.stringContaining("only a video"),
    });
    expect(matteSourceCheck({ seconds: null, isVideo: true })).toMatchObject({
      ok: false,
      why: expect.stringContaining("not known"),
    });
    expect(matteSourceCheck({ seconds: MATTE_MAX_SECONDS + 0.1, isVideo: true })).toMatchObject({
      ok: false,
      why: expect.stringContaining(`${MATTE_MAX_SECONDS} s`),
    });
  });

  it("pulls the https links out of the model's answer in the order given, and nothing else", () => {
    expect(
      matteResultUrls({
        video: [
          { url: "https://a/rgb.mp4" },
          { url: "https://a/alpha.mp4", content_type: "video/mp4" },
        ],
      }),
    ).toEqual(["https://a/rgb.mp4", "https://a/alpha.mp4"]);
    expect(matteResultUrls({ video: { url: "https://a/one.webm" } })).toEqual([
      "https://a/one.webm",
    ]);
    expect(
      matteResultUrls({ video: [{ url: "http://insecure/x.mp4" }, { url: 5 }, null] }),
    ).toEqual([]);
    expect(matteResultUrls(null)).toEqual([]);
    expect(matteResultUrls({})).toEqual([]);
  });
});
