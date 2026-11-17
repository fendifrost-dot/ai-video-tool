import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StyleLearnPage from "./StyleLearnPage";
import { STYLE_APPROXIMATED, STYLE_MATCHED } from "@/lib/style";

const grade = { contrast: 1, saturation: 1, grain: 0, vignette: 0, lift: 0, gamma: 1, gain: 1 };
const profile = {
  format: "avt.style_profile",
  format_version: 1,
  cost_usd: 0,
  summary: "Two hard cuts, a flat grade, and no paid call.",
  source: { label: "fixture", duration_seconds: 2, width: 320, height: 240, fps: 24 },
  shots: [
    {
      index: 0,
      start: 0,
      end: 2,
      transition_out: "hard_cut",
      speed: 1,
      motion: { zoom: 0, shake: 0, intensity: 0 },
      grade,
      fx: [],
    },
  ],
  shot_length: { count: 1, mean: 2, median: 0.5, p10: 0.5, p90: 2 },
  cut_timing: { on_beat_ratio: 1, median_offset_seconds: 0, prefer: "beat" },
  transitions: { hard_cut: 1, crossfade: 0, flash: 0, whip: 0 },
  speed: { slow_motion_ratio: 0, fast_ratio: 0 },
  camera: { zoom: 0, shake: 0, intensity: 0 },
  grade,
  frame: { aspect: "4:3", letterbox: false, bar_top: 0, bar_bottom: 0, bar_left: 0, bar_right: 0 },
  overlays: { text_presence: 0 },
  fx: { strobe: false, rgb_split: false, glitch: false },
  vision: { enabled: false, labels: [], status: "off" },
  fidelity: { matched: [...STYLE_MATCHED], approximated: [...STYLE_APPROXIMATED] },
  detectors: { scenes: "chroma-distance", audio: "none", vision: "off", sample_fps: 24 },
};

describe("Style Learn page", () => {
  it("plans a cut from a pasted profile and keeps the performance take at speed 1", () => {
    render(<StyleLearnPage projectId="764a63d2-93cd-44f3-905f-292f14ab2f51" />);
    expect(screen.queryByTestId("style-summary")).toBeNull();
    const box = screen.getByTestId("style-json");
    fireEvent.change(box, { target: { value: JSON.stringify(profile) } });
    fireEvent.blur(box);
    expect(screen.getByTestId("style-summary").textContent).toContain("no paid call");
    expect(screen.getByText("Matched")).toBeTruthy();
    expect(screen.getByText("Approximated")).toBeTruthy();
    const plan = screen.getByTestId("style-plan");
    expect(plan.textContent).toContain("Cost $0");
    expect(plan.textContent).toContain("take");
    const row = screen.getAllByRole("row").find((item) => item.textContent?.includes("take"));
    expect(row?.textContent).toContain("1");
    fireEvent.change(box, { target: { value: "{}" } });
    fireEvent.blur(box);
    expect(screen.getByTestId("style-error").textContent).toMatch(/format/);
  });
});
