import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAPABILITIES,
  pickEngine,
  canRenderVideo,
  type ProviderCapabilities,
} from "./capabilities";

describe("pickEngine", () => {
  it("prefers a non-manual generator that fits the clip length", () => {
    // 6s b-roll fits runway (<=10s) which is first in preference order.
    expect(pickEngine(DEFAULT_CAPABILITIES, "broll", 6)).toBe("runway");
  });

  it("skips engines whose max clip length is exceeded", () => {
    // 9s generated: runway is stills-incapable? runway supports generated and 10s.
    // veo caps at 8s, so a 9s generated clip should not pick veo over runway.
    const picked = pickEngine(DEFAULT_CAPABILITIES, "generated", 9);
    expect(picked).toBe("runway");
  });

  it("falls back to manual when no generator fits", () => {
    const caps: ProviderCapabilities = {
      hasSourceFootage: true,
      engines: [
        { engine: "veo", kinds: ["broll"], video: true, maxClipSeconds: 5, note: "" },
        { engine: "manual", kinds: ["broll"], video: true, maxClipSeconds: null, note: "" },
      ],
    };
    // 20s exceeds veo's 5s cap → only manual fits.
    expect(pickEngine(caps, "broll", 20)).toBe("manual");
  });

  it("returns null when nothing supports the kind", () => {
    const caps: ProviderCapabilities = {
      hasSourceFootage: false,
      engines: [
        { engine: "grok", kinds: ["generated"], video: false, maxClipSeconds: null, note: "" },
      ],
    };
    expect(pickEngine(caps, "performance", 4)).toBeNull();
  });

  it("treats null maxClipSeconds as unbounded", () => {
    // At 3600s runway (10s) and veo (8s) are excluded; grok (unbounded) fits.
    expect(pickEngine(DEFAULT_CAPABILITIES, "generated", 3600)).toBe("grok");
  });
});

describe("canRenderVideo", () => {
  it("is true when a video engine supports the kind", () => {
    expect(canRenderVideo(DEFAULT_CAPABILITIES, "broll")).toBe(true);
  });

  it("is false when only stills engines support the kind", () => {
    const caps: ProviderCapabilities = {
      hasSourceFootage: false,
      engines: [
        { engine: "grok", kinds: ["generated"], video: false, maxClipSeconds: null, note: "" },
      ],
    };
    expect(canRenderVideo(caps, "generated")).toBe(false);
  });
});
