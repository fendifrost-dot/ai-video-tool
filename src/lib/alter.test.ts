import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALTER_PRESETS,
  AVT_PRESETS,
  IDENTITY_DISTANCE_MAX,
  MAX_FACE_PICTURES,
  MOTION_GATED,
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
  it("imports the preset file the way the edge runtime accepts", () => {
    // Deno refuses a JSON module without the attribute ("Expected a JavaScript or TypeScript module"), which would
    // take the whole avt-mcp function down at load. Verified with deno run on 27 Nov 2026.
    const source = readFileSync(
      resolve(__dirname, "../../supabase/functions/_shared/alter/catalog.ts"),
      "utf8",
    );
    expect(source).toContain('from "./catalog.json" with { type: "json" }');
  });

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
    // the route that rendered the draft Fendi passed: Control Center's Seedance video edit, through the proxy
    expect(plan.draft.function).toBe("proxy-provider-call");
    expect(plan.draft.body.endpoint).toBe("video-providers-higgsfield-model");
    const body = plan.draft.body.body;
    expect(body.modelVariant).toBe("seedance-2.5-edit");
    expect(body.mode).toBe("video_to_video");
    expect(body.resolution).toBe("480p");
    expect(body.generate_audio).toBe(false);
    expect(body.referenceVideoUrl).toBe("https://cdn.example/take.mp4");
    expect(body.referenceImageUrls).toEqual(["https://cdn.example/target.png"]);
    // an edit takes its length and frame from the source: sending either was refused by the provider
    expect(body).not.toHaveProperty("duration");
    expect(body).not.toHaveProperty("aspect_ratio");
    expect(plan.draft.submit).toBe(false);
    expect(plan.finalize).toBeNull();
    expect(plan.poll.body.query.provider).toBe("higgsfield");
    expect(plan.after.join(" ")).toContain("run_draft.py");
    expect(plan.audio.argv).toContain("1:a:0");
    expect(plan.ifItFails).toContain("Do not lay his original face back");
  });

  it("builds the action shot Fendi passed: his face photographs tagged after the take", () => {
    expect(AVT_PRESETS.map((preset) => preset.name)).toEqual(["action"]);
    expect(listPresets("swap").some((preset) => preset.name === "action")).toBe(true);
    const unfilled = planAlter({
      preset: "action",
      who: "the seated man",
      videoUrl: "https://cdn.example/take.mp4",
    });
    if (!("draft" in unfilled)) throw new Error("expected a plan");
    expect(unfilled.ready).toBe(false);
    expect(unfilled.blocked.join(" ")).toContain("unfilled slot");
    const plan = planAlter({
      preset: "action",
      who: "the seated man",
      slots: {
        keep: "his teal bathrobe; his cross-legged seat",
        action:
          "At about 1.2 seconds a second man steps in from the right edge and throws one punch. At about 2 seconds the seated man lifts his left forearm and blocks it. The forearm never passes in front of his face.",
      },
      videoUrl: "https://cdn.example/take.mp4",
      faceImageUrls: [
        "https://cdn.example/f1.jpg",
        "https://cdn.example/f2.jpg",
        "https://cdn.example/f3.jpg",
      ],
      projectId: "project-1",
    });
    if (!("draft" in plan)) throw new Error("expected a plan");
    expect(plan.ready).toBe(true);
    expect(plan.prompt).toContain("Real footage, not a render.");
    expect(plan.prompt).toContain("Change only this. At about 1.2 seconds");
    expect(plan.prompt).toContain("Keep the mouth's open and close timing identical to @Video1");
    expect(plan.prompt).toContain(
      "The seated man is the person in the photographs @Image1, @Image2 and @Image3: the same face, unchanged.",
    );
    expect(plan.prompt).not.toMatch(/\{\w+\}/);
    expect(plan.draft.body.body.referenceImageUrls).toHaveLength(3);
    expect(plan.draft.body.body.avt_project_id).toBe("project-1");
    expect(plan.images).toHaveLength(3);
    // a target frame is @Image1 and the face photographs follow it
    const withTarget = planAlter({
      preset: "outfit",
      who: "the man with the beard",
      slots: { outfit: "a long camel coat" },
      videoUrl: "https://cdn.example/take.mp4",
      targetFrameUrl: "https://cdn.example/target.png",
      faceImageUrls: ["https://cdn.example/f1.jpg"],
    });
    if (!("draft" in withTarget)) throw new Error("expected a plan");
    expect(withTarget.prompt).toContain("is the person in the photograph @Image2:");
    expect(withTarget.draft.body.body.referenceImageUrls).toEqual([
      "https://cdn.example/target.png",
      "https://cdn.example/f1.jpg",
    ]);
    const tooMany = planAlter({
      preset: "action",
      who: "the seated man",
      slots: { action: "A man steps in." },
      videoUrl: "https://cdn.example/take.mp4",
      faceImageUrls: Array.from(
        { length: MAX_FACE_PICTURES + 1 },
        (_, i) => `https://cdn.example/f${i}.jpg`,
      ),
    });
    if (!("draft" in tooMany)) throw new Error("expected a plan");
    expect(tooMany.ready).toBe(false);
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
    const late = (frames: number) => [
      ...rap.slice(0, frames).map(() => rap[0]),
      ...rap.slice(0, -frames),
    ];
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
    const holes = rap.map((frame, i) =>
      i % 3 === 0 ? frame : { openness: Number.NaN, found: false },
    );
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
    expect(report.redrawCleared).toBe(false);
    expect(report.faceNeedsHisEye).toBe(false);
  });

  it("judges a tracker score with the same gates", () => {
    // the eight real redraws of 26 Nov 2026 sit at timing 0.744 to 0.950, lag 0, shape 0.026 to 0.029
    const real = gateTrackScore({
      measured: true,
      coverage: 0.956,
      timing: 0.744,
      timing_best: 0.744,
      lag_frames: 0,
      mouth_shape_distance: 0.0261,
    });
    expect(real.measured).toBe(true);
    expect(real.timingFails || real.shapeFails).toBe(false);
    // the same take moved two frames against itself: 0.883 on the clock, 1.0 two frames away
    const moved = gateTrackScore({
      measured: true,
      coverage: 1,
      timing: 0.883,
      timing_best: 1,
      lag_frames: -2,
      mouth_shape_distance: 0.0394,
    });
    expect(moved.timingFails).toBe(true);
    // a side-on take: his face read on 9% of the frames
    expect(gateTrackScore({ measured: false, coverage: 0.09 }).measured).toBe(false);
    expect(
      gateTrackScore({
        measured: true,
        coverage: 1,
        timing: 0.9,
        lag_frames: 0,
        mouth_shape_distance: MOUTH_SHAPE_MAX + 0.01,
      }).shapeFails,
    ).toBe(true);
  });

  it("the check tool: a failed mouth is a re-roll, never his face laid back on", () => {
    const answer = runAlterTool("avt_alter_check", {
      mode: "swap",
      changed_area: 0.1,
      structure_median: 0.7,
      motion_correlation: 0.8,
      track_score: {
        measured: true,
        coverage: 1,
        timing: 0.3,
        timing_best: 0.3,
        lag_frames: 0,
        mouth_shape_distance: 0.02,
        identity_distance: 0.1,
      },
    });
    expect(answer.ok).toBe(true);
    const value = (
      answer as {
        value: { verdict: string; redrawCleared: boolean; faceNeedsHisEye: boolean; next: string };
      }
    ).value;
    expect(value.verdict).toBe("CHECK");
    expect(value.redrawCleared).toBe(false);
    expect(value.faceNeedsHisEye).toBe(false);
    expect(value.next).toContain("Re-roll");
    expect(value.next).toContain("Do not lay his original face back");
  });

  it("the action mode judges the draft Fendi passed the way he did", () => {
    // docs/alter/TEST_2026-11-26.md: structure 0.686, 8.2% changed, motion -0.16, timing 0.860 at 0 frames, shape 0.0515
    const numbers = {
      changed_area: 0.0822,
      structure_median: 0.686,
      motion_correlation: -0.1636,
      track_score: {
        measured: true,
        coverage: 1,
        timing: 0.86,
        timing_best: 0.86,
        lag_frames: 0,
        mouth_shape_distance: 0.0515,
        identity_distance: null,
      },
    };
    const asSwap = runAlterTool("avt_alter_check", { mode: "swap", ...numbers });
    const asAction = runAlterTool("avt_alter_check", { mode: "action", ...numbers });
    if (!asSwap.ok || !asAction.ok) throw new Error("expected answers");
    type Answer = {
      verdict: string;
      issues: string[];
      redrawCleared: boolean;
      faceNeedsHisEye: boolean;
      next: string;
    };
    expect((asSwap.value as Answer).issues.join(" ")).toContain("motion");
    const action = asAction.value as Answer;
    expect(action.issues.join(" ")).not.toContain("motion");
    // the mouth passed; no identity number exists, so it is CHECK and his to judge, not cleared by the tool
    expect(action.verdict).toBe("CHECK");
    expect(action.redrawCleared).toBe(false);
    expect(action.faceNeedsHisEye).toBe(true);
    expect(action.next).toContain("Fendi judges the face");
    expect(MOTION_GATED.action).toBe(false);
    expect(MOTION_GATED.swap).toBe(true);
    // the frame-level checker agrees: an added mover trips the motion gate as a swap and not as an action
    const still = Array.from({ length: 12 }, () => gray(16, 16, (x, y) => (x + y) * 6));
    const moving = still.map((frame, i) =>
      gray(16, 16, (x, y) => (x + y) * 6 + (x > 10 && y > 10 ? (i % 2) * 90 : 0)),
    );
    const source = still.map((frame, i) =>
      gray(16, 16, (x, y) => (x + y) * 6 + (x < 3 && y < 3 ? ((i * 7) % 5) * 3 : 0)),
    );
    const swapReport = checkAlter({ source, output: moving, mode: "swap", performance: false });
    const actionReport = checkAlter({ source, output: moving, mode: "action", performance: false });
    expect(
      actionReport.issues.filter((issue) => issue.startsWith("motion") || issue.startsWith("jump")),
    ).toEqual([]);
    expect(actionReport.motionCorrelation).toBe(swapReport.motionCorrelation);
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
      redrawCleared: false,
      faceNeedsHisEye: false,
      issues: ["change"],
      gates: {
        structureFloor: 0.45,
        changed: [0.004, 0.55] as const,
        motionMin: 0.6,
        restyleStructureMax: 0.65,
      },
    };
    expect(planFinalize(plan, report).finalize).toBeNull();
    const passed = planFinalize(plan, {
      ...report,
      verdict: "PASS",
      issues: [],
      redrawCleared: true,
    });
    // not a performance: no mouth to pass; the face still needs a number or his word
    expect(passed.finalize).toBeNull();
    const measured = planFinalize(plan, {
      ...report,
      verdict: "PASS",
      issues: [],
      redrawCleared: true,
      identity: { measured: true, fails: false, distance: 0.12 },
    });
    expect(measured.finalize?.body.body.resolution).toBe("1080p");
    expect(measured.finalize?.body.body.modelVariant).toBe("seedance-2.5-edit");
    expect(measured.finalize?.submit).toBe(false);
  });

  it("finalizes a rapping draft only on a passed mouth and a face that is measured or his word", () => {
    const plan = planAlter({
      preset: "action",
      who: "the seated man",
      slots: { action: "A man steps in from the right and he blocks one punch." },
      videoUrl: "https://cdn.example/take.mp4",
      faceImageUrls: ["https://cdn.example/f1.jpg"],
    });
    if (!("draft" in plan)) throw new Error("expected a plan");
    const mouth = gateTrackScore({
      measured: true,
      coverage: 1,
      timing: 0.86,
      timing_best: 0.86,
      lag_frames: 0,
      mouth_shape_distance: 0.0515,
    });
    const base = {
      verdict: "CHECK" as const,
      mode: "action" as const,
      framesCompared: 96,
      changedArea: 0.08,
      structureMedian: 0.69,
      motionCorrelation: -0.16,
      jumps: [],
      tailTrimFrames: 0,
      frozenFrom: [],
      mouth,
      identity: { measured: false, fails: false, distance: null },
      redrawCleared: false,
      faceNeedsHisEye: true,
      issues: [
        ...mouth.issues,
        "identity was not measured. The face is cleared by the number or by Fendi's word on the face sheet, not by this check.",
      ],
      gates: {
        structureFloor: 0.45,
        changed: [0.004, 0.55] as const,
        motionMin: 0.6,
        restyleStructureMax: 0.65,
      },
    };
    expect(planFinalize(plan, base).finalize).toBeNull();
    const onHisWord = planFinalize(plan, base, {
      resolution: "720p",
      faceApproval: "the face redraw as generated looked clean. That's definitely a pass.",
    });
    expect(onHisWord.finalize?.body.body.resolution).toBe("720p");
    expect(onHisWord.finalize?.note).toContain("definitely a pass");
    const late = gateTrackScore({
      measured: true,
      coverage: 1,
      timing: 0.4,
      timing_best: 0.9,
      lag_frames: 4,
      mouth_shape_distance: 0.03,
    });
    expect(
      planFinalize(
        plan,
        { ...base, mouth: late, issues: late.issues },
        { faceApproval: "looks like me, pass" },
      ).finalize,
    ).toBeNull();
    expect(
      planFinalize(
        plan,
        {
          ...base,
          issues: [...base.issues, "frozen output while the source moves, from frames 3"],
        },
        { faceApproval: "looks like me, pass" },
      ).finalize,
    ).toBeNull();
    // the MCP tool does the same from the draft's check
    const viaTool = runAlterTool("avt_alter_plan", {
      preset: "action",
      who: "the seated man",
      slots: { action: "A man steps in from the right and he blocks one punch." },
      video_url: "https://cdn.example/take.mp4",
      face_image_urls: ["https://cdn.example/f1.jpg"],
      draft_check: base,
      face_approval: "That's definitely a pass.",
    });
    if (!viaTool.ok) throw new Error("expected a plan");
    expect(
      (viaTool.value as { finalize: { body: { body: { resolution: string } } } | null }).finalize
        ?.body.body.resolution,
    ).toBe("1080p");
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
      draft: { body: { body: { generate_audio: boolean } } };
    };
    expect(plan.submitted).toBe(false);
    expect(plan.ready).toBe(false);
    expect(plan.draft.body.body.generate_audio).toBe(false);
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
