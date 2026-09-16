/**
 * Encode reconstructed RGBA frames to a playable H.264 MP4 via ffmpeg.
 * Node/script only. Hero Frame does not call this.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { RgbaImage } from "../types";
import type { PlayableAudioClaims, PlayableMp4Claims } from "./contract";

export type EncodedFrame = {
  index: number;
  image: RgbaImage;
};

function writePpm(path: string, image: RgbaImage): void {
  const header = Buffer.from(`P6\n${image.width} ${image.height}\n255\n`);
  const rgb = Buffer.alloc(image.width * image.height * 3);
  for (let i = 0, p = 0, q = 0; i < image.width * image.height; i++, p += 4, q += 3) {
    rgb[q] = image.data[p]!;
    rgb[q + 1] = image.data[p + 1]!;
    rgb[q + 2] = image.data[p + 2]!;
  }
  writeFileSync(path, Buffer.concat([header, rgb]));
}

export function ffmpegAvailable(): boolean {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return r.status === 0;
}

export function encodePlayableMp4(input: {
  frames: EncodedFrame[];
  fps: number;
  outPath: string;
  workDir: string;
  audioPath?: string;
}): { ok: true; claims: PlayableMp4Claims } | { ok: false; message: string } {
  if (input.frames.length === 0) return { ok: false, message: "encode_empty_frames" };
  if (!ffmpegAvailable()) return { ok: false, message: "ffmpeg_not_available" };

  const { width, height } = input.frames[0]!.image;
  mkdirSync(input.workDir, { recursive: true });
  const sorted = [...input.frames].sort((a, b) => a.index - b.index);
  for (let i = 0; i < sorted.length; i++) {
    const fr = sorted[i]!;
    if (fr.image.width !== width || fr.image.height !== height) {
      return { ok: false, message: "encode_size_mismatch" };
    }
    writePpm(join(input.workDir, `frame_${String(i).padStart(4, "0")}.ppm`), fr.image);
  }

  const args = [
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    String(input.fps),
    "-i",
    join(input.workDir, "frame_%04d.ppm"),
  ];
  if (input.audioPath && existsSync(input.audioPath)) {
    args.push("-i", input.audioPath, "-c:a", "aac", "-shortest");
  }
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", input.outPath);

  const enc = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (enc.status !== 0) {
    return { ok: false, message: `ffmpeg_encode_failed: ${enc.stderr || enc.stdout}` };
  }

  const probed = probePlayableMp4(input.outPath, {
    expectedFrames: sorted.length,
    expectedFps: input.fps,
    audioPresent: Boolean(input.audioPath && existsSync(input.audioPath)),
  });
  if (!probed.ok) return probed;
  return { ok: true, claims: probed.claims };
}

export function probePlayableMp4(
  mp4Path: string,
  opts: { expectedFrames: number; expectedFps: number; audioPresent: boolean },
): { ok: true; claims: PlayableMp4Claims } | { ok: false; message: string } {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,codec_name,codec_type,avg_frame_rate,nb_frames,pix_fmt,duration",
      "-show_entries",
      "format=duration,format_name",
      "-of",
      "json",
      mp4Path,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) return { ok: false, message: `ffprobe_failed: ${r.stderr || r.stdout}` };

  let json: {
    streams?: Array<Record<string, string>>;
    format?: { duration?: string; format_name?: string };
  };
  try {
    json = JSON.parse(r.stdout) as typeof json;
  } catch {
    return { ok: false, message: "ffprobe_json_invalid" };
  }

  const stream = json.streams?.[0] ?? {};
  const width = Number(stream.width);
  const height = Number(stream.height);
  const codec = typeof stream.codec_name === "string" ? stream.codec_name : "unknown";
  const pix = typeof stream.pix_fmt === "string" ? stream.pix_fmt : "unknown";
  const container = json.format?.format_name ?? "unknown";
  const rate = typeof stream.avg_frame_rate === "string" ? stream.avg_frame_rate : "0/1";
  const [num, den] = rate.split("/").map((n) => Number(n));
  const fps = den && den > 0 ? num / den : opts.expectedFps;
  const durationSec = Number(json.format?.duration ?? stream.duration ?? opts.expectedFrames / fps);
  const nbFrames = Number(stream.nb_frames);
  const frameCount = Number.isFinite(nbFrames) && nbFrames > 0 ? nbFrames : opts.expectedFrames;

  const audio: PlayableAudioClaims = opts.audioPresent
    ? {
        present: true,
        preserved: true,
        sync: true,
        note: "source audio muxed; container duration follows video (-shortest)",
      }
    : {
        present: false,
        preserved: null,
        sync: null,
        note: "source pack has no audio track (still-derived 720×1280 working raster)",
      };

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { ok: false, message: "ffprobe_missing_dimensions" };
  }

  return {
    ok: true,
    claims: {
      width,
      height,
      frameCount,
      fps,
      durationSec,
      codec,
      container,
      pixelFormat: pix,
      audio,
    },
  };
}
