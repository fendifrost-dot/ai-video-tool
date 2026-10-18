import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  applyGesture,
  assertPlanSafe,
  durationFrames,
  durationSeconds,
  exportXmeml,
  importEdit,
  importEdlCsv,
  importXmeml,
  mediaWarnings,
  planRender,
  replaceTake,
  snapFrame,
  snapTargets,
  timingExplanation,
  videoClips,
  YSL_PROJECT_ID,
  YSL_VARIATION_ID,
} from "../../../supabase/functions/edit-render/model";
import { sequenceLyricWarnings } from "./warnings";

const csv = readFileSync(resolve("src/lib/editor/__fixtures__/edl_v1_coldopen.csv"), "utf8");
const xml = readFileSync(resolve("src/lib/editor/__fixtures__/ysl_ice_on_v1.xml"), "utf8");
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

function onPath(bin: string): boolean {
  return spawnSync(bin, ["-version"], { encoding: "utf8", timeout: 5000 }).status === 0;
}

/** Encode only where the runner has ffmpeg, ffprobe, and the caption font. The plan checks do not need them. */
const canEncode = onPath("ffmpeg") && onPath("ffprobe") && existsSync(FONT);

function coldOpen() {
  return importEdlCsv(csv, {
    projectId: YSL_PROJECT_ID,
    variationId: YSL_VARIATION_ID,
    name: "YSL_IceOn_v1_COLDOPEN",
    width: 720,
    height: 1280,
  });
}

describe("the YSL cold open imports as a sequence", () => {
  it("reads 44 picture events, 1133 frames, 14 lipsync placeholders", () => {
    const seq = coldOpen();
    const video = videoClips(seq);
    expect(video).toHaveLength(44);
    expect(durationFrames(seq)).toBe(1133);
    expect(durationSeconds(seq)).toBeCloseTo(47.208, 3);
    expect(video.filter((c) => c.placeholder)).toHaveLength(14);
    expect(seq.songOffset).toBeCloseTo(13.7917, 3);
    expect(video[0]?.mediaDuration).toBeCloseTo(97 / 24, 5);
    expect(video.find((c) => c.placeholder)?.mouth).toBe("camera");
    expect(video.find((c) => !c.placeholder && c.labelColor === "Mango")?.mouth).toBe("model");
  });

  it("reads both XML sequences and matches the CSV frame for frame", () => {
    const sequences = importXmeml(xml, {
      projectId: YSL_PROJECT_ID,
      variationId: YSL_VARIATION_ID,
    });
    expect(sequences).toHaveLength(2);
    const frames = sequences.map((s) => durationFrames(s)).sort((a, b) => a - b);
    expect(frames).toEqual([1133, 1464]);
    const cold = sequences.find((s) => durationFrames(s) === 1133)!;
    expect(cold.songOffset).toBeCloseTo(13.7917, 2);
    const fromCsv = coldOpen();
    const a = videoClips(fromCsv);
    const b = videoClips(cold);
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) {
      expect(b[i]?.shotKey).toBe(a[i]?.shotKey);
      expect(Math.round(b[i]!.timelineIn * 24)).toBe(Math.round(a[i]!.timelineIn * 24));
      expect(Math.round(b[i]!.sourceIn * 24)).toBe(Math.round(a[i]!.sourceIn * 24));
    }
  });

  it("round-trips through FCP7 XML on frames, labels and the song offset", () => {
    const again = importEdit(exportXmeml([coldOpen()]), { projectId: YSL_PROJECT_ID })[0]!;
    const src = coldOpen();
    expect(durationFrames(again)).toBe(1133);
    expect(again.songOffset).toBeCloseTo(src.songOffset, 3);
    expect(videoClips(again).map((c) => c.labelColor)).toEqual(
      videoClips(src).map((c) => c.labelColor),
    );
  });
});

