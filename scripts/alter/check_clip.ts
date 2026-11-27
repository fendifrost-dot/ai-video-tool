/**
 * Score a local draft against its take. $0. Does not call a provider.
 *
 *   node --experimental-strip-types scripts/alter/check_clip.ts take.mp4 draft.mp4 --mode swap
 *
 * His mouth and face come from scripts/alter/track_mouth.py (local, $0):
 *
 *   python -I scripts/alter/track_mouth.py track take.mp4 take.json
 *   python -I scripts/alter/track_mouth.py track draft.mp4 draft.json
 *   python -I scripts/alter/track_mouth.py score take.json draft.json --out score.json
 *   node --experimental-strip-types scripts/alter/check_clip.ts take.mp4 draft.mp4 --mode swap \
 *     --track-source take.json --track-output draft.json --score score.json
 *
 * --score supplies the identity distance (null when the ArcFace file is not on disk: the shot is then CHECK).
 * --mouth-source / --mouth-output still take comma-separated openness values. A performance with neither is CHECK.
 */
import { readFileSync } from "node:fs";
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

type TrackFrame = { found?: boolean; openness?: number; lips?: number[][] };

/** A track written by track_mouth.py -> one MouthFrame per frame (lip points in face coordinates). */
function track(flag: string, argv: string[]): MouthFrame[] | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const parsed = JSON.parse(readFileSync(argv[index + 1], "utf8")) as { frames: TrackFrame[] };
  return parsed.frames.map((frame) =>
    frame.found && typeof frame.openness === "number"
      ? {
          found: true,
          openness: frame.openness,
          points: frame.lips?.map(([x, y]) => ({ x, y })),
        }
      : { found: false, openness: Number.NaN },
  );
}

function scoreFile(argv: string[]): { identity_distance?: number | null } | null {
  const index = argv.indexOf("--score");
  return index < 0 ? null : JSON.parse(readFileSync(argv[index + 1], "utf8"));
}

const argv = process.argv.slice(2);
const mode = (argv[argv.indexOf("--mode") + 1] ?? "swap") as CheckMode;
const performance = !argv.includes("--not-performance");
const identityIndex = argv.indexOf("--identity");
const scored = scoreFile(argv);
const report = checkAlter({
  source: frames(argv[0]),
  output: frames(argv[1]),
  mode,
  performance,
  mouthSource: track("--track-source", argv) ?? series("--mouth-source", argv),
  mouthOutput: track("--track-output", argv) ?? series("--mouth-output", argv),
  identityDistance:
    identityIndex >= 0 ? Number(argv[identityIndex + 1]) : (scored?.identity_distance ?? null),
});
console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict === "PASS" ? 0 : 1);
