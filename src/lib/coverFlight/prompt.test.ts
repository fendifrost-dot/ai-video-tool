import { describe, expect, it } from "vitest";
import { buildPresetGuides, describeFlightPath } from "./geometry";
import {
  compileCoverFlightFromGuides,
  compileCoverFlightPrompt,
  COVER_FLIGHT_PATH_PLACEHOLDER,
  COVER_FLIGHT_PROMPT_TEMPLATE,
  promptForbidsVisibleVehicle,
} from "./prompt";

describe("compileCoverFlightPrompt", () => {
  it("is the universal template with only the path block filled", () => {
    const result = compileCoverFlightPrompt({
      pathDescription: "Start at top left → clockwise curve past the face → Endpoint bottom right",
    });
    expect(result.unfilled).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.promptText).toContain("HARD RULE");
    expect(result.promptText).toContain(
      "Start at top left → clockwise curve past the face → Endpoint bottom right",
    );
    expect(result.promptText).not.toContain(COVER_FLIGHT_PATH_PLACEHOLDER);
    expect(result.promptText).toContain("flying point of view");
    expect(result.promptText).toContain("SAME flat picture");
  });

  it("keeps the placeholder when the path is blank", () => {
    const result = compileCoverFlightPrompt({ pathDescription: "   " });
    expect(result.unfilled).toBe(true);
    expect(result.promptText).toContain(COVER_FLIGHT_PATH_PLACEHOLDER);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("appends key elements when they are not already in the path text", () => {
    const result = compileCoverFlightPrompt({
      pathDescription: "Start left → curve → end right",
      keyElements: "gold logo",
    });
    expect(result.pathDescription).toContain("gold logo");
  });

  it("does not duplicate key elements already named in the path", () => {
    const result = compileCoverFlightPrompt({
      pathDescription: "Start left past the gold logo → end right",
      keyElements: "gold logo",
    });
    expect(result.pathDescription.match(/gold logo/gi)?.length).toBe(1);
  });

  it("forbids a visible vehicle / drone / camera body", () => {
    expect(promptForbidsVisibleVehicle(COVER_FLIGHT_PROMPT_TEMPLATE)).toBe(true);
    const result = compileCoverFlightPrompt({
      pathDescription: "Start center → loop around the subject → Endpoint center",
    });
    expect(promptForbidsVisibleVehicle(result.promptText)).toBe(true);
    expect(result.promptText).not.toMatch(/a drone flies/i);
    expect(result.promptText).not.toMatch(/visible drone/i);
  });

  it("does not re-animate or add objects", () => {
    const result = compileCoverFlightPrompt({
      pathDescription: "Start left → end right",
    });
    expect(result.promptText).toMatch(/Nothing inside it moves, separates, morphs/);
    expect(result.promptText).toMatch(/No added objects/);
    expect(result.promptText).toMatch(/remove all guides/);
  });
});

describe("compileCoverFlightFromGuides", () => {
  it("merges geometry issues with an empty path description", () => {
    const result = compileCoverFlightFromGuides({ path: [], arrows: [] }, "");
    expect(result.unfilled).toBe(true);
    expect(result.issues.some((i) => /red flight line/i.test(i))).toBe(true);
    expect(result.issues.some((i) => /Fill in the flight path/i.test(i))).toBe(true);
  });

  it("compiles a ready prompt from a preset + auto description", () => {
    const guides = buildPresetGuides("circle");
    const description = describeFlightPath(guides.path, {
      keyElements: "the central figure",
    });
    const result = compileCoverFlightFromGuides(guides, description);
    expect(result.unfilled).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.promptText).toContain("the central figure");
  });
});
