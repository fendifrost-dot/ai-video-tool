import { describe, expect, it } from "vitest";
import { shouldPreferWebCodecsCapture } from "./captureFrame";

function fakeVideo(partial: Partial<HTMLVideoElement>): HTMLVideoElement {
  return partial as HTMLVideoElement;
}

describe("shouldPreferWebCodecsCapture", () => {
  it("prefers WebCodecs when readyState is 0 (Claude stall)", () => {
    expect(
      shouldPreferWebCodecsCapture(
        fakeVideo({ readyState: 0, duration: NaN, videoWidth: 0, videoHeight: 0 }),
      ),
    ).toBe(true);
  });

  it("uses the media element when a frame is available", () => {
    expect(
      shouldPreferWebCodecsCapture(
        fakeVideo({ readyState: 2, duration: 3.7, videoWidth: 720, videoHeight: 1280 }),
      ),
    ).toBe(false);
  });
});
