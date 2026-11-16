// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertInside, assertScratch, assertWorkerRoot, GPU_ROOT } from "./paths.mjs";

describe("gpu path jail", () => {
  it("keeps the Mac root on the T7 and refuses iCloud", () => {
    expect(assertWorkerRoot(GPU_ROOT)).toBe(GPU_ROOT);
    expect(() => assertWorkerRoot("/Volumes/T7/MODEST")).toThrow(/AVT_GPU_ROOT/);
    expect(() => assertWorkerRoot("/Users/me/Library/Mobile Documents/com~apple~CloudDocs/AVT")).toThrow(/iCloud/);
  });

  it("deletes only a job scratch directory", () => {
    const root = mkdtempSync(path.join(tmpdir(), "avt-gpu-"));
    const options = { allowNonT7: true };
    try {
      expect(() => assertInside(root, path.join(root, "..", "other"), options)).toThrow(/outside/);
      const scratch = path.join(root, "scratch", "job-1");
      expect(assertScratch(root, scratch, options)).toBe(path.resolve(scratch));
      expect(() => assertScratch(root, path.join(root, "models", "sam2.pt"), options)).toThrow(/only scratch/);
      expect(() => assertScratch(root, path.join(root, "scratch"), options)).toThrow(/kept/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
