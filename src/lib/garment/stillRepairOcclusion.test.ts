import { describe, expect, it } from "vitest";
import {
  applyOcclusionAlphaComposite,
  assertSam3MaskCompleteness,
  buildCompleteSam3OcclusionAlpha,
  buildOutfitMinusOccludersAlpha,
  dilateAlpha,
  expandQuadAlongBandNormal,
  LOGO_CHEST_OCCLUSION_POLICY,
  logoChestOcclusionGate,
  sam3MaskedRgbToAlpha,
  type RgbaImage,
} from "./stillRepairOcclusion";

function solid(w: number, h: number, r: number, g: number, b: number): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

describe("stillRepairOcclusion — SAM-3 α math", () => {
  it("sam3MaskedRgbToAlpha treats any non-black as membership", () => {
    const img = solid(4, 4, 0, 0, 0);
    img.data[0] = 12;
    img.data[1] = 5;
    img.data[2] = 3; // dark garment pixel
    const a = sam3MaskedRgbToAlpha(img);
    expect(a[0]).toBe(1);
    expect(a[1]).toBe(0);
  });

  it("buildOutfitMinusOccludersAlpha subtracts dilated hands/face from outfit", () => {
    const W = 40;
    const H = 40;
    const outfit = new Float32Array(W * H);
    const hands = new Float32Array(W * H);
    // Outfit covers a wide block; hands cover a small center patch.
    for (let y = 10; y < 30; y++) {
      for (let x = 5; x < 35; x++) outfit[y * W + x] = 1;
    }
    for (let y = 18; y < 22; y++) {
      for (let x = 18; x < 22; x++) hands[y * W + x] = 1;
    }
    const a = buildOutfitMinusOccludersAlpha({
      width: W,
      height: H,
      outfit,
      hands,
      face: null,
      dilatePx: 4,
    });
    // Center (hand) must be cleared after dilate+subtract
    expect(a[20 * W + 20]).toBe(0);
    // Far outfit pixel survives
    expect(a[12 * W + 8]).toBe(1);
  });

  it("applyOcclusionAlphaComposite restores source where α=0 (protected pixels)", () => {
    const source = solid(10, 10, 180, 120, 90); // skin
    const repaired = solid(10, 10, 20, 25, 80); // navy repair
    const alpha = new Float32Array(100);
    // Only right half is garment
    for (let y = 0; y < 10; y++) {
      for (let x = 5; x < 10; x++) alpha[y * 10 + x] = 1;
    }
    const out = applyOcclusionAlphaComposite(source, repaired, alpha);
    const left = (5 * 10 + 2) * 4;
    const right = (5 * 10 + 7) * 4;
    expect(out.data[left]).toBe(180); // skin preserved
    expect(out.data[right]).toBe(20); // navy applied
  });

  it("expandQuadAlongBandNormal keeps a tilted band narrow (no vertical drip)", () => {
    const quad = [
      { x: 10, y: 20 },
      { x: 50, y: 22 },
      { x: 48, y: 30 },
      { x: 8, y: 28 },
    ] as const;
    const expanded = expandQuadAlongBandNormal([...quad], 2);
    const h0 =
      (Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y) +
        Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y)) /
      2;
    const h1 =
      (Math.hypot(expanded[3].x - expanded[0].x, expanded[3].y - expanded[0].y) +
        Math.hypot(expanded[2].x - expanded[1].x, expanded[2].y - expanded[1].y)) /
      2;
    expect(h1).toBeGreaterThan(h0);
    expect(h1).toBeLessThan(h0 + 6); // ~2px each side
    // Must not shoot far below original bottom
    expect(Math.max(...expanded.map((p) => p.y))).toBeLessThan(35);
  });

  it("dilateAlpha grows a compact hand blob", () => {
    const W = 20;
    const H = 20;
    const a = new Float32Array(W * H);
    a[10 * W + 10] = 1;
    const d = dilateAlpha(a, W, H, 2);
    expect(d[10 * W + 10]).toBe(1);
    expect(d[10 * W + 12]).toBe(1);
    expect(d[0]).toBe(0);
  });
});

