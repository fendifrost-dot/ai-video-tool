import { describe, expect, it } from "vitest";
import { parseShotSpec, type ShotSpecInput } from "@/lib/treatment/shotSpec";
import { derivePrevisVisual } from "./previsVisual";

function spec(overrides: Partial<ShotSpecInput> = {}) {
  return parseShotSpec({
    id: "c001",
    purpose: "test shot",
    timeline: { start: 0, end: 4 },
    ...overrides,
  });
}

describe("derivePrevisVisual", () => {
  it("is deterministic — same spec yields the same frame", () => {
    const a = derivePrevisVisual(spec({ environment: { description: "rooftop at dusk" } }));
    const b = derivePrevisVisual(spec({ environment: { description: "rooftop at dusk" } }));
    expect(a).toEqual(b);
  });

  it("gives different palettes to different worlds", () => {
    const a = derivePrevisVisual(spec({ id: "a", environment: { description: "neon alley" } }));
    const b = derivePrevisVisual(spec({ id: "b", environment: { description: "sunlit beach" } }));
    expect(a.background).not.toBe(b.background);
  });

  it("scales the subject by framing — closer framing fills more of the frame", () => {
    const wide = derivePrevisVisual(spec({ framing: "extreme_wide" }));
    const close = derivePrevisVisual(spec({ framing: "close_up" }));
    expect(close.subjectScale).toBeGreaterThan(wide.subjectScale);
  });

  it("maps camera motion to a named animation", () => {
    expect(derivePrevisVisual(spec({ cameraMotion: { type: "static" } })).motion).toBeNull();
    expect(derivePrevisVisual(spec({ cameraMotion: { type: "dolly" } })).motion).toBe("push");
    expect(derivePrevisVisual(spec({ cameraMotion: { type: "orbit" } })).motion).toBe("orbit");
    expect(derivePrevisVisual(spec({ cameraMotion: { type: "handheld" } })).motion).toBe("shake");
  });

  it("applies a dutch tilt only for the dutch angle", () => {
    expect(derivePrevisVisual(spec({ cameraAngle: "dutch" })).dutchDeg).toBeGreaterThan(0);
    expect(derivePrevisVisual(spec({ cameraAngle: "eye_level" })).dutchDeg).toBe(0);
  });
});
