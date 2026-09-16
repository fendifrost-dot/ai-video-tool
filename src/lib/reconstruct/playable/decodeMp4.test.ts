import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { uniqueOriginal } from "../fixtures/syntheticMaster";
import { encodePlayableMp4, ffmpegAvailable } from "./encodeMp4";
import { decodePlayableMp4 } from "./decodeMp4";
import {
  PLAYABLE_MP4_BYTE_LENGTH,
  PLAYABLE_MP4_RELATIVE_PATH,
  PLAYABLE_MP4_SHA256,
  committedPlayableMp4Ref,
  evaluatePlayableVideoQa,
} from "./videoQaPlug";

describe("decodePlayableMp4", () => {
  it("returns ffmpeg_not_available without throwing when ffmpeg is missing", () => {
    if (ffmpegAvailable()) {
      expect(ffmpegAvailable()).toBe(true);
      return;
    }
    const result = decodePlayableMp4({ mp4Path: PLAYABLE_MP4_RELATIVE_PATH, maxFrames: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ffmpeg_not_available");
  });

  it("decodes RGBA from a tiny encoded fixture and scores frames>0", () => {
    if (!ffmpegAvailable()) {
      expect(ffmpegAvailable()).toBe(false);
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "playable-decode-fix-"));
    try {
      const frames = [0, 1, 2].map((index) => ({
        index,
        image: uniqueOriginal(48, 64),
      }));
      const outPath = join(dir, "tiny.mp4");
      const encoded = encodePlayableMp4({
        frames,
        fps: 24,
        outPath,
        workDir: join(dir, "ppm"),
      });
      expect(encoded.ok).toBe(true);
      if (!encoded.ok) return;

      const decoded = decodePlayableMp4({
        mp4Path: outPath,
        maxFrames: 3,
        workDir: join(dir, "raw"),
      });
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) return;
      expect(decoded.frameCount).toBe(3);
      expect(decoded.width).toBe(48);
      expect(decoded.height).toBe(64);
      expect(decoded.frames[0]!.image.data.length).toBe(48 * 64 * 4);
      expect(decoded.frames.some((f) => f.image.data[0] !== 0 || f.image.data[1] !== 0)).toBe(true);

      const { report } = evaluatePlayableVideoQa({
        mp4: {
          produced: true,
          artifactId: "tiny-fixture",
          path: outPath,
          mimeType: "video/mp4",
        },
        decodedFrames: decoded.frames,
        includeDecodedFrames: false,
      });
      expect(report.frameCount).toBe(3);
      expect(report.frameCount).toBeGreaterThan(0);
      expect(report.awaiting).not.toContain("decoded_frames");
      expect(report.verdict).not.toBe("INCOMPLETE");
      expect(report.criteria.find((c) => c.id === "mp4_artifact_scored")?.verdict).toBe("PASS");
      expect(report.stillGoldensReopened).toBe(false);
      expect(report.paidCalls).toBe(false);
      expect(report.blockingArtifactProducer).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("decodes the committed 72-frame gate MP4 (bounded) and E2 scores frames>0", () => {
    if (!ffmpegAvailable()) {
      expect(ffmpegAvailable()).toBe(false);
      return;
    }
    const bytes = readFileSync(PLAYABLE_MP4_RELATIVE_PATH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(PLAYABLE_MP4_SHA256);
    expect(bytes.byteLength).toBe(PLAYABLE_MP4_BYTE_LENGTH);

    const decoded = decodePlayableMp4({
      mp4Bytes: bytes,
      maxFrames: 4,
    });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.sourceFrameCount).toBe(72);
    expect(decoded.frameCount).toBe(4);
    expect(decoded.width).toBe(720);
    expect(decoded.height).toBe(1280);
    expect(decoded.frames.map((f) => f.index)).toEqual([0, 1, 2, 3]);

    const { report, json } = evaluatePlayableVideoQa({
      mp4: committedPlayableMp4Ref(),
      decodedFrames: decoded.frames,
      includeDecodedFrames: false,
    });
    expect(report.frameCount).toBe(4);
    expect(report.frameCount).toBeGreaterThan(0);
    expect(report.awaiting).not.toContain("decoded_frames");
    expect(report.verdict).not.toBe("INCOMPLETE");
    expect(report.failCount).toBe(0);
    expect(report.criteria.find((c) => c.id === "mp4_artifact_scored")?.verdict).toBe("PASS");
    expect(report.criteria.find((c) => c.id === "paid_calls_false")?.verdict).toBe("PASS");
    expect(report.criteria.find((c) => c.id === "still_goldens_not_reopened")?.verdict).toBe(
      "PASS",
    );
    expect(report.stillGoldensReopened).toBe(false);
    expect(report.paidCalls).toBe(false);
    expect(json.frameCount).toBe(4);
    expect(json.mp4?.sha256).toBe(PLAYABLE_MP4_SHA256);
  });
});
