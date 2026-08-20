import { describe, expect, it } from "vitest";
import {
  buildPresetGuides,
  classifyCoverAspect,
  containRect,
  describeFlightPath,
  pathLength,
  pointerToNorm,
  suggestPathKind,
  tangentAt,
  turningHint,
  validateFlightGuides,
} from "./index";

describe("classifyCoverAspect", () => {
  it("treats 1:1 as square", () => {
    expect(classifyCoverAspect(1080, 1080)).toBe("square");
  });

  it("treats landscape as wide", () => {
    expect(classifyCoverAspect(1920, 1080)).toBe("wide");
  });

  it("treats portrait as tall", () => {
    expect(classifyCoverAspect(1080, 1920)).toBe("tall");
  });

  it("falls back to square on invalid sizes", () => {
    expect(classifyCoverAspect(0, 100)).toBe("square");
  });
});

describe("suggestPathKind", () => {
  it("suggests a circle loop for square covers", () => {
    expect(suggestPathKind("square")).toBe("circle");
  });

  it("suggests a horizontal path for wide covers", () => {
    expect(suggestPathKind("wide")).toBe("horizontal");
  });
});

describe("preset guides", () => {
  it("builds a continuous horizontal path with 3 viewing arrows", () => {
    const guides = buildPresetGuides("horizontal");
    expect(guides.path.length).toBeGreaterThan(8);
    expect(pathLength(guides.path)).toBeGreaterThan(0.5);
    expect(guides.arrows).toHaveLength(3);
  });

  it("builds a closed circle loop for square covers", () => {
    const guides = buildPresetGuides("circle");
    const start = guides.path[0];
    const end = guides.path[guides.path.length - 1];
    expect(Math.abs(start.x - end.x)).toBeLessThan(0.02);
    expect(Math.abs(start.y - end.y)).toBeLessThan(0.02);
    expect(guides.arrows).toHaveLength(3);
  });

  it("points the first horizontal arrow roughly to the right", () => {
    const guides = buildPresetGuides("horizontal");
    const angle = tangentAt(guides.path, 0.08);
    expect(Math.abs(angle)).toBeLessThan(0.4);
  });
});

describe("describeFlightPath", () => {
  it("names start, curve, and endpoint from geometry", () => {
    const { path } = buildPresetGuides("horizontal");
    const text = describeFlightPath(path);
    expect(text).toMatch(/Start at the /);
    expect(text).toMatch(/Endpoint at the /);
    expect(text).toContain("→");
  });

  it("inserts named key elements when provided", () => {
    const { path } = buildPresetGuides("diagonal");
    const text = describeFlightPath(path, { keyElements: "the title type and the face" });
    expect(text).toContain("the title type and the face");
  });

  it("returns empty string for an incomplete path", () => {
    expect(describeFlightPath([{ x: 0.5, y: 0.5 }])).toBe("");
  });
});

describe("turningHint", () => {
  it("labels a clockwise screen-space loop", () => {
    const { path } = buildPresetGuides("circle");
    expect(turningHint(path)).toBe("clockwise curve");
  });

  it("labels a straight line", () => {
    expect(
      turningHint([
        { x: 0.1, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 0.9, y: 0.5 },
      ]),
    ).toBe("straight");
  });
});

describe("validateFlightGuides", () => {
  it("accepts a preset path with 3 arrows", () => {
    const result = validateFlightGuides(buildPresetGuides("horizontal"));
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects an empty path", () => {
    const result = validateFlightGuides({ path: [], arrows: [] });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /red flight line/i.test(i))).toBe(true);
  });

  it("warns when there are fewer than 2 arrows", () => {
    const { path } = buildPresetGuides("horizontal");
    const result = validateFlightGuides({ path, arrows: [] });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /white arrows/i.test(i))).toBe(true);
  });

  it("warns when there are more than 3 arrows", () => {
    const { path, arrows } = buildPresetGuides("horizontal");
    const extra = { ...arrows[0], x: 0.2 };
    const result = validateFlightGuides({ path, arrows: [...arrows, extra] });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => /at most 3/i.test(i))).toBe(true);
  });
});

describe("containRect / pointerToNorm", () => {
  it("letterboxes a square image in a wide box", () => {
    const r = containRect(200, 100, 100, 100);
    expect(r.w).toBeCloseTo(100);
    expect(r.h).toBeCloseTo(100);
    expect(r.x).toBeCloseTo(50);
    expect(r.y).toBeCloseTo(0);
  });

  it("maps a pointer on the image to normalized coords", () => {
    const box = {
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    const p = pointerToNorm(50, 50, box as DOMRect, 100, 100);
    expect(p).toEqual({ x: 0, y: 0.5 });
  });

  it("returns null when the pointer is in the letterbox", () => {
    const box = {
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    expect(pointerToNorm(10, 50, box as DOMRect, 100, 100)).toBeNull();
  });
});
