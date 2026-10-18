import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  importEdlCsv,
  YSL_PROJECT_ID,
  YSL_VARIATION_ID,
} from "../../../supabase/functions/edit-render/model";
import { CutTimeline } from "./CutTimeline";

const csv = readFileSync(resolve("src/lib/editor/__fixtures__/edl_v1_coldopen.csv"), "utf8");

describe("the cut strip", () => {
  it("shows the cold open and slips the clip that was clicked", () => {
    const seq = importEdlCsv(csv, {
      projectId: YSL_PROJECT_ID,
      variationId: YSL_VARIATION_ID,
      name: "cold",
    });
    const onGesture = vi.fn();
    render(<CutTimeline sequence={seq} onGesture={onGesture} />);
    expect(screen.getByTestId("cut-duration").textContent).toMatch(/47\.2 s/);
    expect(screen.getAllByTestId("cut-clip")).toHaveLength(44);
    fireEvent.click(screen.getAllByTestId("cut-clip")[0]!);
    expect(onGesture).toHaveBeenCalledWith({ kind: "slip", clipId: "v-1", deltaFrames: 1 });
    expect(
      screen.getAllByTestId("cut-clip").some((n) => n.getAttribute("data-mouth") === "unknown"),
    ).toBe(true);
    expect(
      screen.getAllByTestId("cut-clip").some((n) => n.getAttribute("data-mouth") === "camera"),
    ).toBe(false);
  });
});
