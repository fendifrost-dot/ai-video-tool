import type { RgbFrame } from "./types.ts";

function blur(mask: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return mask;
  const out = new Float32Array(mask.length);
  const r = Math.max(1, Math.round(radius));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += mask[yy * width + xx];
          count++;
        }
      }
      out[y * width + x] = count ? sum / count : 0;
    }
  }
  return out;
}

/**
 * Put the source pixels back where the mask is high. The mask is 0..1 per pixel.
 * Feather is a box blur in pixels, the same idea as the face put-back's soft edge.
 * This does not track a face. The caller supplies the mask for each frame.
 */
export function compositeMasked(
  source: RgbFrame,
  output: RgbFrame,
  mask: Float32Array,
  feather: number,
): RgbFrame {
  const width = source.width;
  const height = source.height;
  const soft = blur(mask, width, height, feather);
  const data = new Uint8Array(source.data.length);
  for (let i = 0; i < width * height; i++) {
    const alpha = Math.max(0, Math.min(1, soft[i] ?? 0));
    for (let channel = 0; channel < 3; channel++) {
      const index = i * 3 + channel;
      data[index] = Math.round(source.data[index] * alpha + output.data[index] * (1 - alpha));
    }
  }
  return { width, height, data };
}

/** Paste `still` into `frame` inside `box`, with a feathered edge. This is the local target-frame guide. */
export function compositeTargetFrame(
  frame: RgbFrame,
  still: RgbFrame,
  box: { x: number; y: number; width: number; height: number },
  feather = 2,
): RgbFrame {
  const mask = new Float32Array(frame.width * frame.height);
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(frame.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(frame.height, Math.ceil(box.y + box.height));
  const painted = new Uint8Array(frame.data);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const u = (x - box.x) / box.width;
      const v = (y - box.y) / box.height;
      const sx = Math.min(still.width - 1, Math.max(0, Math.floor(u * still.width)));
      const sy = Math.min(still.height - 1, Math.max(0, Math.floor(v * still.height)));
      const from = (sy * still.width + sx) * 3;
      const to = (y * frame.width + x) * 3;
      painted[to] = still.data[from];
      painted[to + 1] = still.data[from + 1];
      painted[to + 2] = still.data[from + 2];
      mask[y * frame.width + x] = 1;
    }
  }
  return compositeMasked(
    { width: frame.width, height: frame.height, data: painted },
    frame,
    mask,
    feather,
  );
}

/** ffmpeg argv that puts the original audio on the picture. Does not run. */
export function muxOriginalAudioArgv(
  videoPath: string,
  audioPath: string,
  outPath: string,
): string[] {
  return [
    "ffmpeg",
    "-y",
    "-i",
    videoPath,
    "-i",
    audioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    outPath,
  ];
}
