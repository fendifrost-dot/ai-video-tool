import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { uniqueOriginal } from "../fixtures/syntheticMaster";
import { encodePlayableMp4, ffmpegAvailable } from "./encodeMp4";

describe("encodePlayableMp4", () => {
  it("encodes a 720×1280 H.264 MP4 and probes claims", () => {
    if (!ffmpegAvailable()) {
      expect(ffmpegAvailable()).toBe(false);
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "playable-mp4-"));
    try {
      const frames = [0, 1].map((index) => ({
        index,
        image: uniqueOriginal(720, 1280),
      }));
      const outPath = join(dir, "out.mp4");
      const encoded = encodePlayableMp4({
        frames,
        fps: 24,
        outPath,
        workDir: join(dir, "ppm"),
      });
      expect(encoded.ok).toBe(true);
      if (!encoded.ok) return;
      expect(encoded.claims.width).toBe(720);
      expect(encoded.claims.height).toBe(1280);
      expect(encoded.claims.frameCount).toBe(2);
      expect(encoded.claims.fps).toBeCloseTo(24, 5);
      expect(encoded.claims.codec).toBe("h264");
      expect(encoded.claims.container).toMatch(/mp4/);
      expect(encoded.claims.audio.present).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
