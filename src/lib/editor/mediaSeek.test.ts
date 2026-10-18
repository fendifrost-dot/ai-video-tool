import { describe, expect, it } from "vitest";
import {
  needsSeek,
  pausedSeekToleranceSeconds,
  playbackDriftToleranceSeconds,
  snapToFrame,
} from "./mediaSeek";
import { stepFrame } from "./playback";

describe("mediaSeek", () => {
  it("uses half-frame paused tolerance so ±1f always seeks at 24 fps", () => {
    const fps = 24;
    const frame = 1 / fps;
    expect(pausedSeekToleranceSeconds(fps)).toBeCloseTo(frame / 2, 6);
    // One-frame discrepancy must seek while paused
    expect(
      needsSeek({ currentTime: 1.0, targetTime: 1.0 + frame, playing: false, fps }),
    ).toBe(true);
    // Sub-half-frame noise does not
    expect(
      needsSeek({ currentTime: 1.0, targetTime: 1.0 + frame * 0.2, playing: false, fps }),
    ).toBe(false);
  });

  it("keeps a looser drift band while playing", () => {
    const fps = 24;
    expect(playbackDriftToleranceSeconds(fps)).toBeGreaterThan(pausedSeekToleranceSeconds(fps));
    expect(
      needsSeek({ currentTime: 1.0, targetTime: 1.04, playing: true, fps }),
    ).toBe(false);
    expect(
      needsSeek({ currentTime: 1.0, targetTime: 1.2, playing: true, fps }),
    ).toBe(true);
  });

  it("snaps stepped times onto the frame grid for reversals", () => {
    const fps = 24;
    let t = 2;
    t = stepFrame(t, fps, 1);
    t = stepFrame(t, fps, 1);
    t = stepFrame(t, fps, -1);
    expect(snapToFrame(t, fps)).toBeCloseTo(2 + 1 / fps, 6);
    t = stepFrame(t, fps, -1);
    expect(snapToFrame(t, fps)).toBeCloseTo(2, 6);
  });
});
