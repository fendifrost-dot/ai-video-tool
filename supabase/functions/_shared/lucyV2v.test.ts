import { describe, expect, it } from "vitest";
import {
  buildGarmentEditPrompt,
  buildLucyV2vBody,
  classifyLucyTransport,
  extractLucyVideoUrl,
  isLucyBatchModel,
  LUCY_BATCH_MODELS,
  LUCY_REALTIME_MODELS,
} from "./lucyV2v";

describe("classifyLucyTransport", () => {
  it("classifies the batch lucy-edit / lucy-restyle family as batch", () => {
    for (const m of LUCY_BATCH_MODELS) expect(classifyLucyTransport(m)).toBe("batch");
    expect(classifyLucyTransport("decart/lucy-edit/pro")).toBe("batch");
    // Unhard-coded lucy-edit variant still resolves to batch (family prefix).
    expect(classifyLucyTransport("decart/lucy-edit/turbo")).toBe("batch");
  });

  it("classifies the realtime VTON slugs (and any /realtime suffix) as realtime", () => {
    for (const m of LUCY_REALTIME_MODELS) expect(classifyLucyTransport(m)).toBe("realtime");
    expect(classifyLucyTransport("decart/lucy2-vton/realtime")).toBe("realtime");
    expect(classifyLucyTransport("decart/lucy-2-5/realtime")).toBe("realtime");
    expect(classifyLucyTransport("decart/some-future-model/realtime")).toBe("realtime");
  });

  it("returns unknown for non-Lucy / ambiguous ids", () => {
    expect(classifyLucyTransport("fal-ai/kling/v1-5/kolors-virtual-try-on")).toBe("unknown");
    expect(classifyLucyTransport("decart/lucy-i2v")).toBe("unknown");
  });

  it("isLucyBatchModel mirrors the batch classification", () => {
    expect(isLucyBatchModel("decart/lucy-edit/fast")).toBe(true);
    expect(isLucyBatchModel("decart/lucy2-vton/realtime")).toBe(false);
    expect(isLucyBatchModel("fal-ai/idm-vton")).toBe(false);
  });
});

describe("buildLucyV2vBody", () => {
  const args = {
    videoUrl: "https://clips/short.mp4",
    prompt: "Change only the person's jacket/top to a black SL bomber.",
  };

  it("builds a CC fal-run body with the exact LucyEdit schema keys", () => {
    const body = buildLucyV2vBody("decart/lucy-edit/fast", args);
    expect(body.action).toBe("fal-run");
    expect(body.model).toBe("decart/lucy-edit/fast");
    const input = body.input as Record<string, unknown>;
    expect(input.prompt).toBe(args.prompt);
    expect(input.video_url).toBe(args.videoUrl);
    // fast omits the resolution enum in-schema.
    expect(input.resolution).toBeUndefined();
    expect(input.seed).toBeUndefined();
  });

  it("adds resolution only for pro / restyle", () => {
    expect((buildLucyV2vBody("decart/lucy-edit/pro", args).input as Record<string, unknown>).resolution)
      .toBe("720p");
    expect((buildLucyV2vBody("decart/lucy-restyle", args).input as Record<string, unknown>).resolution)
      .toBe("720p");
    expect((buildLucyV2vBody("decart/lucy-edit/dev", args).input as Record<string, unknown>).resolution)
      .toBeUndefined();
  });

  it("adds seed only for restyle when provided", () => {
    const body = buildLucyV2vBody("decart/lucy-restyle", { ...args, seed: 42 });
    expect((body.input as Record<string, unknown>).seed).toBe(42);
    // pro ignores seed (not in its schema).
    expect((buildLucyV2vBody("decart/lucy-edit/pro", { ...args, seed: 42 }).input as Record<string, unknown>).seed)
      .toBeUndefined();
  });

  it("clamps an over-long prompt to the 1500-char schema cap", () => {
    const body = buildLucyV2vBody("decart/lucy-edit/fast", { ...args, prompt: "x".repeat(2000) });
    expect(String((body.input as Record<string, unknown>).prompt).length).toBe(1500);
  });

  it("REFUSES a realtime slug (needs the WebRTC wrapper, not submit/poll)", () => {
    expect(() => buildLucyV2vBody("decart/lucy2-vton/realtime", args)).toThrow(/REALTIME/);
    expect(() => buildLucyV2vBody("decart/lucy-2-5/realtime", args)).toThrow(/REALTIME/);
  });

  it("refuses an unknown model id rather than guessing a shape", () => {
    expect(() => buildLucyV2vBody("decart/lucy-i2v", args)).toThrow(/not a known batch/);
  });

  it("rejects a missing/insecure video url or empty prompt", () => {
    expect(() => buildLucyV2vBody("decart/lucy-edit/fast", { ...args, videoUrl: "" })).toThrow();
    expect(() => buildLucyV2vBody("decart/lucy-edit/fast", { ...args, videoUrl: "http://x.mp4" })).toThrow();
    expect(() => buildLucyV2vBody("decart/lucy-edit/fast", { ...args, prompt: "  " })).toThrow();
  });
});

describe("extractLucyVideoUrl", () => {
  it("reads the documented {video:{url}} shape + common fallbacks", () => {
    expect(extractLucyVideoUrl({ video: { url: "https://a.mp4" } })).toBe("https://a.mp4");
    expect(extractLucyVideoUrl({ video_url: "https://b.mp4" })).toBe("https://b.mp4");
    expect(extractLucyVideoUrl({ url: "https://c.mp4" })).toBe("https://c.mp4");
    expect(extractLucyVideoUrl({ output: { url: "https://d.mp4" } })).toBe("https://d.mp4");
    expect(extractLucyVideoUrl({ videos: [{ url: "https://e.mp4" }] })).toBe("https://e.mp4");
  });
  it("returns null on nothing usable / insecure", () => {
    expect(extractLucyVideoUrl({})).toBeNull();
    expect(extractLucyVideoUrl({ video: { url: "http://insecure.mp4" } })).toBeNull();
  });
});

describe("buildGarmentEditPrompt", () => {
  it("names the garment + region and pins identity/scene/motion", () => {
    const p = buildGarmentEditPrompt("SL bomber", "upper_body");
    expect(p).toMatch(/SL bomber/);
    expect(p).toMatch(/jacket\/top/);
    expect(p).toMatch(/same person/);
    expect(p).toMatch(/background unchanged/);
  });
  it("switches region wording for lower-body items", () => {
    expect(buildGarmentEditPrompt("wide trousers", "lower_body")).toMatch(/lower-body garment/);
  });
  it("tolerates an empty label", () => {
    expect(buildGarmentEditPrompt("", "upper_body")).toMatch(/garment/);
  });
});
