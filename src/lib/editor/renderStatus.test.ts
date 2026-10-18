import { describe, expect, it } from "vitest";
import { renderIsActive, renderStatusChip } from "./renderStatus";

describe("renderStatusChip", () => {
  it("covers each state", () => {
    expect(renderStatusChip(null).tone).toBe("muted");
    expect(renderStatusChip({ status: "queued", error: null }).tone).toBe("busy");
    expect(renderStatusChip({ status: "rendering", error: null }).label).toMatch(/Rendering/);
    expect(renderStatusChip({ status: "complete", error: null }).tone).toBe("ok");
    expect(renderStatusChip({ status: "failed", error: "download failed (404)" }).label).toBe(
      "Render failed: download failed (404)",
    );
  });
  it("polls only while queued or rendering", () => {
    expect(renderIsActive({ status: "queued" })).toBe(true);
    expect(renderIsActive({ status: "rendering" })).toBe(true);
    expect(renderIsActive({ status: "complete" })).toBe(false);
    expect(renderIsActive(null)).toBe(false);
  });
});
