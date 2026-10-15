import { describe, expect, it } from "vitest";
import { avcSampleDescription, writeMp4 } from "../../../src/lib/media/mp4Trim";
import {
  acceptDownloadHeaders,
  conformDressedClip,
  DOWNLOAD_MAX_BYTES,
  readBounded,
  retimeRatioPlausible,
} from "./dressConform";

/** A swap-shaped clip: `frames` at 24 fps. */
function clip(frames: number): Uint8Array {
  return writeMp4({
    timescale: 12288,
    width: 720,
    height: 1280,
    stsd: avcSampleDescription(720, 1280, new Uint8Array([1, 0x64, 0, 0x1f, 0xff, 0xe1, 0, 0])),
    deltas: Array(frames).fill(512),
    offsets: Array(frames).fill(0),
    syncs: Array.from({ length: frames }, (_, i) => i === 0),
    sizes: Array(frames).fill(16),
    payload: new Uint8Array(16 * frames).fill(7),
  });
}

function stream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
  });
}

describe("the download is bounded before and while it happens", () => {
  it("refuses a declared length over the cap without reading a byte", () => {
    expect(
      acceptDownloadHeaders({
        contentLength: String(DOWNLOAD_MAX_BYTES + 1),
        contentType: "video/mp4",
        strictType: true,
      }),
    ).toMatchObject({ ok: false, why: expect.stringMatching(/over the 200 MB limit/) });
    expect(
      acceptDownloadHeaders({
        contentLength: "1234567",
        contentType: "video/mp4",
        strictType: true,
      }),
    ).toEqual({ ok: true });
    expect(
      acceptDownloadHeaders({ contentLength: null, contentType: "video/mp4", strictType: true }),
    ).toEqual({ ok: true });
  });

  it("a dressed result must be served as a video or an opaque binary; other downloads keep the old latitude", () => {
    expect(
      acceptDownloadHeaders({
        contentLength: null,
        contentType: "text/html; charset=utf-8",
        strictType: true,
      }),
    ).toMatchObject({ ok: false, why: expect.stringMatching(/"text\/html", not a video/) });
    expect(
      acceptDownloadHeaders({ contentLength: null, contentType: null, strictType: true }),
    ).toMatchObject({ ok: false });
    expect(
      acceptDownloadHeaders({
        contentLength: null,
        contentType: "application/octet-stream",
        strictType: true,
      }),
    ).toEqual({ ok: true });
    expect(
      acceptDownloadHeaders({
        contentLength: null,
        contentType: "binary/octet-stream",
        strictType: true,
      }),
    ).toEqual({ ok: true });
    expect(
      acceptDownloadHeaders({ contentLength: null, contentType: "Video/MP4", strictType: true }),
    ).toEqual({ ok: true });
    expect(
      acceptDownloadHeaders({ contentLength: null, contentType: "text/html", strictType: false }),
    ).toEqual({ ok: true });
  });

  it("reads a body whole when it fits, and stops past the cap, aborting the connection and keeping nothing", async () => {
    const whole = await readBounded(
      stream([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])]),
      10,
      () => undefined,
    );
    expect([...whole]).toEqual([1, 2, 3, 4, 5]);
    let aborted = 0;
    const big = stream([new Uint8Array(6), new Uint8Array(6), new Uint8Array(6)]);
    await expect(readBounded(big, 10, () => void aborted++)).rejects.toThrow(
      /ran past the 0 MB download limit/,
    );
    expect(aborted).toBe(1);
  });
});

describe("conforming a dressed clip", () => {
  it("refuses bytes that are not an MP4 before trying to read them as one", () => {
    const html = new TextEncoder().encode("<html><body>Access denied</body></html>".repeat(4));
    expect(() => conformDressedClip(html, 4)).toThrow(/not an MP4 \(no ftyp box\)/);
  });

  it("conforms the usual ~1.08 case and records it", () => {
    const out = conformDressedClip(clip(89), 4.0);
    expect(out.meta).toMatchObject({
      conform_method: "container_timescale",
      conformed_to: 4,
      audio_dropped: 0,
    });
    expect(out.meta.retime_ratio).toBeCloseTo(4 / (89 / 24), 4);
  });

  it("refuses a ratio the swap is not known to need (a trimmed or frame-dropped result), so a person looks", () => {
    // 60 frames = 2.5 s for a 4 s source: ratio 1.6
    expect(() => conformDressedClip(clip(60), 4)).toThrow(/ratio 1\.600, expected about 1\.08/);
    // 120 frames = 5 s for a 4 s source: ratio 0.8
    expect(() => conformDressedClip(clip(120), 4)).toThrow(/ratio 0\.800/);
    expect(retimeRatioPlausible(1.08)).toBe(true);
    expect(retimeRatioPlausible(0.9)).toBe(true);
    expect(retimeRatioPlausible(1.2)).toBe(true);
    expect(retimeRatioPlausible(1.21)).toBe(false);
    expect(retimeRatioPlausible(Number.NaN)).toBe(false);
  });
});
