/**
 * Decode a playable reconstructed MP4 to RGBA rasters for Lane E2.
 * Node/script only (ffmpeg). Hero Frame must not import this module —
 * pass already-decoded frames into evaluatePlayableVideoQa instead.
 *
 * Browser live Export has no ffmpeg: keep encode-first INCOMPLETE
 * (awaiting decoded_frames) when rasters are not supplied.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegAvailable, probePlayableMp4 } from "./encodeMp4";
import type { PlayableDecodedRgba } from "./videoQaPlug";

export type { PlayableDecodedRgba } from "./videoQaPlug";

export type DecodePlayableMp4Ok = {
  ok: true;
  decoder: "ffmpeg";
  width: number;
  height: number;
  fps: number;
  sourceFrameCount: number;
  frameCount: number;
  frames: PlayableDecodedRgba[];
};

export type DecodePlayableMp4Fail = {
  ok: false;
  decoder: "ffmpeg" | "none";
  code: "ffmpeg_not_available" | "ffprobe_failed" | "decode_failed" | "size_mismatch" | "empty";
  message: string;
};

export type DecodePlayableMp4Result = DecodePlayableMp4Ok | DecodePlayableMp4Fail;

export type DecodePlayableMp4Input = {
  mp4Path?: string;
  mp4Bytes?: Uint8Array;
  /** Hard cap. Omit to decode all. Browser live Export defaults to 72 with fallback. */
  maxFrames?: number;
  /** 0-based source index to start. */
  startFrame?: number;
  workDir?: string;
};

function fail(
  code: DecodePlayableMp4Fail["code"],
  message: string,
  decoder: DecodePlayableMp4Fail["decoder"] = "ffmpeg",
): DecodePlayableMp4Fail {
  return { ok: false, decoder, code, message };
}

function rgbaFromRaw(
  raw: Uint8Array,
  width: number,
  height: number,
  index: number,
): PlayableDecodedRgba {
  const stride = width * height * 4;
  const offset = index * stride;
  const data = new Uint8Array(stride);
  data.set(raw.subarray(offset, offset + stride));
  return { index, image: { width, height, data } };
}

/**
 * ffmpeg → raw RGBA. Writes a temp `.raw` (spawnSync stdout maxBuffer is 1 MB).
 */
export function decodePlayableMp4(input: DecodePlayableMp4Input): DecodePlayableMp4Result {
  if (!ffmpegAvailable()) {
    return fail("ffmpeg_not_available", "ffmpeg_not_available", "none");
  }

  const ownedDir = input.workDir ? null : mkdtempSync(join(tmpdir(), "playable-decode-"));
  const workDir = input.workDir ?? ownedDir!;
  mkdirSync(workDir, { recursive: true });
  let mp4Path = input.mp4Path;
  try {
    if (!mp4Path) {
      if (!input.mp4Bytes || input.mp4Bytes.byteLength === 0) {
        return fail("empty", "decode_empty_mp4");
      }
      mp4Path = join(workDir, "source.mp4");
      writeFileSync(mp4Path, input.mp4Bytes);
    }

    const startFrame = Math.max(0, Math.floor(input.startFrame ?? 0));
    const probed = probePlayableMp4(mp4Path, {
      expectedFrames: 1,
      expectedFps: 24,
      audioPresent: false,
    });
    if (!probed.ok) {
      return fail("ffprobe_failed", probed.message);
    }

    const { width, height, fps, frameCount: sourceFrameCount } = probed.claims;
    if (sourceFrameCount <= 0) return fail("empty", "decode_empty_source");
    if (startFrame >= sourceFrameCount) {
      return fail("empty", `startFrame ${startFrame} >= sourceFrameCount ${sourceFrameCount}`);
    }

    const remaining = sourceFrameCount - startFrame;
    const frameCount = Math.min(remaining, Math.max(1, input.maxFrames ?? remaining));
    const rawPath = join(workDir, "frames.rgba");
    const args = ["-y", "-loglevel", "error", "-i", mp4Path, "-an"];
    if (startFrame > 0) {
      args.push("-vf", `select=gte(n\\,${startFrame})`);
    }
    args.push(
      "-vsync",
      "0",
      "-frames:v",
      String(frameCount),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      rawPath,
    );

    const decoded = spawnSync("ffmpeg", args, { encoding: "utf8" });
    if (decoded.status !== 0) {
      return fail("decode_failed", `ffmpeg_decode_failed: ${decoded.stderr || decoded.stdout}`);
    }

    const raw = new Uint8Array(readFileSync(rawPath));
    const stride = width * height * 4;
    if (raw.byteLength !== stride * frameCount) {
      return fail(
        "size_mismatch",
        `raw bytes ${raw.byteLength} != ${frameCount}×${width}×${height}×4 (${stride * frameCount})`,
      );
    }

    const frames: PlayableDecodedRgba[] = [];
    for (let i = 0; i < frameCount; i++) {
      const fr = rgbaFromRaw(raw, width, height, i);
      frames.push({ index: startFrame + i, image: fr.image });
    }

    return {
      ok: true,
      decoder: "ffmpeg",
      width,
      height,
      fps,
      sourceFrameCount,
      frameCount,
      frames,
    };
  } finally {
    if (ownedDir) {
      rmSync(ownedDir, { recursive: true, force: true });
    }
  }
}
