/**
 * Capture a single frame from a loaded <video> element at `timeSec`.
 * Browser-only — used by Hero Frame Studio for source-frame selection.
 */
export type CaptureFrameOptions = {
  /**
   * Cap the longest output edge (px), preserving aspect ratio. Used to
   * normalize a 4K master down to an HD working frame so it matches the Grok
   * swap output. E.g. a 2160x3840 (9:16) frame with maxLongEdgePx=1920 →
   * 1080x1920 (an exact integer halving — clean downscale). Omitted → native
   * resolution, byte-identical to the pre-normalize behaviour.
   */
  maxLongEdgePx?: number;
};

export async function captureVideoFrame(
  video: HTMLVideoElement,
  timeSec: number,
  opts?: CaptureFrameOptions,
): Promise<Blob> {
  const clamped = Math.max(0, Math.min(timeSec, Math.max(0, video.duration - 0.05)));

  await seekVideo(video, clamped);

  const srcW = video.videoWidth;
  const srcH = video.videoHeight;
  if (!srcW || !srcH) throw new Error("Video dimensions unavailable — wait for metadata.");

  // Downscale only — never upscale — preserving aspect ratio.
  const longEdge = Math.max(srcW, srcH);
  const scale =
    opts?.maxLongEdgePx && longEdge > opts.maxLongEdgePx ? opts.maxLongEdgePx / longEdge : 1;
  const w = Math.round(srcW * scale);
  const h = Math.round(srcH * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  ctx.drawImage(video, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Frame capture failed");
  return blob;
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video seek failed"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = timeSec;
  });
}