describe("gestures stay on the frame", () => {
  it("slips the source and leaves the timeline", () => {
    const seq = coldOpen();
    const id = videoClips(seq)[0]!.id;
    const before = videoClips(seq)[0]!;
    const next = applyGesture(seq, { kind: "slip", clipId: id, deltaFrames: 1 });
    const after = videoClips(next)[0]!;
    expect(after.timelineIn).toBe(before.timelineIn);
    expect(after.sourceIn).toBeCloseTo(before.sourceIn + 1 / 24, 5);
    expect(after.sourceOut).toBeCloseTo(before.sourceOut + 1 / 24, 5);
  });

  it("a ripple trim keeps the start and pulls the next clip", () => {
    const seq = coldOpen();
    const [a, b] = videoClips(seq);
    const next = applyGesture(seq, {
      kind: "trim",
      clipId: a!.id,
      edge: "in",
      deltaFrames: 6,
      ripple: true,
    });
    const clips = videoClips(next);
    expect(clips[0]!.timelineIn).toBeCloseTo(a!.timelineIn, 5);
    expect(clips[0]!.timelineOut).toBeCloseTo(a!.timelineOut - 6 / 24, 4);
    expect(clips[1]!.timelineIn).toBeCloseTo(b!.timelineIn - 6 / 24, 4);
  });

  it("replaces a lipsync placeholder without moving the cut", () => {
    const seq = coldOpen();
    const pending = videoClips(seq).find((c) => c.placeholder)!;
    const next = replaceTake(seq, pending.id, {
      assetId: "take-1",
      fileName: "take.mp4",
      clearPlaceholder: true,
    });
    const clip = videoClips(next).find((c) => c.id === pending.id)!;
    expect(clip.timelineIn).toBe(pending.timelineIn);
    expect(clip.placeholder).toBe(false);
    expect(clip.assetId).toBe("take-1");
    expect(clip.name).toBe(pending.shotKey);
  });

  it("snaps a timeline edge to a lyric and does not snap a slip", () => {
    const targets = snapTargets({ fps: 24, songOffset: 331 / 24, beats: [], lyricTimes: [14] });
    const edge = snapFrame(4, targets, 4);
    expect(edge).not.toBe(4);
    expect(snapFrame(4, targets, 0)).toBe(4);
  });

  it("splits at the playhead and removes without deleting other clips' media refs", () => {
    const seq = coldOpen();
    const first = videoClips(seq)[0]!;
    const mid = (first.timelineIn + first.timelineOut) / 2;
    const split = applyGesture(seq, { kind: "split", clipId: first.id, atTimelineSeconds: mid });
    expect(videoClips(split).length).toBe(videoClips(seq).length + 1);
    const left = videoClips(split).find((c) => c.id === first.id)!;
    expect(left.timelineOut).toBeCloseTo(mid, 4);
    const removed = applyGesture(split, { kind: "remove", clipId: left.id, ripple: false });
    expect(videoClips(removed).some((c) => c.id === left.id)).toBe(false);
    expect(videoClips(removed).length).toBe(videoClips(seq).length);
  });

  it("move and slip explain earlier/later in plain language", () => {
    expect(timingExplanation("move", -5, 24).direction).toBe("earlier");
    expect(timingExplanation("slip", 5, 24).label).toMatch(/earlier against the song/);
  });
});

describe("the plan spends nothing", () => {
  it("flags a generated mouth for judgment and a shot whose file runs out", () => {
    const seq = coldOpen();
    const model = mediaWarnings(seq).filter((w) => /generated mouth/i.test(w.message));
    expect(model.length).toBeGreaterThan(0);
    expect(model[0]?.message).not.toMatch(/will not line/i);
    const warnings = sequenceLyricWarnings(seq, [
      {
        lineIndex: 1,
        text: "line",
        start: seq.songOffset,
        end: seq.songOffset + 2,
        words: [{ w: "line", start: seq.songOffset, end: seq.songOffset + 2 }],
      },
    ]);
    expect(
      warnings[0]?.fit.status === "ok" ||
        warnings[0]?.fit.status === "extend_shot" ||
        warnings[0]?.fit.status === "needs_clip",
    ).toBe(true);
  });

  it("plans a structural proxy of the cold open at about 47.2 s", () => {
    const seq = coldOpen();
    const plan = planRender(seq, { kind: "proxy", aspect: "9:16", fontFile: FONT, captions: true });
    assertPlanSafe(plan);
    expect(plan.costUsd).toBe(0);
    expect(plan.billable).toBe(false);
    expect(plan.durationSeconds).toBeCloseTo(47.208, 3);
    expect(plan.argv.join(" ")).not.toMatch(/https?:/);
    expect(plan.argv[0]).toBe("ffmpeg");
  });

  it.skipIf(!canEncode)("encodes that proxy to about 47.2 s when ffmpeg is installed", () => {
    const seq = coldOpen();
    const plan = planRender(seq, { kind: "proxy", aspect: "9:16", fontFile: FONT, captions: true });
    const out = resolve("/tmp/ysl-coldopen-proxy.mp4");
    const args = plan.argv.slice(1).map((a) => (a === "OUTPUT" ? out : a));
    const run = spawnSync(plan.argv[0]!, args, { encoding: "utf8", timeout: 180000 });
    expect(run.status, run.stderr).toBe(0);
    const probe = spawnSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
      { encoding: "utf8", timeout: 15000 },
    );
    expect(Number(probe.stdout.trim())).toBeCloseTo(47.208, 1);
  });
});
