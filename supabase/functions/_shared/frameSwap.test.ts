import { describe, expect, it } from "vitest";
import {
  buildFrameSwapBody,
  extractSwapImageUrl,
  falVtonFamily,
  shapeFalInput,
  swappedFrameName,
  swappedFramePrefix,
} from "./frameSwap";

const base = {
  humanImageUrl: "https://frames/000001.jpg",
  garmentImageUrl: "https://garment/ref.png",
  category: "upper_body",
  garmentDescription: "SL bomber",
};

describe("buildFrameSwapBody", () => {
  it("uses the vton-frame action by default (no new CC allowlist)", () => {
    const body = buildFrameSwapBody({ ...base, engine: {} });
    expect(body.action).toBe("vton-frame");
    expect(body.human_image_url).toBe(base.humanImageUrl);
    expect(body.garment_image_url).toBe(base.garmentImageUrl);
    expect(body.model).toBe("idm-vton");
  });

  it("honors the vton engine choice", () => {
    const body = buildFrameSwapBody({ ...base, engine: { vtonModel: "cat-vton" } });
    expect(body.action).toBe("vton-frame");
    expect(body.model).toBe("cat-vton");
  });

  it("switches to fal-run when a model id is set (IDM-VTON generic shape)", () => {
    const body = buildFrameSwapBody({ ...base, engine: { falModel: "fal-ai/idm-vton" } });
    expect(body.action).toBe("fal-run");
    expect(body.model).toBe("fal-ai/idm-vton");
    const input = body.input as Record<string, unknown>;
    expect(input.human_image_url).toBe(base.humanImageUrl);
    expect(input.garment_image_url).toBe(base.garmentImageUrl);
    expect(input.category).toBe("upper_body");
    expect(input.description).toBe(base.garmentDescription);
  });

  it("Lane B: shapes Kolors input to its exact 2-URL schema (no extra keys)", () => {
    const body = buildFrameSwapBody({
      ...base,
      engine: { falModel: "fal-ai/kling/v1-5/kolors-virtual-try-on" },
    });
    expect(body.action).toBe("fal-run");
    expect(body.model).toBe("fal-ai/kling/v1-5/kolors-virtual-try-on");
    const input = body.input as Record<string, unknown>;
    expect(input).toEqual({
      human_image_url: base.humanImageUrl,
      garment_image_url: base.garmentImageUrl,
    });
  });

  it("Lane B: shapes FASHN input with model_image/garment_image + mapped category", () => {
    const body = buildFrameSwapBody({
      ...base,
      engine: { falModel: "fal-ai/fashn/tryon/v1.5" },
    });
    expect(body.action).toBe("fal-run");
    const input = body.input as Record<string, unknown>;
    expect(input.model_image).toBe(base.humanImageUrl);
    expect(input.garment_image).toBe(base.garmentImageUrl);
    expect(input.category).toBe("tops"); // upper_body → tops
    expect(input.human_image_url).toBeUndefined();
  });

  it("Lane B: reference-lock holds across the Kolors keyframe-mapper path too", () => {
    const f1 = buildFrameSwapBody({
      ...base,
      humanImageUrl: "https://frames/1.jpg",
      engine: { falModel: "fal-ai/kling/v1-5/kolors-virtual-try-on" },
    });
    const f2 = buildFrameSwapBody({
      ...base,
      humanImageUrl: "https://frames/2.jpg",
      engine: { falModel: "fal-ai/kling/v1-5/kolors-virtual-try-on" },
    });
    const i1 = f1.input as Record<string, unknown>;
    const i2 = f2.input as Record<string, unknown>;
    expect(i1.garment_image_url).toBe(i2.garment_image_url);
    expect(i1.human_image_url).not.toBe(i2.human_image_url);
  });

  it("reference-lock: the SAME garment URL rides every frame's request", () => {
    const f1 = buildFrameSwapBody({ ...base, humanImageUrl: "https://frames/1.jpg", engine: {} });
    const f2 = buildFrameSwapBody({ ...base, humanImageUrl: "https://frames/2.jpg", engine: {} });
    expect(f1.garment_image_url).toBe(f2.garment_image_url);
    expect(f1.human_image_url).not.toBe(f2.human_image_url);
  });

  it("rejects a missing human or garment URL", () => {
    expect(() => buildFrameSwapBody({ ...base, humanImageUrl: "", engine: {} })).toThrow();
    expect(() => buildFrameSwapBody({ ...base, garmentImageUrl: "", engine: {} })).toThrow();
  });
});

describe("falVtonFamily", () => {
  it("classifies the Lane B candidates + falls back to generic", () => {
    expect(falVtonFamily("fal-ai/kling/v1-5/kolors-virtual-try-on")).toBe("kolors");
    expect(falVtonFamily("fal-ai/fashn/tryon/v1.6")).toBe("fashn");
    expect(falVtonFamily("fal-ai/fashn/v1.5")).toBe("fashn");
    expect(falVtonFamily("fal-ai/idm-vton")).toBe("idm-generic");
    expect(falVtonFamily("fal-ai/leffa/virtual-tryon")).toBe("idm-generic");
  });
});

describe("shapeFalInput category mapping (FASHN)", () => {
  const a = { humanImageUrl: "https://h", garmentImageUrl: "https://g", garmentDescription: "d" };
  it("maps *_body categories to FASHN's vocabulary", () => {
    expect(shapeFalInput("fal-ai/fashn/tryon/v1.5", { ...a, category: "lower_body" }).category).toBe("bottoms");
    expect(shapeFalInput("fal-ai/fashn/tryon/v1.5", { ...a, category: "upper_body" }).category).toBe("tops");
    expect(shapeFalInput("fal-ai/fashn/tryon/v1.5", { ...a, category: "weird" }).category).toBe("auto");
  });
});

describe("extractSwapImageUrl", () => {
  it("reads common result shapes (incl. Kolors {image:{url}} + FASHN {images:[]})", () => {
    expect(extractSwapImageUrl({ image: { url: "https://a.png" } })).toBe("https://a.png");
    expect(extractSwapImageUrl({ image_url: "https://b.png" })).toBe("https://b.png");
    expect(extractSwapImageUrl({ images: [{ url: "https://c.png" }] })).toBe("https://c.png");
  });
  it("returns null when nothing usable / insecure", () => {
    expect(extractSwapImageUrl({})).toBeNull();
    expect(extractSwapImageUrl({ image_url: "http://insecure.png" })).toBeNull();
  });
});

describe("swapped frame naming", () => {
  it("zero-pads to 6 digits", () => {
    expect(swappedFrameName(0)).toBe("000000.jpg");
    expect(swappedFrameName(42)).toBe("000042.jpg");
  });
  it("prefix nests under user/asset/session", () => {
    expect(swappedFramePrefix("u1", "a1", "s1")).toBe("u1/a1/swapped/s1/");
  });
});
