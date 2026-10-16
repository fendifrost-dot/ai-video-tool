import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { bimodality, chooseAlpha, matteRequestId } from "./matte";

const pic = (values: number[]) => {
  const out = new Uint8ClampedArray(values.length * 4);
  values.forEach((v, i) => out.set([v, v, v, 255], i * 4));
  return out;
};

describe("telling the alpha video from the RGB one", () => {
  it("measures how black-or-white a picture is", () => {
    expect(bimodality(pic([0, 255, 0, 255]))).toBe(1);
    expect(bimodality(pic([100, 128, 90, 140]))).toBe(0);
    expect(bimodality(pic([0, 128]))).toBe(0.5);
    expect(bimodality(new Uint8ClampedArray(0))).toBe(0);
  });

  it("chooses the grey, matte-like file and refuses when two look alike", () => {
    expect(
      chooseAlpha([
        { gray: false, bimodal: 0.9 },
        { gray: true, bimodal: 0.95 },
      ]),
    ).toBe(1);
    expect(
      chooseAlpha([
        { gray: true, bimodal: 0.2 },
        { gray: true, bimodal: 0.95 },
      ]),
    ).toBe(1); // an RGB file that opens on black is grey but not bimodal
    expect(
      chooseAlpha([
        { gray: true, bimodal: 0.9 },
        { gray: true, bimodal: 0.85 },
      ]),
    ).toBe(-1);
    expect(
      chooseAlpha([
        { gray: false, bimodal: 0 },
        { gray: false, bimodal: 0 },
      ]),
    ).toBe(-1);
    expect(chooseAlpha([{ gray: true, bimodal: 0.1 }])).toBe(0);
  });

  it("reads the request id off the status link", () => {
    expect(
      matteRequestId({
        status_url: "https://queue.fal.run/veed/video-background-removal/requests/abc-123/status",
      }),
    ).toBe("abc-123");
    expect(matteRequestId({ status_url: "https://queue.fal.run/x" })).toBeNull();
  });
});
