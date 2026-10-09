import { describe, expect, it } from "vitest";
import {
  analyzeFootage,
  aspectName,
  coverageOf,
  FOOTAGE_ANALYZER_VERSION,
  type AnalysisInput,
  type FileFacts,
} from "./footage";
import type { FaceFrame } from "./takeCheck";
import type { SeriesFrame } from "@/lib/media/frameSeries";
import type { DetailFrame } from "@/lib/media/detailSeries";
import { DETAIL_TILES } from "@/lib/media/detailSeries";

/**
 * These tests check the ARITHMETIC and, above all, the DISCIPLINE: that a finding with nothing behind it says
 * "unknown" rather than producing a number, and that an inference is never filed as a measurement.
 *
 * They do not establish that the analyzer sees correctly. A synthetic frame series proves the sums; only real
 * footage shows whether the sums mean anything, and that is what footage.real.test.ts and the results write-up do.
 */

const FILE: FileFacts = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationSeconds: 7,
  rotation: 0,
  hasAudio: true,
  codec: "avc1.640028",
  transfer: null,
};

const face = (t: number, over: Partial<NonNullable<FaceFrame["face"]>> = {}): FaceFrame => ({
  t,
  face: { mouth: 0.1, size: 0.06, cx: 0.5, cy: 0.35, reach: 11, seen: 0.2, ...over },
});

const grid = (n = 12, luma = 0.5): SeriesFrame => ({
  t: 0,
  cells: Array.from({ length: n * n * 3 }, () => luma),
});

const detail = (t: number, over: Partial<DetailFrame> = {}): DetailFrame => ({
  t,
  sharp: Array.from({ length: DETAIL_TILES * DETAIL_TILES }, () => 0.05),
  luma: 0.5,
  clipLow: 0,
  clipHigh: 0,
  shift: null,
  borderShift: null,
  residual: null,
  ...over,
});

const input = (over: Partial<AnalysisInput> = {}): AnalysisInput => ({
  file: FILE,
  faces: Array.from({ length: 30 }, (_, i) => face(i / 30)),
  light: Array.from({ length: 30 }, (_, i) => ({ ...grid(), t: i / 30 })),
  detail: Array.from({ length: 30 }, (_, i) => detail(i / 30)),
  range: [0, 1],
  ...over,
});

const run = (over: Partial<AnalysisInput> = {}) =>
  analyzeFootage(input(over), "2026-10-04T00:00:00.000Z");

describe("a finding never claims more than it has", () => {
  it("files container facts as measured", () => {
    const a = run();
    expect(a.file.resolution.status).toBe("measured");
    expect(a.file.fps.value).toBe(30);
    expect(a.file.resolution.confidence).toBeNull();
  });

  it("files an inference as estimated, with a confidence and a stated limit", () => {
    const a = run();
    expect(a.subject.coverage.status).toBe("estimated");
    expect(a.subject.coverage.confidence).toBeGreaterThan(0);
    expect(a.subject.coverage.limit).toBeTruthy();
  });

  it("says unknown — not a default — when his face was never found", () => {
    const a = run({ faces: Array.from({ length: 30 }, (_, i) => ({ t: i / 30, face: null })) });
    for (const f of [
      a.subject.position,
      a.subject.scale,
      a.subject.reach,
      a.subject.coverage,
      a.subject.travel,
    ]) {
      expect(f.status).toBe("unknown");
      expect(f.value).toBeNull();
    }
    expect(a.notEstablished.join(" ")).toContain("his face was not readable");
  });

  it("treats a face found but too dark to read as not found", () => {
    // the reader draws a face on a silhouette; `seen` is how it is caught
    const a = run({ faces: Array.from({ length: 30 }, (_, i) => face(i / 30, { seen: 0.001 })) });
    expect(a.subject.faceCoverage.value).toBe(0);
    expect(a.subject.position.status).toBe("unknown");
  });

  it("never reports lip sync from one file", () => {
    const a = run();
    expect(a.audio.lipSyncJudgeable.status).toBe("unknown");
    expect(a.audio.lipSyncJudgeable.limit).toContain("cannot be judged from one file alone");
  });

  it("names focal length and lighting geometry as things it did not establish", () => {
    const joined = run().notEstablished.join(" ");
    expect(joined).toContain("focal length");
    expect(joined).toContain("lighting's geometry");
  });
});

