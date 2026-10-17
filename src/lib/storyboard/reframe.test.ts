import { describe, expect, it } from "vitest";
import { BLANK_OVERRIDE, isSceneEdited, unlockedForGeneration, type BoxOverride, type StoryboardBox } from "./boxes";
import { IDENTITY_REFRAME, isIdentityReframe, normalizeReframe, parseReframe, reframeRect, reframeStyle } from "./reframe";

const FRAME_9_16 = { width: 1080, height: 1920 };

describe("a shot's reframe", () => {
  it("is read loosely and kept in range; at a zoom of 1 it states nothing", () => {
    expect(normalizeReframe(null)).toEqual(IDENTITY_REFRAME);
    expect(normalizeReframe({ scale: "2", x: 0.2 })).toEqual({ scale: 1, x: 0.2, y: 0.5 });
    expect(normalizeReframe({ scale: 9, x: -1, y: 4 })).toEqual({ scale: 3, x: 0, y: 1 });
    expect(normalizeReframe({ scale: 0.5, x: Number.NaN, y: 0.123456 })).toEqual({ scale: 1, x: 0.5, y: 0.1235 });
    expect(parseReframe({ scale: 1, x: 0.1, y: 0.9 })).toBeNull();
    expect(parseReframe({ scale: 1.25, x: 0.5, y: 0.3 })).toEqual({ scale: 1.25, x: 0.5, y: 0.3 });
    expect(isIdentityReframe(undefined)).toBe(true);
    expect(isIdentityReframe({ scale: 1.05 })).toBe(false);
  });

  it("identity keeps the whole source, whatever the frame and the centre", () => {
    expect(reframeRect(1080, 1920, null)).toEqual({ sx: 0, sy: 0, sw: 1080, sh: 1920 });
    expect(reframeRect(1920, 1080, { scale: 1, x: 0, y: 1 }, FRAME_9_16)).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080 });
    expect(reframeStyle(1080, 1920, { scale: 1, x: 0.2, y: 0.2 }, FRAME_9_16)).toBeNull();
  });

  it("on footage of the frame's shape, a zoom is a crop of that shape about (x, y)", () => {
    // 2× about the middle: the middle half on each side
    expect(reframeRect(1080, 1920, { scale: 2, x: 0.5, y: 0.5 }, FRAME_9_16)).toEqual({ sx: 270, sy: 480, sw: 540, sh: 960 });
    // 2× about the upper body: the pants go out of the bottom of the frame
    expect(reframeRect(1080, 1920, { scale: 2, x: 0.5, y: 0.3 }, FRAME_9_16)).toMatchObject({ sy: 96, sh: 960 });
    // a smaller copy of the same footage gives the same rect, scaled
    expect(reframeRect(540, 960, { scale: 2, x: 0.5, y: 0.5 }, FRAME_9_16)).toEqual({ sx: 135, sy: 240, sw: 270, sh: 480 });
  });

  it("is clamped: the rect never leaves the source, so a reframe shows nothing the footage does not have", () => {
    expect(reframeRect(1080, 1920, { scale: 2, x: 0, y: 0 }, FRAME_9_16)).toEqual({ sx: 0, sy: 0, sw: 540, sh: 960 });
    expect(reframeRect(1080, 1920, { scale: 2, x: 1, y: 1 }, FRAME_9_16)).toEqual({ sx: 540, sy: 960, sw: 540, sh: 960 });
    expect(reframeRect(1080, 1920, { scale: 1.5, x: 0.95, y: 0.02 }, FRAME_9_16)).toEqual({ sx: 360, sy: 0, sw: 720, sh: 1280 });
    // out-of-range values are held to the range first
    expect(reframeRect(1080, 1920, { scale: 10, x: 2, y: -3 }, FRAME_9_16)).toEqual({ sx: 720, sy: 0, sw: 360, sh: 640 });
    for (const x of [0, 0.1, 0.5, 0.9, 1]) {
      for (const scale of [1, 1.3, 2, 3]) {
        const r = reframeRect(1920, 1080, { scale, x, y: x }, FRAME_9_16);
        expect(r.sx).toBeGreaterThanOrEqual(0);
        expect(r.sy).toBeGreaterThanOrEqual(0);
        expect(r.sx + r.sw).toBeLessThanOrEqual(1920 + 1e-9);
        expect(r.sy + r.sh).toBeLessThanOrEqual(1080 + 1e-9);
      }
    }
  });

  it("on footage of another shape, a zoom fills the bars first, then crops", () => {
    // wide footage in a vertical frame: fitted whole it is 1080 wide; at 1.5× only the frame's 1080 of its 1620 show,
    // and it still does not reach the top and bottom — nothing is cut off vertically
    expect(reframeRect(1920, 1080, { scale: 1.5, x: 0.5, y: 0.5 }, FRAME_9_16)).toEqual({ sx: 320, sy: 0, sw: 1280, sh: 1080 });
    // vertical footage in a wide frame, the other way round
    expect(reframeRect(1080, 1920, { scale: 2, x: 0.5, y: 0.5 }, { width: 1920, height: 1080 })).toEqual({ sx: 0, sy: 480, sw: 1080, sh: 960 });
  });

  it("the player's placement shows exactly the rect, fitted whole, centred in the frame", () => {
    // frame-shaped footage: the whole source at twice the frame, its middle quarter in view
    expect(reframeStyle(1080, 1920, { scale: 2, x: 0.5, y: 0.5 }, FRAME_9_16)).toEqual({ left: -50, top: -50, width: 200, height: 200 });
    // the playback copy is smaller than the original: the same placement (percentages of the frame)
    expect(reframeStyle(540, 960, { scale: 2, x: 0, y: 1 }, FRAME_9_16)).toEqual({ left: 0, top: -100, width: 200, height: 200 });
    // wide footage at 1.5×: as wide as the frame on the rect, bars above and below as the rect is fitted whole
    const s = reframeStyle(1920, 1080, { scale: 1.5, x: 0.5, y: 0.5 }, FRAME_9_16)!;
    const k = 1080 / 1280;
    expect(s.width).toBeCloseTo(((1920 * k) / 1080) * 100, 9);
    expect(s.left).toBeCloseTo(((-320 * k) / 1080) * 100, 9);
    expect(s.top).toBeCloseTo((((1920 - 1080 * k) / 2) / 1920) * 100, 9);
    expect(s.height).toBeCloseTo(((1080 * k) / 1920) * 100, 9);
    // the rect's own edges land on the frame's edges (or inside it): the frame clips only what the rect crops
    const leftOfRect = s.left + ((320 * k) / 1080) * 100;
    expect(leftOfRect).toBeCloseTo(0, 9);
    expect(reframeStyle(0, 0, { scale: 2 }, FRAME_9_16)).toBeNull();
  });
});

describe("a reframe is not a scene edit", () => {
  const framed = { ...BLANK_OVERRIDE, updatedAt: "t", reframe: { scale: 1.4, x: 0.5, y: 0.3 } } as BoxOverride;
  it("a reframe alone does not count as an edit of the scene", () => {
    expect(isSceneEdited(framed)).toBe(false);
    expect(isSceneEdited(null)).toBe(false);
  });
  it("an edit of the scene still counts, with or without a reframe", () => {
    expect(isSceneEdited({ ...framed, direction: "him at the pillar" })).toBe(true);
    expect(isSceneEdited({ ...BLANK_OVERRIDE, notes: "keep" })).toBe(true);
  });
  it("whole-board generation still reaches a box that is only reframed", () => {
    const box = (id: string, override: BoxOverride | null) => ({ id, locked: false, override }) as unknown as StoryboardBox;
    const ids = unlockedForGeneration([box("a", framed), box("b", { ...framed, direction: "x" }), box("c", null)], new Set()).map((b) => b.id);
    expect(ids).toEqual(["a", "c"]);
  });
});
