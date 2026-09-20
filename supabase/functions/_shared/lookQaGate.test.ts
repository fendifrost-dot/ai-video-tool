import { describe, expect, it } from "vitest";
import { evaluateLookQa, ASPECT_TOLERANCE } from "./lookQaGate.ts";
import { readImageDimensions } from "./imageDimensions.ts";

/** Build a minimal valid PNG header (signature + IHDR) carrying real width/height
 *  so the fixtures exercise the SAME dimension reader the edge function uses. */
function pngFixture(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  // PNG signature
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR chunk length (13) + "IHDR"
  b.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  // width @16, height @20 (big-endian u32)
  const dv = new DataView(b.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return b;
}

describe("evaluateLookQa — aspect", () => {
  it("passes a true 9:16 look (fixture decoded via readImageDimensions)", () => {
    const dims = readImageDimensions(pngFixture(1080, 1920))!;
    expect(dims.width).toBe(1080);
    expect(dims.height).toBe(1920);
    const qa = evaluateLookQa({ width: dims.width, height: dims.height });
    expect(qa.ok).toBe(true);
  });

  it("fails a square (1:1) output as aspect", () => {
    const dims = readImageDimensions(pngFixture(1024, 1024))!;
    const qa = evaluateLookQa({ width: dims.width, height: dims.height });
    expect(qa.ok).toBe(false);
    if (!qa.ok) expect(qa.reasons).toContain("aspect");
  });

  it("fails a landscape (16:9) output as aspect", () => {
    const qa = evaluateLookQa({ width: 1920, height: 1080 });
    expect(qa.ok).toBe(false);
    if (!qa.ok) expect(qa.reasons).toContain("aspect");
  });

  it("honours a non-default expected aspect", () => {
    const qa = evaluateLookQa({ width: 1080, height: 1350, expectedAspect: "4:5" });
    expect(qa.ok).toBe(true);
  });

  it("accepts a look within the aspect tolerance band", () => {
    // nudge 9:16 by < tolerance and confirm it still passes
    const h = Math.round((1080 / 0.5625) * (1 + ASPECT_TOLERANCE * 0.5));
    const qa = evaluateLookQa({ width: 1080, height: h });
    expect(qa.ok).toBe(true);
  });

  it("flags invalid dimensions", () => {
    const qa = evaluateLookQa({ width: 0, height: 0 });
    expect(qa.ok).toBe(false);
    if (!qa.ok) expect(qa.reasons).toContain("invalid_dimensions");
  });
});

describe("evaluateLookQa — close-up (face bbox)", () => {
  it("fails a close-up: face box > 45% of frame height", () => {
    const qa = evaluateLookQa({
      width: 1080,
      height: 1920,
      faceBox: { width: 700, height: 1100 }, // ~57% of height
    });
    expect(qa.ok).toBe(false);
    if (!qa.ok) expect(qa.reasons).toContain("close_up");
  });

  it("passes a full-body look where the face is a small part of the frame", () => {
    const qa = evaluateLookQa({
      width: 1080,
      height: 1920,
      faceBox: { width: 180, height: 220 }, // ~11% of height
    });
    expect(qa.ok).toBe(true);
    if (qa.ok) expect(qa.checks).toContain("close_up");
  });

  it("does not run the close-up check when no face box is supplied", () => {
    const qa = evaluateLookQa({ width: 1080, height: 1920 });
    expect(qa.ok).toBe(true);
    if (qa.ok) expect(qa.checks).not.toContain("close_up");
  });
});

describe("evaluateLookQa — full-body feet coverage", () => {
  it("fails a full_body look whose feet are cropped (low score)", () => {
    const qa = evaluateLookQa({
      width: 1080,
      height: 1920,
      framing: "full_body",
      feetNearBottomScore: 0.1,
    });
    expect(qa.ok).toBe(false);
    if (!qa.ok) expect(qa.reasons).toContain("cropped_legs");
  });

  it("passes a full_body look whose feet reach the bottom (high score)", () => {
    const qa = evaluateLookQa({
      width: 1080,
      height: 1920,
      framing: "full_body",
      feetNearBottomScore: 0.9,
    });
    expect(qa.ok).toBe(true);
  });

  it("does not apply the feet check to hero framing", () => {
    const qa = evaluateLookQa({
      width: 1080,
      height: 1920,
      framing: "hero",
      feetNearBottomScore: 0.1,
    });
    expect(qa.ok).toBe(true);
    if (qa.ok) expect(qa.checks).not.toContain("cropped_legs");
  });
});

describe("evaluateLookQa — multiple failures accumulate", () => {
  it("reports both aspect and close_up on a square headshot", () => {
    const qa = evaluateLookQa({
      width: 1024,
      height: 1024,
      faceBox: { width: 700, height: 700 },
    });
    expect(qa.ok).toBe(false);
    if (!qa.ok) {
      expect(qa.reasons).toContain("aspect");
      expect(qa.reasons).toContain("close_up");
    }
  });
});
