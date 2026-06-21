/**
 * Capture a single frame from a loaded <video> element at `timeSec`.
 * Browser-only — used by Hero Frame Studio for source-frame selection.
 */
export async function captureVideoFrame(
  video: HTMLVideoElement,
  timeSec: number,
): Promise<Blob> {
  const clamped = Math.max(0, Math.min(timeSec, Math.max(0, video.duration - 0.05)));

  await seekVideo(video, clamped);

  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("Video dimensions unavailable — wait for metadata.");

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
