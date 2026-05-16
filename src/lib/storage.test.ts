import { describe, expect, it } from "vitest";
import { _internal, buildStoragePath, makeUploadFilename } from "./storage";

const { withTimeout } = _internal;

describe("withTimeout", () => {
  it("resolves immediately when the promise resolves before the deadline", async () => {
    const result = await withTimeout(Promise.resolve(42), 100, "noop");
    expect(result).toBe(42);
  });

  it("rejects with a label-tagged message when the promise hangs past the deadline", async () => {
    const hanging = new Promise<number>(() => {
      /* never resolves */
    });
    await expect(withTimeout(hanging, 20, "Reading frob")).rejects.toThrow(
      /Reading frob timed out after 0s/,
    );
  });

  it("propagates rejections from the wrapped promise unchanged", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 1000, "x"),
    ).rejects.toThrow("boom");
  });

  it("clears the timer on success so the process can exit", async () => {
    // If the timer didn't clear, the test runner would hang for 1h.
    await withTimeout(Promise.resolve("ok"), 60 * 60 * 1000, "long-fuse");
  });
});

describe("buildStoragePath", () => {
  it("joins segments with /", () => {
    expect(buildStoragePath("u1", "a1", "x.png")).toBe("u1/a1/x.png");
  });

  it("drops empty segments", () => {
    expect(buildStoragePath("u1", "", "x.png")).toBe("u1/x.png");
  });

  it("sanitises unsafe chars in each segment", () => {
    expect(buildStoragePath("u 1", "a/b", "name with space.png")).toBe(
      "u_1/a_b/name_with_space.png",
    );
  });

  it("preserves dots, dashes, and underscores", () => {
    expect(buildStoragePath("u-1", "a.b_c")).toBe("u-1/a.b_c");
  });
});

describe("makeUploadFilename", () => {
  it("keeps the extension intact", () => {
    expect(makeUploadFilename("clip.mp4")).toMatch(/^clip_\d+_[a-z0-9]+\.mp4$/);
  });

  it("handles missing extensions", () => {
    expect(makeUploadFilename("README")).toMatch(/^README_\d+_[a-z0-9]+$/);
  });

  it("sanitises the stem", () => {
    expect(makeUploadFilename("hello world!.png")).toMatch(
      /^hello_world__\d+_[a-z0-9]+\.png$/,
    );
  });

  it("truncates absurdly long stems", () => {
    const long = "a".repeat(200) + ".png";
    const out = makeUploadFilename(long);
    const stem = out.split("_")[0];
    expect(stem.length).toBeLessThanOrEqual(40);
  });

  it("falls back to 'file' when the stem is empty (no prefix before the dot)", () => {
    // Pathological input like ".env" — slice(0, dot) is "", `stem || "file"`
    // picks up "file". Non-empty stems made entirely of unsafe chars become
    // underscores, not "file", which preserves some entropy from the name.
    expect(makeUploadFilename(".env")).toMatch(/^file_\d+_[a-z0-9]+\.env$/);
  });
});
