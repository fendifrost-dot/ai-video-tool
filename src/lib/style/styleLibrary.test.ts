// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseStyleProfile,
  planStyleEdit,
  type StyleProfile,
} from "../../../supabase/functions/_shared/styleLearn";
import {
  STYLE_TAXONOMY,
  composeStyle,
  effectsFromSignals,
  foldEffects,
  resolutionShare,
  searchEffects,
  timeInQuery,
} from "../../../supabase/functions/_shared/styleLibrary";

const rhythm = {
  format: "avt.style_profile",
  format_version: 1,
  cost_usd: 0,
  summary: "Hard cuts on the beat, nothing generated.",
  source: { label: "rhythm", duration_seconds: 2, width: 320, height: 240, fps: 24 },
  shots: [
    {
      index: 0,
      start: 0,
      end: 2,
      transition_out: "hard_cut",
      speed: 1,
      motion: { zoom: 0, shake: 0, intensity: 0 },
      grade: { contrast: 1, saturation: 1, grain: 0, vignette: 0, lift: 0, gamma: 1, gain: 1 },
      fx: [],
    },
  ],
  shot_length: { count: 1, mean: 2, median: 0.5, p10: 0.5, p90: 2 },
  cut_timing: { on_beat_ratio: 1, median_offset_seconds: 0, prefer: "beat" },
  transitions: { hard_cut: 1, crossfade: 0, flash: 0, whip: 0 },
  speed: { slow_motion_ratio: 0, fast_ratio: 0 },
  camera: { zoom: 0, shake: 0, intensity: 0 },
  grade: { contrast: 1, saturation: 1, grain: 0, vignette: 0, lift: 0, gamma: 1, gain: 1 },
  frame: { aspect: "4:3", letterbox: false, bar_top: 0, bar_bottom: 0, bar_left: 0, bar_right: 0 },
  overlays: { text_presence: 0 },
  fx: { strobe: false, rgb_split: false, glitch: false },
  vision: { enabled: false, labels: [], status: "off" },
  fidelity: {
    matched: [
      "shot boundaries",
      "shot-length distribution",
      "hard cuts",
      "flash and white frames",
      "letterbox and aspect",
      "average contrast and saturation",
      "cut timing against audio onsets",
      "starter-taxonomy effects whose signal fires",
    ],
    approximated: [
      "crossfades and whip pans",
      "speed ramps and slow motion",
      "zoom and shake intensity",
      "color grade as lift, gamma, gain and a generated LUT",
      "grain and vignette amount",
      "text and caption overlays",
      "strobe, RGB split, and glitch",
      "vision-model labels",
      "unclassified visual events",
    ],
  },
  detectors: { scenes: "chroma-distance", audio: "none", vision: "off", sample_fps: 24 },
} as const;

function profile(): StyleProfile {
  const parsed = parseStyleProfile(rhythm);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

describe("effect recipes", () => {
  it("rebuilds a white flash in code and only maps new content onto an existing AVT tool", () => {
    const effects = effectsFromSignals([
      { start: 0.4, end: 0.5, signals: { luma_spike: 0.9 } },
      { start: 1, end: 1.2, signals: { new_scene: 0.8 } },
      { start: 2, end: 2.3, signals: { luma_spike: 0.2, color_jump: 0.1 } },
    ]);
    const flash = effects.find((effect) => effect.taxonomy_id === "flash");
    const scene = effects.find((effect) => effect.taxonomy_id === "new_scene");
    expect(flash?.recipe.tier).toBe("code");
    expect(flash?.plain).toMatch(/flashes white/);
    expect(scene?.recipe.tier).toBe("generative");
    expect(scene?.recipe.avt_function).toBe("world-still-proxy");
    expect(scene?.recipe.avt_route).toBe("gemini-nano-banana-2.1");
    expect(scene?.recipe.why).toMatch(/does not call/);
    expect(scene?.recipe.why).not.toMatch(/new integration|new model route/);
    const share = resolutionShare(effects);
    expect(share.counts.code).toBeGreaterThan(0);
    expect(share.counts.generative).toBe(1);
    expect(share.code + share.local_model + share.generative).toBeCloseTo(1, 5);
    const garment = STYLE_TAXONOMY.find((entry) => entry.id === "garment_replacement");
    expect(garment?.recipe.avt_function).toBe("dress-clip");
    expect(STYLE_TAXONOMY.find((entry) => entry.id === "face_morph")?.recipe.why).toMatch(
      /not used on Fendi/,
    );
    expect(STYLE_TAXONOMY.find((entry) => entry.id === "rotoscope")?.recipe.tier).toBe(
      "local_model",
    );
    expect(STYLE_TAXONOMY.find((entry) => entry.id === "rotoscope")?.recipe.why).toMatch(
      /MediaPipe/,
    );
  });

  it("finds an effect by plain words or by a timestamp, and mixes one style's rhythm with another's flash", () => {
    const flash = effectsFromSignals([{ start: 42, end: 42.2, signals: { luma_spike: 0.95 } }])[0];
    expect(timeInQuery("the thing at 0:42")).toBe(42);
    expect(searchEffects([flash], "the screen flashes white")[0]?.id).toBe(flash.id);
    expect(searchEffects([flash], "the thing at 0:42")[0]?.taxonomy_id).toBe("flash");
    const quiet = effectsFromSignals([{ start: 0, end: 0.2, signals: { luma_spike: 0.1 } }]);
    expect(quiet).toEqual([]);
    const odd = effectsFromSignals([
      { start: 1, end: 1.4, signals: { luma_spike: 0.5, color_jump: 0.6 } },
    ]);
    expect(odd[0]?.taxonomy_id).toBe("unclassified");
    expect(odd[0]?.recipe.tier).toBe("code");
    const mixed = composeStyle(profile(), [flash]);
    expect(mixed.transitions.flash).toBeGreaterThan(0);
    expect(mixed.cut_timing.prefer).toBe("beat");
    expect(mixed.summary).toMatch(/flashes white/);
    const planned = planStyleEdit({
      profile: mixed,
      projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
      beats: [0, 0.5, 1],
      clips: [{ id: "take", duration: 2, subject: "fendi_performance" }],
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.value.edl.clips.every((clip) => clip.speed === 1)).toBe(true);
    const again = foldEffects([flash], [{ ...flash, id: "fx-9", source_label: "other video" }]);
    expect(again.merged).toEqual([{ id: "fx-9", variant_of: flash.id }]);
    expect(again.effects.filter((effect) => !effect.variant_of)).toHaveLength(1);
  });
});

describe("per-frame recipe", () => {
  it("sorts pixels of a filmed frame without a model", () => {
    const dir = mkdtempSync(join(tmpdir(), "style-recipe-"));
    const src = join(dir, "in.mp4");
    const out = join(dir, "out.mp4");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x884422:s=64x48:r=12:d=0.4,noise=alls=20:allf=t",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      src,
    ]);
    execFileSync(
      "python3",
      ["scripts/style/recipes.py", "--recipe", "pixel_sort", "--in", src, "--out", out],
      {
        cwd: new URL("../../..", import.meta.url).pathname,
      },
    );
    const probe = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", out],
      { encoding: "utf8" },
    );
    expect(Number(probe.trim())).toBeGreaterThan(0.2);
  });
});
