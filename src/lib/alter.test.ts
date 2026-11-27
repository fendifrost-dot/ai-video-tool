import { describe, expect, it } from "vitest";
import {
  ALTER_PRESETS,
  IDENTITY_DISTANCE_MAX,
  MOUTH_COVERAGE_MIN,
  MOUTH_LAG_OK,
  MOUTH_SHAPE_MAX,
  MOUTH_TIMING_MIN,
  buildAlterPrompt,
  checkAlter,
  compositeMasked,
  compositeTargetFrame,
  gateTrackScore,
  listPresets,
  muxOriginalAudioArgv,
  planAlter,
  planFinalize,
  runAlterTool,
  scoreMouth,
  type GrayFrame,
  type RgbFrame,
} from "@/lib/alter";

function gray(width: number, height: number, paint: (x: number, y: number) => number): GrayFrame {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data[y * width + x] = paint(x, y);
  return { width, height, data };
}

function rgb(width: number, height: number, color: [number, number, number]): RgbFrame {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = color[0];
    data[i * 3 + 1] = color[1];
    data[i * 3 + 2] = color[2];
  }
  return { width, height, data };
}

describe("ALTER presets and prompt", () => {
  it("has the three modes and 36 presets", () => {
    expect(ALTER_PRESETS).toHaveLength(36);
    expect(new Set(listPresets("swap").map((preset) => preset.mode))).toEqual(new Set(["swap"]));
    expect(listPresets("motion").length).toBeGreaterThan(0);
    expect(listPresets("restyle").length).toBeGreaterThan(0);
    expect(ALTER_PRESETS.some((preset) => preset.name === "outfit")).toBe(true);
    expect(ALTER_PRESETS.some((preset) => preset.name === "new-location")).toBe(true);
    expect(ALTER_PRESETS.some((preset) => preset.name === "anime")).toBe(true);
  });

  it("keeps the mouth rule on a performance and does not send", () => {
    const prompt = buildAlterPrompt({
      preset: "outfit",
      who: "the man with the beard",
      slots: { garment: "black coat", replacement: "leather jacket" },
    });
    expect(prompt.ok).toBe(true);
    if (!prompt.ok) return;
    expect(prompt.performance).toBe(true);
    expect(prompt.text).toContain("@Video1");
    expect(prompt.text).toContain("mouth");
    const plan = planAlter({
      preset: "product-swap",
      who: "the man with the beard",
      slots: { object: "paper cup", product: "slim can" },
      videoUrl: "https://cdn.example/take.mp4",
      targetFrameUrl: "https://cdn.example/target.png",
    });
    expect("submitted" in plan).toBe(true);
    if (!("submitted" in plan)) return;
    expect(plan.submitted).toBe(false);
    expect(plan.spendUsd).toBe(0);
    expect(plan.draft.input.draft).toBe(true);
    expect(plan.draft.input.resolution).toBe("480p");
    expect(plan.draft.input.generate_audio).toBe(false);
    expect(plan.draft.input.video_urls).toEqual(["https://cdn.example/take.mp4"]);
    expect(plan.draft.submit).toBe(false);
    expect(plan.finalize).toBeNull();
    expect(plan.audio.argv).toContain("1:a:0");
    expect(plan.fallback.enabled).toBe(true);
  });
});

