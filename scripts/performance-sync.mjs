#!/usr/bin/env node
// Measure a performance file against the song master. Zero spend. Does not write a sync row.
//
//   node --experimental-strip-types scripts/performance-sync.mjs --song song.wav --take take.mp4
//
// Refuses a file with no audio stream. Prints offset, drift and confidence.
// A negative offset means the camera was rolling before the song started.
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const song = get("--song");
const take = get("--take");
if (!song || !take) {
  console.error(
    "usage: node --experimental-strip-types scripts/performance-sync.mjs --song <wav> --take <video>",
  );
  process.exit(2);
}

function hasAudio(path) {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      path,
    ],
    { encoding: "utf8" },
  );
  return probe.status === 0 && probe.stdout.includes("audio");
}

if (!hasAudio(song) || !hasAudio(take)) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "no_audio",
      message: "the song or the take has no audio track. Nothing was written.",
    }),
  );
  process.exit(3);
}

function pcm(path) {
  const run = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-af",
      "highpass=f=150,lowpass=f=4000",
      "-f",
      "f32le",
      "pipe:1",
    ],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  if (run.status !== 0) {
    console.error(run.stderr?.toString() || "ffmpeg failed");
    process.exit(1);
  }
  return new Float32Array(run.stdout.buffer, run.stdout.byteOffset, run.stdout.byteLength / 4);
}

const dir = mkdtempSync(join(tmpdir(), "avt-sync-"));
const songPcm = pcm(song);
const takePcm = pcm(take);
const songPath = join(dir, "song.f32");
const takePath = join(dir, "take.f32");
writeFileSync(songPath, Buffer.from(songPcm.buffer, songPcm.byteOffset, songPcm.byteLength));
writeFileSync(takePath, Buffer.from(takePcm.buffer, takePcm.byteOffset, takePcm.byteLength));
const alignMod = pathToFileURL(
  join(new URL("..", import.meta.url).pathname, "src/lib/storyboard/performanceAlign.ts"),
).href;
const runner = `
import { readFileSync } from "node:fs";
import { alignPerformance } from ${JSON.stringify(alignMod)};
const songBytes = readFileSync(process.argv[2]);
const takeBytes = readFileSync(process.argv[3]);
const song = new Float32Array(songBytes.buffer, songBytes.byteOffset, songBytes.byteLength / 4);
const take = new Float32Array(takeBytes.buffer, takeBytes.byteOffset, takeBytes.byteLength / 4);
console.log(JSON.stringify(alignPerformance({ song, take, sampleRate: 16000 })));
`;
writeFileSync(join(dir, "run.mts"), runner);
const run = spawnSync(
  process.execPath,
  ["--experimental-strip-types", join(dir, "run.mts"), songPath, takePath],
  {
    encoding: "utf8",
  },
);
if (run.stdout) process.stdout.write(run.stdout);
if (run.status !== 0) {
  console.error(run.stderr);
  process.exit(run.status ?? 1);
}
