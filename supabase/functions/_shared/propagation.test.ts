import { describe, expect, it } from "vitest";
import {
  buildPropagationBody,
  engineBlockReason,
  engineNeedsFalModel,
  extractPropagatedImageUrl,
  isEngineActive,
  propagatedFrameName,
  propagatedFramePrefix,
  resolvePropagationEngine,
  type EnvGet,
} from "./propagation";

function env(map: Record<string, string>): EnvGet {
  return (k: string) => map[k];
}

describe("resolvePropagationEngine", () => {
  it("is disabled when nothing is set (reversible: no behaviour change)", () => {
    const e = resolvePropagationEngine(env({}));
    expect(e.mode).toBe("disabled");
    expect(isEngineActive(e)).toBe(false);
  });

  it("defaults to fal-flow when a model is present", () => {
    const e = resolvePropagationEngine(env({ PROPAGATION_FAL_MODEL: "fal-ai/some-flow" }));
    expect(e.mode).toBe("fal-flow");
    expect(e.falModel).toBe("fal-ai/some-flow");
    expect(isEngineActive(e)).toBe(true);
  });

  it("honors an explicit engine mode", () => {
    const e = resolvePropagationEngine(env({ WARDROBE_PROP_ENGINE: "nearest-keyframe" }));
    expect(e.mode).toBe("nearest-keyframe");
    expect(isEngineActive(e)).toBe(true); // diagnostic needs no model
  });

  it("ignores an unknown mode and falls back", () => {
    const e = resolvePropagationEngine(env({ WARDROBE_PROP_ENGINE: "teleport" }));
    expect(e.mode).toBe("disabled");
  });

  it("a fal mode without a model is inactive", () => {
    const e = resolvePropagationEngine(env({ WARDROBE_PROP_ENGINE: "fal-flow" }));
    expect(e.mode).toBe("fal-flow");
    expect(isEngineActive(e)).toBe(false);
  });
});

describe("engineBlockReason", () => {
  it("explains a disabled engine and what to set", () => {
    const r = engineBlockReason({ mode: "disabled" });
    expect(r).toContain("WARDROBE_PROP_ENGINE");
    expect(r).toContain("PROPAGATION_FAL_MODEL");
  });

  it("explains a fal mode missing its model", () => {
    const r = engineBlockReason({ mode: "fal-flow", falModel: null });
    expect(r).toContain("PROPAGATION_FAL_MODEL");
  });

  it("returns null when the engine can run", () => {
    expect(engineBlockReason({ mode: "fal-flow", falModel: "fal-ai/x" })).toBeNull();
    expect(engineBlockReason({ mode: "nearest-keyframe" })).toBeNull();
  });
});

describe("engineNeedsFalModel", () => {
  it("is true only for fal-* modes", () => {
    expect(engineNeedsFalModel("fal-flow")).toBe(true);
    expect(engineNeedsFalModel("fal-v2v")).toBe(true);
    expect(engineNeedsFalModel("nearest-keyframe")).toBe(false);
    expect(engineNeedsFalModel("disabled")).toBe(false);
  });
});

describe("buildPropagationBody", () => {
  const base = {
    originalFrameUrl: "https://frames/000005.jpg",
    prevKeyframeUrl: "https://kf/000000.png",
    nextKeyframeUrl: "https://kf/000012.png",
    t: 0.25,
    garmentDescription: "SL bomber",
  };

  it("shapes a fal-run with original frame + bracketing keyframes", () => {
    const body = buildPropagationBody({
      ...base,
      engine: { mode: "fal-flow", falModel: "fal-ai/flow" },
    });
    expect(body.action).toBe("fal-run");
    expect(body.model).toBe("fal-ai/flow");
    const input = body.input as Record<string, unknown>;
    expect(input.frame_url).toBe(base.originalFrameUrl);
    expect(input.source_keyframe_url).toBe(base.prevKeyframeUrl);
    expect(input.target_keyframe_url).toBe(base.nextKeyframeUrl);
    expect(input.blend).toBeCloseTo(0.25);
  });

  it("falls back target keyframe to prev when next is absent", () => {
    const body = buildPropagationBody({
      ...base,
      nextKeyframeUrl: null,
      engine: { mode: "fal-flow", falModel: "fal-ai/flow" },
    });
    const input = body.input as Record<string, unknown>;
    expect(input.target_keyframe_url).toBe(base.prevKeyframeUrl);
  });

  it("clamps blend into 0..1", () => {
    const hi = buildPropagationBody({ ...base, t: 5, engine: { mode: "fal-flow", falModel: "m" } });
    expect((hi.input as Record<string, unknown>).blend).toBe(1);
    const lo = buildPropagationBody({
      ...base,
      t: -3,
      engine: { mode: "fal-flow", falModel: "m" },
    });
    expect((lo.input as Record<string, unknown>).blend).toBe(0);
  });

  it("throws for non-engine modes (caller handles them directly)", () => {
    expect(() => buildPropagationBody({ ...base, engine: { mode: "nearest-keyframe" } })).toThrow();
    expect(() => buildPropagationBody({ ...base, engine: { mode: "disabled" } })).toThrow();
  });

  it("throws when a fal mode has no model", () => {
    expect(() => buildPropagationBody({ ...base, engine: { mode: "fal-flow" } })).toThrow();
  });

  it("throws on missing URLs", () => {
    expect(() =>
      buildPropagationBody({
        ...base,
        originalFrameUrl: "",
        engine: { mode: "fal-flow", falModel: "m" },
      }),
    ).toThrow();
  });
});

describe("extractPropagatedImageUrl", () => {
  it("reads common shapes", () => {
    expect(extractPropagatedImageUrl({ image: { url: "https://a.png" } })).toBe("https://a.png");
    expect(extractPropagatedImageUrl({ image_url: "https://b.png" })).toBe("https://b.png");
    expect(extractPropagatedImageUrl({ warped_url: "https://c.png" })).toBe("https://c.png");
    expect(extractPropagatedImageUrl({ images: [{ url: "https://d.png" }] })).toBe("https://d.png");
  });
  it("rejects insecure / missing", () => {
    expect(extractPropagatedImageUrl({})).toBeNull();
    expect(extractPropagatedImageUrl({ image_url: "http://x.png" })).toBeNull();
  });
});

describe("propagated frame naming", () => {
  it("zero-pads with a true extension (§6 #3)", () => {
    expect(propagatedFrameName(0)).toBe("000000.jpg");
    expect(propagatedFrameName(42, "png")).toBe("000042.png");
    expect(propagatedFrameName(7, "webp")).toBe("000007.webp");
  });
  it("prefix nests under user/asset/session", () => {
    expect(propagatedFramePrefix("u1", "a1", "s1")).toBe("u1/a1/propagated/s1/");
  });
});