describe("ALTER checker", () => {
  it("fails a swap that changes nothing", () => {
    const frames = Array.from({ length: 6 }, () =>
      gray(16, 16, (x, y) => ((x + y) % 2 ? 20 : 180)),
    );
    const report = checkAlter({
      source: frames,
      output: frames.map((frame) => ({ ...frame, data: frame.data.slice() })),
      mode: "swap",
      performance: false,
    });
    expect(report.verdict).toBe("CHECK");
    expect(report.issues.some((issue) => issue.startsWith("change:"))).toBe(true);
  });

  it("flags a rapping redraw whose mouth timing does not match", () => {
    const source = [0.02, 0.12, 0.22, 0.12, 0.02, 0.18].map((openness) => ({ openness }));
    const flat = source.map(() => ({ openness: 0.04 }));
    const bad = scoreMouth(source, flat);
    expect(bad.timingFails).toBe(true);
    expect(bad.timing!).toBeLessThan(MOUTH_TIMING_MIN);
    const same = scoreMouth(source, source);
    expect(same.timingFails).toBe(false);
    expect(same.timing!).toBeGreaterThan(0.9);
    const moved = scoreMouth(
      source.map((frame) => ({ ...frame, points: [{ x: 0.5, y: 0.6 }] })),
      source.map((frame) => ({ ...frame, points: [{ x: 0.7, y: 0.6 }] })),
    );
    expect(moved.shapeFails).toBe(true);
    expect(moved.landmarkWatch).toBe(false);
    const near = scoreMouth(
      source.map((frame) => ({ ...frame, points: [{ x: 0.5, y: 0.6 }] })),
      source.map((frame) => ({ ...frame, points: [{ x: 0.55, y: 0.6 }] })),
    );
    expect(near.shapeFails).toBe(false);
    expect(near.landmarkWatch).toBe(true);
    expect(IDENTITY_DISTANCE_MAX).toBe(0.25);
  });

  const rap = Array.from({ length: 72 }, (_, i) => ({
    openness: 0.02 + 0.09 * Math.abs(Math.sin(i * 0.3)) + 0.03 * Math.abs(Math.sin(i * 0.13)),
  }));

  it("fails a mouth that is right but late, and passes one frame of slip", () => {
    const late = (frames: number) => [...rap.slice(0, frames).map(() => rap[0]), ...rap.slice(0, -frames)];
    const three = scoreMouth(rap, late(3));
    expect(three.lagFrames).toBe(3);
    expect(three.timingBest!).toBeGreaterThan(0.95);
    expect(three.timingFails).toBe(true);
    expect(three.issues.join(" ")).toContain("re-timed");
    const one = scoreMouth(rap, late(1));
    expect(Math.abs(one.lagFrames)).toBeLessThanOrEqual(MOUTH_LAG_OK);
    expect(one.timing!).toBeGreaterThan(MOUTH_TIMING_MIN);
    expect(one.timingFails).toBe(false);
  });

  it("claims nothing when his face was not read on enough frames", () => {
    const holes = rap.map((frame, i) => (i % 3 === 0 ? frame : { openness: Number.NaN, found: false }));
    const score = scoreMouth(rap, holes);
    expect(score.coverage).toBeLessThan(MOUTH_COVERAGE_MIN);
    expect(score.measured).toBe(false);
    const report = checkAlter({
      source: [gray(8, 8, () => 10), gray(8, 8, () => 20)],
      output: [gray(8, 8, () => 10), gray(8, 8, () => 20)],
      mode: "swap",
      performance: true,
      mouthSource: rap,
      mouthOutput: holes,
      identityDistance: 0.1,
    });
    expect(report.fallback).toBe(true);
  });

  it("judges a tracker score with the same gates", () => {
    // the eight real redraws of 26 Nov 2026 sit at timing 0.744 to 0.950, lag 0, shape 0.026 to 0.029
    const real = gateTrackScore({ measured: true, coverage: 0.956, timing: 0.744, timing_best: 0.744, lag_frames: 0, mouth_shape_distance: 0.0261 });
    expect(real.measured).toBe(true);
    expect(real.timingFails || real.shapeFails).toBe(false);
    // the same take moved two frames against itself: 0.883 on the clock, 1.0 two frames away
    const moved = gateTrackScore({ measured: true, coverage: 1, timing: 0.883, timing_best: 1, lag_frames: -2, mouth_shape_distance: 0.0394 });
    expect(moved.timingFails).toBe(true);
    // a side-on take: his face read on 9% of the frames
    expect(gateTrackScore({ measured: false, coverage: 0.09 }).measured).toBe(false);
    expect(gateTrackScore({ measured: true, coverage: 1, timing: 0.9, lag_frames: 0, mouth_shape_distance: MOUTH_SHAPE_MAX + 0.01 }).shapeFails).toBe(true);
  });

  it("the check tool refuses a redraw whose head is turned away from the take's", () => {
    const answer = runAlterTool("avt_alter_check", {
      mode: "swap",
      changed_area: 0.1,
      structure_median: 0.7,
      motion_correlation: 0.8,
      track_score: { measured: true, coverage: 1, timing: 0.3, timing_best: 0.3, lag_frames: 0, mouth_shape_distance: 0.02, pose_turn_difference: 0.3, pose_ok_for_putback: false, identity_distance: 0.1 },
    });
    expect(answer.ok).toBe(true);
    const value = (answer as { value: { verdict: string; fallback: boolean; putBackPossible: boolean; issues: string[] } }).value;
    expect(value.verdict).toBe("CHECK");
    expect(value.fallback).toBe(true);
    expect(value.putBackPossible).toBe(false);
    expect(value.issues.join(" ")).toContain("re-roll");
  });

  it("does not finalize a failed draft and does finalize a pass", () => {
    const plan = planAlter({
      preset: "de-logo",
      who: "the man with the beard",
      slots: { object: "cap" },
      videoUrl: "https://cdn.example/take.mp4",
      performance: false,
    });
    if (!("draft" in plan)) throw new Error("expected a plan");
    const report = {
      verdict: "CHECK" as const,
      mode: "swap" as const,
      framesCompared: 4,
      changedArea: 0,
      structureMedian: 1,
      motionCorrelation: 1,
      jumps: [],
      tailTrimFrames: 0,
      frozenFrom: [],
      mouth: null,
      identity: { measured: false, fails: false, distance: null },
      fallback: false,
      issues: ["change"],
      gates: {
        structureFloor: 0.45,
        changed: [0.004, 0.55] as const,
        motionMin: 0.6,
        restyleStructureMax: 0.65,
      },
    };
    expect(planFinalize(plan, report).finalize).toBeNull();
    const passed = planFinalize(plan, { ...report, verdict: "PASS", issues: [] });
    expect(passed.finalize?.input.draft).toBe(false);
    expect(passed.finalize?.input.resolution).toBe("1080p");
    expect(passed.finalize?.submit).toBe(false);
  });
});