describe("SAM-3 completeness — never emit sam3 for partial masks", () => {
  const ones = (n: number) => {
    const a = new Float32Array(n);
    a.fill(1);
    return a;
  };

  it("outfit succeeds + hands fails -> not SAM-3", () => {
    const gate = assertSam3MaskCompleteness({
      outfit: ones(16),
      hands: null,
      face: ones(16),
    });
    expect(gate).toEqual({ complete: false, reason: "sam3_hands_failed" });
    const built = buildCompleteSam3OcclusionAlpha({
      width: 4,
      height: 4,
      outfit: ones(16),
      hands: null,
      face: ones(16),
    });
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.reason).toBe("sam3_hands_failed");
      expect(built.occlusion_source).toBe("unavailable");
    }
  });

  it("outfit succeeds + face fails -> not SAM-3", () => {
    const gate = assertSam3MaskCompleteness({
      outfit: ones(16),
      hands: ones(16),
      face: null,
    });
    expect(gate).toEqual({ complete: false, reason: "sam3_face_failed" });
    const built = buildCompleteSam3OcclusionAlpha({
      width: 4,
      height: 4,
      outfit: ones(16),
      hands: ones(16),
      face: undefined,
    });
    expect(built.ok).toBe(false);
    if (!built.ok) {
      expect(built.reason).toBe("sam3_face_failed");
      expect(built.occlusion_source).toBe("unavailable");
    }
  });

  it("complete outfit/hands/face -> SAM-3", () => {
    const W = 20;
    const H = 20;
    const outfit = ones(W * H);
    const hands = new Float32Array(W * H);
    const face = new Float32Array(W * H);
    // small hand + face patches so subtraction does not wipe coverage
    hands[5 * W + 5] = 1;
    face[2 * W + 2] = 1;
    const built = buildCompleteSam3OcclusionAlpha({
      width: W,
      height: H,
      outfit,
      hands,
      face,
      dilatePx: 1,
      minCoveragePx: 64,
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.occlusion_source).toBe("sam3");
      expect(built.alpha.length).toBe(W * H);
    }
  });

  it("outfit-only never reports sam3", () => {
    const built = buildCompleteSam3OcclusionAlpha({
      width: 4,
      height: 4,
      outfit: ones(16),
      hands: null,
      face: null,
    });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.occlusion_source).toBe("unavailable");
  });
});

describe("logo_chest Stage-1D fail-closed policy", () => {
  it("defaults disallow skin heuristic fallback", () => {
    expect(LOGO_CHEST_OCCLUSION_POLICY.requireCompleteSam3).toBe(true);
    expect(LOGO_CHEST_OCCLUSION_POLICY.allowSkinHeuristicFallbackByDefault).toBe(
      false,
    );
  });

  it("SAM failure + fail-closed -> 422 / no asset persistence", () => {
    const gate = logoChestOcclusionGate({ sam3Ok: false });
    expect(gate.proceed).toBe(false);
    if (!gate.proceed) {
      expect(gate.httpStatus).toBe(422);
      expect(gate.error).toBe("occlusion_unavailable");
      expect(gate.occlusion_source).toBe("unavailable");
      expect(gate.asset_persisted).toBe(false);
    }
  });

  it("SAM success -> proceed with sam3 only", () => {
    const gate = logoChestOcclusionGate({ sam3Ok: true });
    expect(gate).toEqual({ proceed: true, useSam3: true, useSkinFallback: false });
  });

  it("explicit allowSkinHeuristicFallback still permits surfaced fallback outside Stage-1D", () => {
    const gate = logoChestOcclusionGate({
      sam3Ok: false,
      allowSkinHeuristicFallback: true,
    });
    expect(gate).toEqual({
      proceed: true,
      useSam3: false,
      useSkinFallback: true,
    });
  });
});
