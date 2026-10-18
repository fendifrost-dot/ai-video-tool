/**
 * Seek / drift thresholds for the Timeline monitor.
 * Paused frame-steps must land on the intended frame; playback drift correction stays looser.
 */

/** Half a frame — anything larger while paused must seek. */
export function pausedSeekToleranceSeconds(fps: number): number {
  const f = Math.max(1, fps);
  return 0.5 / f;
}

/** Playback drift band — avoid thrashing seeks every RAF tick. */
export function playbackDriftToleranceSeconds(fps: number): number {
  const f = Math.max(1, fps);
  // ~2 frames, floored at the historical 80 ms band for low fps
  return Math.max(0.08, 2 / f);
}

export function needsSeek(opts: {
  currentTime: number;
  targetTime: number;
  playing: boolean;
  fps: number;
}): boolean {
  const tol = opts.playing
    ? playbackDriftToleranceSeconds(opts.fps)
    : pausedSeekToleranceSeconds(opts.fps);
  return Math.abs(opts.currentTime - opts.targetTime) > tol;
}

/** Quantize to the frame grid so reverse/forward steps share the same sample points. */
export function snapToFrame(seconds: number, fps: number): number {
  const f = Math.max(1, Math.round(fps));
  return Math.max(0, Math.round(seconds * f) / f);
}

/**
 * Apply a precise seek on an HTMLMediaElement and wait until decode is ready
 * (or the element reports an error / the timeout fires).
 */
export function seekMediaExact(
  el: HTMLMediaElement,
  targetSeconds: number,
  opts?: { timeoutMs?: number },
): Promise<"ok" | "timeout" | "error"> {
  const target = Math.max(0, targetSeconds);
  const timeoutMs = opts?.timeoutMs ?? 2500;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: "ok" | "timeout" | "error") => {
      if (settled) return;
      settled = true;
      el.removeEventListener("seeked", onSeeked);
      el.removeEventListener("error", onError);
      clearTimeout(timer);
      resolve(r);
    };
    const onSeeked = () => finish("ok");
    const onError = () => finish("error");
    const timer = setTimeout(() => finish("timeout"), timeoutMs);

    el.addEventListener("seeked", onSeeked);
    el.addEventListener("error", onError);

    try {
      // Already on target within a sub-ms band — still fire seeked when possible.
      if (Math.abs(el.currentTime - target) < 1e-4 && el.readyState >= 2) {
        finish("ok");
        return;
      }
      el.currentTime = target;
    } catch {
      finish("error");
    }
  });
}
