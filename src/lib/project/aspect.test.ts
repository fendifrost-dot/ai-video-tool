import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_ASPECT, PROJECT_ASPECTS, aspectCss, aspectNumber, aspectOfProject, frameBoxStyle, frameSize, parseAspect, stillRequestAspect } from "./aspect";

describe("the project's frame", () => {
  it("offers the four frames and nothing else", () => {
    expect([...PROJECT_ASPECTS]).toEqual(["9:16", "16:9", "1:1", "4:5"]);
  });

  it("a project that was never given a frame is 9:16, as every project was before the setting existed", () => {
    expect(DEFAULT_PROJECT_ASPECT).toBe("9:16");
    expect(aspectOfProject({ id: "p" })).toBe("9:16");
    expect(aspectOfProject({ aspect_ratio: null })).toBe("9:16");
    expect(aspectOfProject(null)).toBe("9:16");
    expect(aspectOfProject({ aspect_ratio: "16:9" })).toBe("16:9");
    expect(parseAspect("2.39:1")).toBe("9:16");
    expect(parseAspect("4:5")).toBe("4:5");
  });

  it("knows its shape as a number, for CSS and in pixels", () => {
    expect(aspectNumber("9:16")).toBeCloseTo(0.5625, 6);
    expect(aspectNumber("4:5")).toBe(0.8);
    expect(aspectCss("16:9")).toBe("16 / 9");
    expect(frameSize("9:16")).toEqual({ width: 1080, height: 1920 });
    expect(frameSize("16:9")).toEqual({ width: 1920, height: 1080 });
    expect(frameSize("1:1")).toEqual({ width: 1080, height: 1080 });
    expect(frameSize("4:5")).toEqual({ width: 1080, height: 1350 });
  });

  it("asks the image model for the frame where it has it, and for the nearest shape where it does not", () => {
    expect(stillRequestAspect("9:16")).toEqual({ aspect: "9:16", exact: true });
    expect(stillRequestAspect("16:9")).toEqual({ aspect: "16:9", exact: true });
    expect(stillRequestAspect("1:1")).toEqual({ aspect: "1:1", exact: true });
    // no 4:5 on the model: 3:4 is the nearest, and the picture is shown whole in the frame rather than cropped
    expect(stillRequestAspect("4:5")).toEqual({ aspect: "3:4", exact: false });
  });

  it("sizes a stage as the largest frame that fits the viewer", () => {
    expect(frameBoxStyle("9:16", "70vh")).toEqual({ aspectRatio: "9 / 16", width: "min(100%, calc(70vh * 9 / 16))" });
    expect(frameBoxStyle("16:9", "70vh")).toEqual({ aspectRatio: "16 / 9", width: "min(100%, calc(70vh * 16 / 9))" });
  });
});
