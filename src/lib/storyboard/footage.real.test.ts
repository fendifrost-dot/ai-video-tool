import { describe, expect, it } from "vitest";
import { analyzeFootage, type AnalysisInput } from "./footage";
import { compatibilityOf } from "./compatibility";
import S06 from "./__fixtures__/take_S06.json";
import S09 from "./__fixtures__/take_S09.json";

/**
 * The analyzer over REAL FOOTAGE: two takes of the same performance, in the same room, framed differently.
 *
 * These are not synthetic series. The frames came out of the files in `project-clips` through
 * scripts/qa/footage_frames.py, and every reduction in them was made by the shipped functions — `cellsOf`,
 * `lumaOf`, `sharpTiles`, `bestShift`, `faceOf`, `lumaSpread`. The fixtures are subsampled (every 7th frame of S06,
 * every 5th of S09) to keep them small, so the numbers here are near, not equal, to a report over every frame.
 *
 * What these tests are for: that the analyzer still SEES what a person sees in these frames. Each expectation below
 * was checked against the picture by eye before it was written — the evidence frames are in
 * docs/research/results/2026-10-04-footage-analyzer/. They are deliberately loose: a tightening of a threshold
 * should not break them, a change in what the analyzer perceives should.
 */

const run = (f: unknown) => analyzeFootage(f as AnalysisInput, "2026-10-04T00:00:00.000Z");

describe("S06 — he performs to camera in a closet, framed thigh up", () => {
  const a = run(S06);

  it("reads the container exactly", () => {
    expect(a.file.resolution.value).toEqual({ width: 1080, height: 1920 });
    expect(a.file.aspect.value).toBe("9:16");
    expect(a.file.fps.value).toBe(30);
    // an iPhone HLG take: the thing that makes a generated plate not match
    expect(a.file.transfer.value).toBe("arib-std-b67");
    expect(a.audio.present.value).toBe(false);
  });

  it("finds him on every frame, near the middle", () => {
    expect(a.subject.faceCoverage.value).toBeGreaterThan(0.95);
    expect(a.subject.position.value!.x).toBeGreaterThan(0.4);
    expect(a.subject.position.value!.x).toBeLessThan(0.6);
  });

  it("sees that he sways across a good part of the frame", () => {
    // checked by eye: at frame 15 his head is right of centre, at 126 well left of it
    expect(a.subject.travel.value!.x).toBeGreaterThan(0.25);
    expect(a.subject.travel.value!.y).toBeLessThan(0.1);
  });

  it("reads the framing as ending above his feet", () => {
    expect(a.subject.reach.value).toBeGreaterThan(9);
    expect(a.subject.reach.value).toBeLessThan(14);
    expect(a.floor.feetVisible.value).toBe(false);
    expect(a.floor.contactNeeded.value).toBe(false);
  });

  it("calls the camera locked, because the closet behind him does not move", () => {
    expect(a.camera.stability.value).toBe("locked");
    expect(a.camera.motionSource.value).toBe("still");
  });

  it("puts the light above, which is where the ceiling fitting is", () => {
    expect(a.light.keyDirection.value).toBe("above");
    expect(a.light.exposure.value!.mean).toBeGreaterThan(0.4);
    expect(a.light.clipping.value!.white).toBeLessThan(0.02);
  });

  it("recommends a composite, and says what AVT cannot do to deliver one", () => {
    const spec = compatibilityOf(a);
    expect(spec.route.choice).toBe("composite");
    // corrected 4 October: matting DOES exist (composite_environment.py, RobustVideoMatting). The gap is
    // that it is a local script with measured failure modes, not that nothing can matte.
    expect(spec.gaps.join(" ")).toContain("matting exists but only as a local script");
    expect(spec.gaps.join(" ")).toContain("12 of 75 frames");
    expect(spec.requirements.some((h) => h.text.includes("1080 × 1920"))).toBe(true);
    expect(spec.requirements.some((h) => h.text.includes("arib-std-b67"))).toBe(true);
  });

  it("will not reframe to show what was not filmed", () => {
    const spec = compatibilityOf(a);
    expect(spec.requirements.some((h) => h.kind === "reframe")).toBe(true);
  });
});

describe("S09 — the same room and man, framed and positioned differently", () => {
  const a = run(S09);
  const s06 = run(S06);

  it("puts him somewhere else in the frame than S06 does", () => {
    // measured and checked by eye on frame 34: his eye-line is right of centre here, centred in S06
    expect(a.subject.position.value!.x).toBeGreaterThan(s06.subject.position.value!.x + 0.05);
  });

  it("loses his face on some frames, and says so rather than averaging over it", () => {
    expect(a.subject.faceCoverage.value).toBeLessThan(0.95);
    expect(a.subject.faceCoverage.evidence).toContain("of");
  });

  it("drops the frames whose face is too small for its landmarks to mean anything", () => {
    // four early frames came back with an eye distance of 11-46 px; one claimed a reach of 109
    expect(a.sampled.dropped.tooSmall).toBeGreaterThan(0);
    expect(a.subject.reach.value).toBeLessThan(20);
  });

  it("still ends above his feet, so the advice about the floor is the same", () => {
    expect(a.floor.feetVisible.value).toBe(false);
  });

  it("gives advice that differs from S06's where the footage differs", () => {
    const here = compatibilityOf(a).requirements.find((h) => h.from === "subject.position")!.text;
    const there = compatibilityOf(s06).requirements.find(
      (h) => h.from === "subject.position",
    )!.text;
    expect(here).not.toBe(there);
  });
});

describe("what it refuses to claim, on real footage", () => {
  const a = run(S06);

  it("never reports lip sync, a focal length, or a lighting setup", () => {
    expect(a.audio.lipSyncJudgeable.status).toBe("unknown");
    const joined = a.notEstablished.join(" ");
    expect(joined).toContain("focal length");
    expect(joined).toContain("lighting's geometry");
    expect(joined).toContain("no audio track");
  });

  it("marks its softness reading uncalibrated", () => {
    expect(a.light.softness.status).toBe("estimated");
    expect(a.light.softness.limit).toContain("UNCALIBRATED");
  });

  it("says its separation reading did not pull a matte", () => {
    expect(a.separation.difficulty.limit).toContain("no matte was pulled");
  });
});
