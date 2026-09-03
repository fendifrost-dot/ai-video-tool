import { decodeFrameWithWebCodecs } from "./webCodecsFrame";

/** A never-firing `seeked` would hang the capture forever, so bound the wait. */
const SEEK_TIMEOUT_MS = 8000;

/** HAVE_CURRENT_DATA — frame available at currentTime. Below this, <video> can't draw. */
const HAVE_CURRENT_DATA = 2;

/**
 * Prefer WebCodecs when the media element has not decoded (common in
 * backgrounded / cloud-agent tabs where fetch of the same URL succeeds but
 * readyState stays 0 and seeked never fires).
 */
export function shouldPreferWebCodecsCapture(video: HTMLVideoElement): boolean {
  return (
    !Number.isFinite(video.duration) ||
    video.duration <= 0 ||
    video.readyState < HAVE_CURRENT_DATA ||
    !video.videoWidth ||
    !video.videoHeight
  );
}

/**
 * Capture a single frame from a loaded <video> element at `timeSec`.
 * Browser-only — used by Hero Frame Studio for source-frame selection.
 *
 * Backgrounded/headless tabs throttle media elements so hard they never decode:
 * `duration` stays NaN and setting `currentTime` throws or never fires `seeked`.
 * When the element path is unusable we decode the source bytes with WebCodecs instead.
 */
export async function captureVideoFrame(
  video: HTMLVideoElement,
  timeSec: number,
): Promise<Blob> {
  const srcUrl = video.currentSrc || video.src;

  if (shouldPreferWebCodecsCapture(video)) {
    if (!srcUrl) {
      throw new Error(
        `Video not ready (readyState=${video.readyState}) and no source URL for WebCodecs fallback.`,
      );
    }
    try {
      return await decodeFrameWithWebCodecs(srcUrl, timeSec);
    } catch (fallbackError) {
      throw new Error(
        `Frame capture failed: media element not ready (readyState=${video.readyState}, ` +
          `duration=${video.duration}). WebCodecs: ${describe(fallbackError)}.`,
      );
    }
  }

  let elementError: unknown;
  try {
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
  } catch (err) {
    elementError = err;
  }

  try {
    if (!srcUrl) throw new Error("No video source URL for WebCodecs fallback.");
    return await decodeFrameWithWebCodecs(srcUrl, timeSec);
  } catch (fallbackError) {
    throw new Error(
      `Frame capture failed. Media element: ${describe(elementError)}. ` +
        `WebCodecs fallback: ${describe(fallbackError)}.`,
    );
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video seek failed"));
    };
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Video seek timed out after ${SEEK_TIMEOUT_MS}ms`));
    }, SEEK_TIMEOUT_MS);
    try {
      video.currentTime = timeSec;
    } catch (err) {
      cleanup();
      reject(err instanceof Error ? err : new Error("Failed to set currentTime"));
    }
  });
}
