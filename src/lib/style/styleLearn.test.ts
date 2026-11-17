// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STYLE_APPROXIMATED,
  STYLE_MATCHED,
  cubeLut,
  ffmpegArgs,
  parseStyleProfile,
  planStyleEdit,
  planStyleFromToolArgs,
  segmentFilter,
  type StyleProfile,
} from "../../../supabase/functions/_shared/styleLearn";

const PROJECT = "764a63d2-93cd-44f3-905f-292f14ab2f51";
const ROOT = new URL("../../..", import.meta.url).pathname;

function grade(over: Partial<StyleProfile["grade"]> = {}): StyleProfile["grade"] {
  return { contrast: 1, saturation: 1, grain: 0, vignette: 0, lift: 0, gamma: 1, gain: 1, ...over };
}

function profile(over: Partial<StyleProfile> = {}): StyleProfile {
  const base: StyleProfile = {
    format: "avt.style_profile",
    format_version: 1,
    cost_usd: 0,
    summary: "A short reference with hard cuts on the beat and a flat grade.",
    source: { label: "fixture", duration_seconds: 2, width: 320, height: 240, fps: 24 },
    shots: [
      {
        index: 0,
        start: 0,
        end: 1,
        transition_out: "hard_cut",
        speed: 1,
        motion: { zoom: 0, shake: 0, intensity: 0.2 },
        grade: grade(),
        fx: [],
      },
      {
        index: 1,
        start: 1,
        end: 2,
        transition_out: "flash",
        speed: 1,
        motion: { zoom: 0, shake: 0, intensity: 0.2 },
        grade: grade(),
        fx: ["flash"],
      },
    ],
    shot_length: { count: 2, mean: 1, median: 0.5, p10: 0.5, p90: 1 },
    cut_timing: { on_beat_ratio: 1, median_offset_seconds: 0, prefer: "beat" },
    transitions: { hard_cut: 0.5, crossfade: 0, flash: 0.5, whip: 0 },
    speed: { slow_motion_ratio: 0, fast_ratio: 0 },
    camera: { zoom: 0, shake: 0, intensity: 0.2 },
    grade: grade(),
    frame: {
      aspect: "4:3",
      letterbox: false,
      bar_top: 0,
      bar_bottom: 0,
      bar_left: 0,
      bar_right: 0,
    },
    overlays: { text_presence: 0 },
    fx: { strobe: false, rgb_split: true, glitch: true },
    vision: { enabled: false, labels: [], status: "off" },
    fidelity: { matched: [...STYLE_MATCHED], approximated: [...STYLE_APPROXIMATED] },
    detectors: { scenes: "chroma-distance", audio: "onset-flux", vision: "off", sample_fps: 24 },
    effects: [],
    resolution: { code: 0, local_model: 0, generative: 0, counts: { code: 0, local_model: 0, generative: 0 } },
  };
  return { ...base, ...over };
}

describe("style profile", () => {
  it("accepts the phase-1 document and rejects a paid cost", () => {
    expect(parseStyleProfile(profile()).ok).toBe(true);
    expect(parseStyleProfile({ ...profile(), cost_usd: 1 }).ok).toBe(false);
    expect(
      parseStyleProfile({ ...profile(), vision: { enabled: true, labels: [], status: "off" } }).ok,
    ).toBe(false);
    const bad = parseStyleProfile(profile());
    expect(bad.ok).toBe(true);
  });

  it("builds an identity LUT from neutral knobs and a grade LUT that moves mid grey", () => {
    const identity = cubeLut(grade());
    expect(identity).toContain("LUT_3D_SIZE 17");
    expect(identity).toContain("0.000000 0.000000 0.000000");
    expect(identity.trim().endsWith("1.000000 1.000000 1.000000")).toBe(true);
    const pushed = cubeLut(grade({ contrast: 1.5 }));
    expect(pushed).not.toEqual(identity);
  });
});

