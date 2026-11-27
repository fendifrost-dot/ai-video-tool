/**
 * Stage camera-move reference clips.
 *
 *   node --experimental-strip-types scripts/camera-moves/render-references.ts --from /path/templates
 *     Copies each upstream pill.mp4 (the three.js render) into camera-moves/out/<id>.mp4
 *     and checks the sha256 against the catalog.
 *
 *   node --experimental-strip-types scripts/camera-moves/render-references.ts --raster CAM06-Orbit
 *     Rasterizes a grey blockout with ffmpeg when the upstream clip is not on disk.
 *     This is a stand-in. The MIT pill is the reference to store.
 *
 * Upload the mp4 to project-references/{userId}/{projectId}/camera-moves/{id}/pill.mp4.
 * Does not call fal. Does not upload.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { previewSegments } from "../../supabase/functions/_shared/cameraMoves/path.ts";
import type { CameraMove } from "../../supabase/functions/_shared/cameraMoves/types.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPath = resolve(root, "supabase/functions/_shared/cameraMoves/catalog.json");
const outDir = resolve(root, "camera-moves/out");

type Catalog = { moves: CameraMove[] };

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function raster(move: CameraMove, dest: string): Promise<void> {
  const width = 640;
  const height = 360;
  const fps = 12;
  const frames = Math.max(fps * 2, Math.round(Math.min(move.durationSec, 8) * fps));
  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${width}x${height}`,
      "-r",
      String(fps),
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      dest,
    ],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  const hint = `${move.name} ${move.numbers} ${move.says}`;
  const errors: Buffer[] = [];
  ffmpeg.stderr?.on("data", (chunk) => errors.push(chunk));
  for (let frame = 0; frame < frames; frame++) {
    const pixels = Buffer.alloc(width * height * 3, 18);
    for (const segment of previewSegments(move.kind, frame / frames, hint, width, height)) {
      const steps = Math.max(1, Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1));
      for (let step = 0; step <= steps; step++) {
        const x = Math.round(segment.x1 + ((segment.x2 - segment.x1) * step) / steps);
        const y = Math.round(segment.y1 + ((segment.y2 - segment.y1) * step) / steps);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const offset = (y * width + x) * 3;
        pixels[offset] = segment.tone;
        pixels[offset + 1] = segment.tone;
        pixels[offset + 2] = segment.tone;
      }
    }
    ffmpeg.stdin?.write(pixels);
  }
  ffmpeg.stdin?.end();
  return new Promise((done, reject) => {
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code === 0) done();
      else reject(new Error(Buffer.concat(errors).toString().slice(-500) || `ffmpeg ${code}`));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const fromIndex = args.indexOf("--from");
  const from = fromIndex >= 0 ? args[fromIndex + 1] : "";
  const rasterIndex = args.indexOf("--raster");
  const rasterId = rasterIndex >= 0 ? args[rasterIndex + 1] : "";
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Catalog;
  mkdirSync(outDir, { recursive: true });
  const manifest: {
    id: string;
    file: string;
    sha256: string;
    source: string;
    matchesCatalog: boolean;
  }[] = [];
  const chosen = rasterId ? catalog.moves.filter((move) => move.id === rasterId) : catalog.moves;
  if (rasterId && chosen.length === 0) throw new Error(`No move ${rasterId}`);
  for (const move of chosen) {
    const dest = resolve(outDir, `${move.id}.mp4`);
    let source = "avt-raster";
    if (from && !rasterId) {
      copyFileSync(resolve(from, move.id, "pill.mp4"), dest);
      source = "upstream-threejs";
    } else {
      await raster(move, dest);
    }
    const hash = sha256(dest);
    manifest.push({
      id: move.id,
      file: dest,
      sha256: hash,
      source,
      matchesCatalog: hash === move.pillSha256,
    });
    console.log(`${move.id} ${source} ${hash === move.pillSha256 ? "hash-ok" : "hash-differs"}`);
  }
  writeFileSync(
    resolve(outDir, "manifest.json"),
    JSON.stringify(
      {
        bucket: "project-references",
        keyPattern: "{userId}/{projectId}/camera-moves/{id}/pill.mp4",
        clips: manifest,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${manifest.length} clips to ${outDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
