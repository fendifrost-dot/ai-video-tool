import { describe, expect, it } from "vitest";
import { assertTimelineValid, validateTimelineItems } from "./timelineValidation";

describe("validateTimelineItems", () => {
  it("rejects overlapping items on the same track", () => {
    const issues = validateTimelineItems(
      [
        { id: "a", track: "V1", start_frame: 0, end_frame: 48 },
        { id: "b", track: "V1", start_frame: 24, end_frame: 72 },
      ],
      240,
    );
    expect(issues.some((i) => i.code === "overlap")).toBe(true);
  });

  it("rejects items past duration_frames", () => {
    const issues = validateTimelineItems(
      [{ id: "a", track: "V1", start_frame: 0, end_frame: 300 }],
      240,
    );
    expect(issues.some((i) => i.code === "past_duration")).toBe(true);
  });

  it("assertTimelineValid throws on issues", () => {
    expect(() =>
      assertTimelineValid(
        [{ id: "a", track: "V1", start_frame: 0, end_frame: 300 }],
        100,
      ),
    ).toThrow();
  });
});