describe("style plan", () => {
  it("snaps cuts to beats and keeps a performance take at speed 1", () => {
    const planned = planStyleEdit({
      profile: profile(),
      projectId: PROJECT,
      beats: [0, 0.5, 1, 1.5, 2],
      clips: [{ id: "take", duration: 4, subject: "fendi_performance" }],
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.value.cost_usd).toBe(0);
    expect(planned.value.rendered).toBe(false);
    expect(
      planned.value.edl.clips.every((clip) => clip.speed === 1 && clip.timeRemapAllowed === false),
    ).toBe(true);
    expect(planned.value.edl.clips.map((clip) => clip.timelineOut)).toEqual([0.5, 1, 1.5, 2]);
    expect(planned.value.withheld).toEqual(["rgb_split", "glitch"]);
    const filter = segmentFilter(profile(), planned.value.segments[0], 320, 240, "grade.cube");
    expect(filter).toContain("lut3d=");
    expect(filter).not.toContain("rgbashift");
  });

  it("applies a slow-motion ramp and the channel split only on b-roll", () => {
    const planned = planStyleEdit({
      profile: profile({
        speed: { slow_motion_ratio: 0.5, fast_ratio: 0 },
        fx: { strobe: false, rgb_split: true, glitch: false },
      }),
      projectId: PROJECT,
      beats: [0, 0.5, 1, 1.5, 2],
      clips: [{ id: "plate", duration: 8, subject: "no_fendi", path: "plate.mp4" }],
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.value.segments[3].speed).toBe(0.5);
    expect(planned.value.segments[3].performance).toBe(false);
    const filter = segmentFilter(profile(), planned.value.segments[0], 320, 240, "grade.cube");
    expect(filter).toContain("rgbashift=rh=3:bh=-3");
    expect(planned.value.withheld).toEqual([]);
    const tool = planStyleFromToolArgs({
      project_id: PROJECT,
      profile: profile(),
      clips: [{ id: "plate", duration: 2, subject: "no_fendi" }],
      beats: [0, 1, 2],
    });
    expect(tool.ok).toBe(true);
  });
});

describe("style learn on a synthetic clip", () => {
  it("extracts a profile and renders a draft for $0", () => {
    const dir = mkdtempSync(join(tmpdir(), "style-learn-"));
    const reference = join(dir, "reference.mp4");
    const clicks = join(dir, "clicks.wav");
    execFileSync(
      "python3",
      [
        "-c",
        `import sys; sys.path.insert(0, "scripts/asset-store"); from beat_grid import write_click_wav; write_click_wav(${JSON.stringify(clicks)}, 120, 4)`,
      ],
      { cwd: ROOT },
    );
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=320x180:r=24:d=0.5",
      "-f",
      "lavfi",
      "-i",
      "color=c=white:s=320x180:r=24:d=0.083",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x2244aa:s=320x180:r=24:d=0.917",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x228844:s=320x180:r=24:d=0.75",
      "-i",
      clicks,
      "-filter_complex",
      "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0,pad=320:240:0:30:black,drawbox=x=40:y=190:w=240:h=18:color=white:t=fill[v]",
      "-map",
      "[v]",
      "-map",
      "4:a",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      reference,
    ]);
    const extracted = execFileSync("python3", ["scripts/style/extract_style.py", reference], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const doc = JSON.parse(extracted);
    const parsed = parseStyleProfile(doc);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.cost_usd).toBe(0);
    expect(parsed.value.frame.letterbox).toBe(true);
    expect(parsed.value.frame.bar_top).toBeGreaterThan(0.05);
    expect(parsed.value.shots.length).toBeGreaterThanOrEqual(2);
    expect(parsed.value.shots.some((shot) => shot.transition_out === "flash")).toBe(true);
    expect(parsed.value.overlays.text_presence).toBeGreaterThan(0);
    expect(parsed.value.cut_timing.on_beat_ratio).toBeGreaterThanOrEqual(0.5);
    expect(parsed.value.vision.status).toBe("off");
    expect(parsed.value.effects.some((effect) => effect.taxonomy_id === "flash" && effect.plain.includes("flashes white"))).toBe(true);
    expect(parsed.value.effects.every((effect) => effect.recipe.tier === "code")).toBe(true);
    expect(parsed.value.resolution.counts.generative).toBe(0);
    expect(parsed.value.resolution.counts.code).toBe(parsed.value.effects.length);
    expect(parsed.value.effects.find((effect) => effect.taxonomy_id === "flash")?.preview.thumbnail_jpeg_base64.length).toBeGreaterThan(20);
    expect(parsed.value.summary.length).toBeGreaterThan(20);
    const refused = execFileSync(
      "python3",
      ["scripts/style/extract_style.py", reference, "--vision"],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(JSON.parse(refused).vision.status).toBe("refused");
    const source = readFileSync(join(ROOT, "scripts/style/extract_style.py"), "utf8");
    expect(source).not.toMatch(/urllib|requests|openai|http\.client/);

    const take = join(dir, "take.mp4");
    const plate = join(dir, "plate.mp4");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x663311:s=320x240:r=24:d=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      take,
    ]);
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x112244:s=320x240:r=24:d=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      plate,
    ]);
    const clips = {
      project_id: PROJECT,
      width: 320,
      height: 240,
      fps: 24,
      song: clicks,
      clips: [
        { id: "take", path: take, duration: 2, subject: "fendi_performance" },
        { id: "plate", path: plate, duration: 2, subject: "no_fendi" },
      ],
    };
    writeFileSync(join(dir, "clips.json"), JSON.stringify(clips));
    writeFileSync(join(dir, "style.json"), JSON.stringify(doc));
    const out = join(dir, "draft");
    const rendered = execFileSync(
      "node",
      [
        "--experimental-strip-types",
        "scripts/style/apply_style.ts",
        "--profile",
        join(dir, "style.json"),
        "--clips",
        join(dir, "clips.json"),
        "--song",
        clicks,
        "--out",
        out,
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    expect(JSON.parse(rendered).cost_usd).toBe(0);
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          join(out, "draft.mp4"),
        ],
        { encoding: "utf8" },
      ),
    );
    expect(
      probe.streams.some((stream: { codec_type: string }) => stream.codec_type === "video"),
    ).toBe(true);
    expect(Number(probe.format.duration)).toBeGreaterThan(0.4);
    const edl = JSON.parse(readFileSync(join(out, "edl.json"), "utf8"));
    expect(
      edl.clips
        .filter((clip: { name: string }) => clip.name === "take")
        .every((clip: { speed: number }) => clip.speed === 1),
    ).toBe(true);
    const plan = planStyleEdit({
      profile: parsed.value,
      projectId: PROJECT,
      beats: [0, 0.5, 1, 1.5],
      clips: clips.clips as {
        id: string;
        path: string;
        duration: number;
        subject: "fendi_performance" | "no_fendi";
      }[],
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const args = ffmpegArgs(parsed.value, plan.value, {
      song: clicks,
      lut: "grade.cube",
      output: "draft.mp4",
    });
    expect(args).toContain("-filter_complex");
    expect(readFileSync(join(out, "grade.cube"), "utf8")).toContain("LUT_3D_SIZE 17");
  }, 60000);
});
