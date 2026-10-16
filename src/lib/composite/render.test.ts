import { describe, expect, it } from "vitest";
import { alphaShouldAdvance, colrOf, coverRgba, normalizedTime, pairingFor, renderSize, resampleGray } from "./render";

describe("pairing the alpha with the take by time", () => {
  it("a frame's place on its clock runs 0 to 1 over the file", () => {
    expect(normalizedTime(0, 0, 4)).toBe(0);
    expect(normalizedTime(2, 0, 4)).toBe(0.5);
    expect(normalizedTime(1.5, 0.5, 4.5)).toBe(0.25);
    expect(normalizedTime(1, 1, 1)).toBe(0);
  });

  it("advances to the next alpha frame when it is at least as near the take frame", () => {
    expect(alphaShouldAdvance(0.5, 0.4, 0.6)).toBe(true); // a tie goes forward
    expect(alphaShouldAdvance(0.45, 0.4, 0.6)).toBe(false);
    expect(alphaShouldAdvance(0.59, 0.4, 0.6)).toBe(true);
    expect(alphaShouldAdvance(0.2, 0.4, 0.6)).toBe(false); // never goes back
  });

  it("walks a matte with a doubled frame without drifting the rest of the window", () => {
    // take: 4 frames at 0, 1/3, 2/3, 1; matte: 5 frames with the second doubled
    const take = [0, 1 / 3, 2 / 3, 1];
    const matte = [0, 0.25, 0.25, 0.5, 0.75, 1].map((x) => x); // normalised times (the doubled frame sits at the same time)
    let cur = 0;
    const picks: number[] = [];
    for (const t of take) {
      while (cur + 1 < matte.length && alphaShouldAdvance(t, matte[cur], matte[cur + 1])) cur++;
      picks.push(cur);
    }
    expect(picks).toEqual([0, 2, 4, 5]);
  });
});

describe("resampleGray", () => {
  it("returns the same array at the same size and interpolates between sizes", () => {
    const src = new Float32Array([0, 1, 0, 1]);
    expect(resampleGray(src, 2, 2, 2, 2)).toBe(src);
    const up = resampleGray(src, 2, 2, 4, 2);
    expect(up.length).toBe(8);
    expect(up[0]).toBeCloseTo(0, 3);
    expect(up[3]).toBeCloseTo(1, 3);
    expect(up[1]).toBeGreaterThan(0);
    expect(up[1]).toBeLessThan(1);
  });
});

describe("renderSize", () => {
  it("keeps an upright take's size and refuses a turned one", () => {
    expect(renderSize({ width: 720, height: 1280, rotation: 0 })).toEqual({
      width: 720,
      height: 1280,
    });
    expect(renderSize({ width: 2160, height: 3840, rotation: 0 })).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(() => renderSize({ width: 1920, height: 1080, rotation: 90 })).toThrow(/turned/);
    expect(() => renderSize({ width: null, height: 1080, rotation: 0 })).toThrow(/size/);
  });
});

describe("colrOf", () => {
  it("tags what the encoder said it wrote and nothing it did not", () => {
    expect(colrOf({ matrix: "bt709", primaries: "bt709", transfer: "bt709" })).toBe("bt709");
    expect(colrOf({ matrix: "smpte170m" })).toBe("bt601");
    expect(colrOf({ matrix: "bt470bg" })).toBe("bt601");
    expect(colrOf({ matrix: "rgb" })).toBeNull();
    expect(colrOf(null)).toBeNull();
    expect(colrOf(undefined)).toBeNull();
  });
});

describe("pairing the matte frame by frame (v2)", () => {
  it("a matte with one frame per take frame is paired by index, any other count by time", () => {
    expect(pairingFor(89, 89)).toBe("index");
    expect(pairingFor(89, 90)).toBe("time");
    expect(pairingFor(120, 60)).toBe("time");
  });

  it("the c044 failure: the matte's header said it was a frame longer than the take, and v1 ran a frame ahead", () => {
    // both files: 89 frames at 11381/512 fps, identical frame times; the matte's mdhd length 4.0489 s, the take's
    // 4.0039 s (replayed with the app's parser on 16 Oct). v1 normalised each clock to its header length.
    const n = 89;
    const d = 512 / 11381;
    const times = Array.from({ length: n }, (_, i) => i * d);
    const v1 = (takeLen: number, alphaLen: number) => {
      let cur = 0;
      const picks: number[] = [];
      for (let k = 0; k < n; k++) {
        const target = times[k] / takeLen;
        while (cur + 1 < n && alphaShouldAdvance(target, times[cur] / alphaLen, times[cur + 1] / alphaLen)) cur++;
        picks.push(cur);
      }
      return picks;
    };
    const old = v1(4.003866, 4.048853);
    expect(old[84]).toBe(85); // the matte of the next frame on his fast-moving head: the white wall along his outline
    expect(old.filter((a, k) => a !== k).length).toBeGreaterThan(40);
    // v2: the same count means frame by frame — and even by time, the clocks end at the LAST FRAME, not the header
    expect(pairingFor(n, n)).toBe("index");
    const last = times[n - 1];
    let cur = 0;
    for (let k = 0; k < n; k++) {
      const target = normalizedTime(times[k], 0, last);
      while (cur + 1 < n && alphaShouldAdvance(target, normalizedTime(times[cur], 0, last), normalizedTime(times[cur + 1], 0, last))) cur++;
      expect(cur).toBe(k);
    }
  });
});

describe("coverRgba", () => {
  it("copies a plate of the same size and centre-crops a wider one", () => {
    const same = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
    expect([...coverRgba(same, 2, 1, 2, 1)]).toEqual([...same]);
    // a 4×1 plate (black, red, green, blue) onto 2×1: the middle two pixels
    const wide = new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const out = coverRgba(wide, 4, 1, 2, 1);
    expect(out[0]).toBeGreaterThan(100); // red-ish
    expect(out[5]).toBeGreaterThan(100); // green-ish
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(255);
  });
});
