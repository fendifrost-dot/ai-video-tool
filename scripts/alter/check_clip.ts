/**
 * Score a local draft against its take. $0. Does not call a provider.
 *
 *   node --experimental-strip-types scripts/alter/check_clip.ts take.mp4 draft.mp4 --mode swap
 *
 * Mouth landmarks are not read here. Pass --mouth-source and --mouth-output as
 * comma-separated openness values (lip gap / face width) from mouth_scan.py.
 * A performance without them is CHECK.
 */
import { spawnSync } from "node:child_process";
import { checkAlter } from "../../supabase/functions/_shared/alter/check.ts";
import type {
  CheckMode,
  GrayFrame,
  MouthFrame,
} from "../../supabase/functions/_shared/alter/types.ts";

function frames(path: string): GrayFrame[] {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=nb_frames",
      "-of",
      "csv=p=0",
      path,
    ],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) throw new Error(probe.stderr || `ffprobe ${path}`);
  const width = 160;
  const height = 90;
  const raw = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-vf",
      `scale=${width}:${height},format=gray`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (raw.status !== 0) throw new Error(raw.stderr?.toString() || `ffmpeg ${path}`);
  const bytes = raw.stdout as Buffer;
  const size = width * height;
  const count = Math.floor(bytes.length / size);
  const out: GrayFrame[] = [];
  for (let i = 0; i < count; i++)
    out.push({ width, height, data: new Uint8Array(bytes.subarray(i * size, (i + 1) * size)) });
  return out;
}

function series(flag: string, argv: string[]): MouthFrame[] | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return argv[index + 1].split(",").map((value) => ({ openness: Number(value) }));
}

const argv = process.argv.slice(2);
const mode = (argv[argv.indexOf("--mode") + 1] ?? "swap") as CheckMode;
const performance = !argv.includes("--not-performance");
const identityIndex = argv.indexOf("--identity");
const report = checkAlter({
  source: frames(argv[0]),
  output: frames(argv[1]),
  mode,
  performance,
  mouthSource: series("--mouth-source", argv),
  mouthOutput: series("--mouth-output", argv),
  identityDistance: identityIndex >= 0 ? Number(argv[identityIndex + 1]) : null,
});
console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict === "PASS" ? 0 : 1);
