/**
 * Every frame of an MP4, one at a time, as RGBA — pulled, not pushed. WebCodecs hands frames out as it likes; this
 * wraps a decoder so a caller can `for await` the frames in presentation order with a few in flight, which is what
 * compositing a take frame by frame needs (two clips read side by side, neither held whole in memory).
 *
 * Frames are drawn to a canvas the size the picture is shown at and read back as 8-bit RGBA. Rotation is not
 * applied: the clips this reads are the storyboard's own dressed takes, written upright.
 */
import type { Mp4Sample, Mp4Track } from "@/lib/media/mp4";
import { shownAt } from "@/lib/media/mp4Cut";
import type { RangeRead } from "@/lib/media/probe";

export type DecodedFrame = {
  index: number;
  t: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
};

/** A RangeRead over bytes already in memory (a file downloaded whole). */
export function bytesRead(bytes: Uint8Array, contentType: string | null = "video/mp4"): RangeRead {
  return async (start, endInclusive) => ({
    status: 206,
    bytes: bytes.subarray(start, Math.min(bytes.byteLength, endInclusive + 1)),
    total: bytes.byteLength,
    contentType,
  });
}

const HIGH_WATER = 3;

function dequeued(codec: {
  addEventListener: (type: "dequeue", fn: () => void, opts?: { once: boolean }) => void;
}): Promise<void> {
  return new Promise((resolve) =>
    codec.addEventListener("dequeue", () => resolve(), { once: true }),
  );
}

function canvasFor(
  w: number,
  h: number,
): { ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("this browser gave no canvas to read frames on");
  return { ctx };
}

/**
 * Read every frame of `track` in order. The decoder runs ahead by a few frames and no more; a frame is read back
 * the moment it comes out, so no VideoFrame is held across a yield. Throws (from the iterator) when the browser
 * cannot decode the file.
 */
export async function* readFrames(
  read: RangeRead,
  track: Mp4Track,
): AsyncGenerator<DecodedFrame, void, void> {
  if (typeof VideoDecoder === "undefined" || typeof EncodedVideoChunk === "undefined")
    throw new Error("this browser has no video decoder");
  if (!track.codec || !track.width || !track.height)
    throw new Error(`no decoder is known here for ${track.format || "this file"}`);
  const samples: Mp4Sample[] = [];
  for (let i = 0; i < track.sampleCount; i++) {
    const s = track.sample(i);
    if (!s) throw new Error("the file's index is incomplete");
    samples.push(s);
  }
  if (samples.length === 0) throw new Error("the file has no frames");
  const lo = Math.min(...samples.map((s) => s.offset));
  const hi = Math.max(...samples.map((s) => s.offset + s.size));
  const got = await read(lo, hi - 1);
  if (got.bytes.byteLength < hi - lo) throw new Error("the footage could not be read in full");
  const config: VideoDecoderConfig = {
    codec: track.codec,
    codedWidth: track.width,
    codedHeight: track.height,
    ...(track.description ? { description: track.description } : {}),
  };
  if (
    !(await VideoDecoder.isConfigSupported(config).then(
      (s) => s.supported,
      () => false,
    ))
  )
    throw new Error(`this browser cannot decode ${track.codec}`);

  const queue: DecodedFrame[] = [];
  let failure: Error | null = null;
  let done = false;
  let index = 0;
  let produced: (() => void) | null = null;
  let consumed: (() => void) | null = null;
  const wake = (fn: (() => void) | null) => {
    if (fn) fn();
  };
  let ctx: ReturnType<typeof canvasFor>["ctx"] | null = null;

  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        if (failure) return;
        const w = frame.displayWidth;
        const h = frame.displayHeight;
        if (!ctx) ctx = canvasFor(w, h).ctx;
        ctx.drawImage(frame, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        queue.push({
          index: index++,
          t: Math.round(frame.timestamp) / 1e6,
          width: w,
          height: h,
          rgba,
        });
      } catch (e) {
        failure = failure ?? (e instanceof Error ? e : new Error(String(e)));
      } finally {
        frame.close();
        wake(produced);
        produced = null;
      }
    },
    error: (e) => {
      failure = failure ?? new Error(e.message || "the decoder refused the file");
      wake(produced);
      produced = null;
    },
  });

  const feed = (async () => {
    try {
      decoder.configure(config);
      for (const s of samples) {
        if (failure) break;
        decoder.decode(
          new EncodedVideoChunk({
            type: s.sync ? "key" : "delta",
            timestamp: Math.round(shownAt(track, s) * 1e6),
            data: got.bytes.subarray(s.offset - lo, s.offset - lo + s.size),
          }),
        );
        while (!failure && decoder.decodeQueueSize > 8) await dequeued(decoder);
        while (!failure && queue.length >= HIGH_WATER)
          await new Promise<void>((r) => (consumed = r));
      }
      if (!failure) await decoder.flush();
    } catch (e) {
      failure = failure ?? (e instanceof Error ? e : new Error(String(e)));
    } finally {
      done = true;
      try {
        decoder.close();
      } catch {
        // already closed
      }
      wake(produced);
      produced = null;
    }
  })();

  try {
    for (;;) {
      if (queue.length) {
        const f = queue.shift()!;
        wake(consumed);
        consumed = null;
        yield f;
        continue;
      }
      if (failure) throw failure;
      if (done) break;
      await new Promise<void>((r) => (produced = r));
    }
  } finally {
    // a consumer that stops early lets the feeder finish (its queue drains into nothing)
    failure = failure ?? new Error("stopped");
    wake(consumed);
    consumed = null;
    await feed.catch(() => undefined);
  }
}