describe("missing inputs", () => {
  it("handles a file with no audio and says so", () => {
    const a = run({ file: { ...FILE, hasAudio: false } });
    expect(a.audio.present.value).toBe(false);
    expect(a.notEstablished.join(" ")).toContain("no audio track");
  });

  it("handles a file whose size is not known", () => {
    const a = run({ file: { ...FILE, width: null, height: null } });
    expect(a.file.resolution.status).toBe("unknown");
    expect(a.file.aspect.status).toBe("unknown");
  });

  it("handles no frames at all without throwing", () => {
    const a = run({ faces: [], light: [], detail: [] });
    expect(a.sampled).toEqual({
      faceFrames: 0,
      lightFrames: 0,
      detailFrames: 0,
      dropped: { noFace: 0, tooDark: 0, tooSmall: 0 },
    });
    expect(a.camera.stability.status).toBe("unknown");
    expect(a.light.exposure.status).toBe("unknown");
  });

  it("will not call a camera locked off two frames", () => {
    const a = run({ detail: [detail(0), detail(0.03)] });
    expect(a.camera.motionSource.value).toBe("cannot_separate");
    expect(a.camera.motionSource.confidence).toBeLessThan(0.3);
  });
});

describe("camera movement is attributed, or declared unattributable", () => {
  const moving = (over: Partial<DetailFrame>) =>
    Array.from({ length: 30 }, (_, i) => detail(i / 30, i === 0 ? {} : over));

  it("still when nothing moves", () => {
    expect(run().camera.motionSource.value).toBe("still");
    expect(run().camera.stability.value).toBe("locked");
  });

  it("camera when the border moves with the whole picture", () => {
    const a = run({ detail: moving({ shift: [0.02, 0], borderShift: [0.02, 0] }) });
    expect(a.camera.motionSource.value).toBe("camera");
    expect(a.camera.stability.value).not.toBe("locked");
  });

  it("subject when the picture moves and its border does not", () => {
    const a = run({ detail: moving({ shift: [0.02, 0], borderShift: null }) });
    expect(a.camera.motionSource.value).toBe("subject");
    expect(a.camera.stability.value).toBe("locked");
  });

  it("cannot_separate — not a guess — when the border moves but the picture does not", () => {
    const a = run({ detail: moving({ shift: null, borderShift: [0.02, 0] }) });
    expect(a.camera.motionSource.value).toBe("cannot_separate");
    expect(a.notEstablished.join(" ")).toContain(
      "whether the picture's movement came from the camera or from him",
    );
  });
});

describe("coverageOf", () => {
  it("reads a reach against ordinary proportion, and is never a measurement", () => {
    expect(coverageOf(2).value).toBe("head_only");
    expect(coverageOf(5).value).toBe("chest_up");
    expect(coverageOf(9).value).toBe("waist_up");
    expect(coverageOf(11.5).value).toBe("thigh_up");
    expect(coverageOf(20).value).toBe("knee_up");
    expect(coverageOf(30).value).toBe("full_body");
  });

  it("is less sure the further down the body it reaches", () => {
    expect(coverageOf(2).confidence).toBeGreaterThan(coverageOf(30).confidence);
  });

  it("is less sure near a boundary than in the middle of a band", () => {
    // S06 at 11.47 and S09 at 10.97 are the same framing by eye and fall either side of 11.
    expect(coverageOf(10.97).confidence).toBeLessThan(coverageOf(9).confidence);
    expect(coverageOf(11.47).confidence).toBeLessThan(coverageOf(13.5).confidence);
  });

  it("drops a face too small for its landmarks to mean anything", () => {
    // measured on S09: four frames with an eye distance of 11-46 px, one of them reporting a reach of 109
    const a = analyzeFootage(
      {
        ...input(),
        faces: [
          ...Array.from({ length: 20 }, (_, i) => face(i / 30)),
          face(0.7, { size: 0.006, reach: 109 }),
        ],
      },
      "2026-10-04T00:00:00.000Z",
    );
    expect(a.sampled.dropped.tooSmall).toBe(1);
    expect(a.subject.reach.value).toBeCloseTo(11, 1);
    expect(a.floor.feetVisible.value).toBe(false);
  });
});

describe("aspectName", () => {
  it("names the ordinary shapes", () => {
    expect(aspectName(1080, 1920)).toBe("9:16");
    expect(aspectName(1920, 1080)).toBe("16:9");
    expect(aspectName(1000, 1000)).toBe("1:1");
  });
});

describe("the edges of the frame", () => {
  it("names the edges his face passes near, and says it did not look at his body", () => {
    const a = run({
      faces: Array.from({ length: 30 }, (_, i) => face(i / 30, { cx: i === 0 ? 0.02 : 0.5 })),
    });
    expect(a.subject.faceNearEdge.value).toEqual(["left"]);
    expect(a.subject.faceNearEdge.limit).toContain("his FACE only");
  });
});

describe("version", () => {
  it("stamps the analyzer that produced it", () => {
    expect(run().version).toBe(FOOTAGE_ANALYZER_VERSION);
  });
});
