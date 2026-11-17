/**
 * Apply a style profile to local clips and render a draft. CPU, ffmpeg, $0.
 *
 *   npx tsx scripts/style/apply_style.ts --profile style.json --clips clips.json --out style-draft
 *   node --experimental-strip-types scripts/style/apply_style.ts --profile style.json --clips clips.json --out style-draft
 *
 * clips.json: { "project_id", "clips": [{ "id", "path", "duration", "subject" }], "song"?: path, "beats"?: number[] }
 * subject is fendi_performance, ai_broll, or no_fendi. A performance take stays at speed 1.
 * --dry-run writes the EDL, the LUT, and the ffmpeg command and does not encode.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  beatsFromGrid,
  ffmpegArgs,
  parseStyleProfile,
  planStyleEdit,
  type StyleClipInput,
  type StyleSubject,
} from "../../supabase/functions/_shared/styleLearn.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function onsets(song: string): number[] {
  const code = [
    "import json, sys",
    'sys.path.insert(0, "scripts/asset-store")',
    "from beat_grid import load_audio, onsets",
    "samples, rate = load_audio(sys.argv[1])",
    "print(json.dumps([hit / rate for hit in onsets(samples, rate)]))",
  ].join("\n");
  const out = execFileSync("python3", ["-c", code, song], { cwd: ROOT, encoding: "utf8" });
  const times = JSON.parse(out) as unknown;
  if (!Array.isArray(times) || times.some((time) => typeof time !== "number"))
    throw new Error("onset detector returned no times");
  return times as number[];
}

function main() {
  const profilePath = arg("--profile");
  const clipsPath = arg("--clips");
  const outDir = arg("--out");
  if (!profilePath || !clipsPath || !outDir) {
    throw new Error(
      "usage: apply_style.ts --profile style.json --clips clips.json --out <dir> [--beat-grid beats.json] [--song song.wav] [--dry-run]",
    );
  }
  const parsed = parseStyleProfile(JSON.parse(readFileSync(profilePath, "utf8")));
  if (!parsed.ok) throw new Error(parsed.error);
  const spec = JSON.parse(readFileSync(clipsPath, "utf8")) as {
    project_id?: string;
    fps?: number;
    width?: number;
    height?: number;
    song?: string;
    song_asset_id?: string;
    beats?: number[];
    beat_grid?: unknown;
    clips?: {
      id: string;
      path: string;
      duration: number;
      subject: StyleSubject;
      asset_id?: string;
      shot_id?: string;
    }[];
  };
  if (!spec.clips?.length) throw new Error("clips.json needs a clips array");
  const song = arg("--song") || spec.song || null;
  const gridPath = arg("--beat-grid");
  let beats = spec.beats ?? [];
  if (gridPath) {
    const fromGrid = beatsFromGrid(JSON.parse(readFileSync(gridPath, "utf8")));
    if (!fromGrid) throw new Error("beat grid could not be read");
    beats = fromGrid;
  } else if (spec.beat_grid) {
    const fromGrid = beatsFromGrid(spec.beat_grid);
    if (!fromGrid) throw new Error("beat grid could not be read");
    beats = fromGrid;
  } else if (!beats.length && song) {
    beats = onsets(song);
  }
  const clips: StyleClipInput[] = spec.clips.map((clip) => ({
    id: clip.id,
    path: clip.path,
    duration: clip.duration,
    subject: clip.subject,
    assetId: clip.asset_id ?? null,
    shotId: clip.shot_id ?? null,
  }));
  const planned = planStyleEdit({
    profile: parsed.value,
    clips,
    beats,
    projectId: spec.project_id || "00000000-0000-4000-8000-000000000000",
    fps: spec.fps,
    width: spec.width,
    height: spec.height,
    songAssetId: spec.song_asset_id ?? null,
  });
  if (!planned.ok) throw new Error(planned.error);
  mkdirSync(outDir, { recursive: true });
  const lutPath = join(outDir, "grade.cube");
  const output = join(outDir, "draft.mp4");
  writeFileSync(join(outDir, "style.json"), JSON.stringify(parsed.value, null, 2));
  writeFileSync(join(outDir, "edl.json"), JSON.stringify(planned.value.edl, null, 2));
  writeFileSync(lutPath, planned.value.lut);
  const args = ffmpegArgs(parsed.value, planned.value, {
    song,
    lut: "grade.cube",
    output: "draft.mp4",
  });
  const record = {
    cost_usd: 0,
    rendered: false,
    withheld: planned.value.withheld,
    notes: planned.value.ffmpeg_notes,
    command: ["ffmpeg", ...args],
  };
  if (process.argv.includes("--dry-run")) {
    writeFileSync(join(outDir, "render.json"), JSON.stringify(record, null, 2));
    console.log(
      JSON.stringify({
        ok: true,
        dry_run: true,
        out: outDir,
        segments: planned.value.segments.length,
        cost_usd: 0,
      }),
    );
    return;
  }
  const run = spawnSync("ffmpeg", args, { cwd: outDir, encoding: "utf8" });
  if (run.status !== 0) {
    writeFileSync(
      join(outDir, "render.json"),
      JSON.stringify({ ...record, error: run.stderr }, null, 2),
    );
    throw new Error(run.stderr || "ffmpeg failed");
  }
  record.rendered = true;
  writeFileSync(join(outDir, "render.json"), JSON.stringify(record, null, 2));
  console.log(
    JSON.stringify({
      ok: true,
      out: output,
      segments: planned.value.segments.length,
      cost_usd: 0,
      withheld: planned.value.withheld,
    }),
  );
}

main();
