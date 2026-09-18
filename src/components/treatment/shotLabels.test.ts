import { describe, expect, it } from "vitest";
import {
  cameraAngleLabel,
  cameraMotionLabel,
  formatDuration,
  formatTimecode,
  framingAbbr,
  framingLabel,
  renderEngineLabel,
  shotKindLabel,
  shotTypeLabel,
  transitionLabel,
} from "./shotLabels";

describe("shotLabels", () => {
  it("humanises the enum vocabularies", () => {
    expect(framingLabel("medium_close")).toBe("Medium Close-Up");
    expect(framingAbbr("extreme_close_up")).toBe("ECU");
    expect(cameraAngleLabel("over_shoulder")).toBe("Over the Shoulder");
    expect(cameraMotionLabel("whip_pan")).toBe("Whip Pan");
    expect(shotTypeLabel("b_roll")).toBe("B-Roll");
    expect(shotKindLabel("broll")).toBe("B-Roll");
    expect(transitionLabel("fade_black")).toBe("Fade to Black");
    expect(renderEngineLabel("manual")).toBe("Manual / Captured");
  });

  it("returns empty string for null/undefined enum values", () => {
    expect(framingLabel(null)).toBe("");
    expect(cameraAngleLabel(undefined)).toBe("");
    expect(framingAbbr(null)).toBe("");
  });

  it("formats timecode as M:SS, clamping negatives to zero", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(5)).toBe("0:05");
    expect(formatTimecode(75.9)).toBe("1:15");
    expect(formatTimecode(-3)).toBe("0:00");
  });

  it("formats clip duration to one decimal", () => {
    expect(formatDuration(3.456)).toBe("3.5s");
    expect(formatDuration(0)).toBe("0.0s");
    expect(formatDuration(-1)).toBe("0.0s");
  });
});