describe("ALTER pixels", () => {
  it("puts the source face back inside the mask and builds a target frame", () => {
    const source = rgb(4, 4, [200, 0, 0]);
    const output = rgb(4, 4, [0, 0, 200]);
    const mask = new Float32Array(16);
    mask[5] = 1;
    const mixed = compositeMasked(source, output, mask, 0);
    expect(mixed.data[5 * 3]).toBe(200);
    expect(mixed.data[0]).toBe(0);
    const still = rgb(2, 2, [0, 180, 0]);
    const guided = compositeTargetFrame(output, still, { x: 1, y: 1, width: 2, height: 2 }, 0);
    expect(guided.data[(1 * 4 + 1) * 3 + 1]).toBe(180);
    expect(muxOriginalAudioArgv("v.mp4", "a.wav", "out.mp4")).toContain("-shortest");
  });

  it("answers the MCP tools without a provider call", () => {
    const listed = runAlterTool("avt_alter_presets", { mode: "swap" });
    expect(listed.ok).toBe(true);
    const planned = runAlterTool("avt_alter_plan", {
      preset: "outfit",
      who: "the man with the beard",
      video_url: "http://nope/take.mp4",
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const plan = planned.value as {
      submitted: boolean;
      ready: boolean;
      draft: { input: { generate_audio: boolean } };
    };
    expect(plan.submitted).toBe(false);
    expect(plan.ready).toBe(false);
    expect(plan.draft.input.generate_audio).toBe(false);
    const checked = runAlterTool("avt_alter_check", {
      mode: "swap",
      performance: true,
      changed_area: 0.08,
      structure_median: 0.7,
      motion_correlation: 0.9,
      mouth_source: [0.02, 0.2, 0.02, 0.2],
      mouth_output: [0.02, 0.02, 0.02, 0.02],
      identity_distance: 0.4,
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect((checked.value as { verdict: string }).verdict).toBe("CHECK");
  });
});
