// Lane A — keyframe planning (LOCKED video garment-swap architecture, §3).
//
// Pure helpers, no Deno / DOM globals, so vitest exercises them like the other
// _shared pure modules (frameSwap.ts, videoCompose.ts).
//
// The locked lane approves a few product-accurate Grok HERO keyframes — roughly
// every 12–24 frames, PLUS one at every pose change / scene cut — then
// PROPAGATES the approved garment across the intermediate frames. This module
// answers two questions the propagation step needs:
//
//   1. planKeyframes(...)  — WHICH frames become Grok keyframes.
//   2. assignSegments(...) — for every frame, which two keyframes bracket it
//                            (the propagation source(s)) and where it sits
//                            between them (blend weight t).
//
// See docs/VIDEO_SWAP_ARCHITECTURE.md §3. Keyframe generation itself reuses the
// proven grok-image-garment-proxy — this module only decides the plan.

/** Locked cadence band: a scheduled keyframe every 12–24 frames (§3). */
export const MIN_KEYFRAME_CADENCE = 12;
export const MAX_KEYFRAME_CADENCE = 24;
export const DEFAULT_KEYFRAME_CADENCE = 18;

export interface KeyframePlanOptions {
  /** Total extracted frames (indices 0..frameCount-1). */
  frameCount: number;
  /**
   * Scheduled cadence in frames. Clamped to [12, 24] (the locked band). A
   * keyframe is scheduled at 0, cadence, 2·cadence, … plus the final frame.
   */
  cadenceFrames?: number;
  /**
   * Forced anchor indices — pose changes / scene cuts detected upstream (motion
   * analysis, shot-boundary detection, or re-anchor from a flow break). These
   * ALWAYS become keyframes regardless of cadence (§3: "and at every pose
   * change / scene cut").
   */
  forcedAnchors?: number[];
}

/** Clamp a cadence into the locked 12–24 band. Non-finite → the default. */
export function clampCadence(cadence: number | undefined): number {
  if (!Number.isFinite(cadence)) return DEFAULT_KEYFRAME_CADENCE;
  return Math.min(
    MAX_KEYFRAME_CADENCE,
    Math.max(MIN_KEYFRAME_CADENCE, Math.round(cadence as number)),
  );
}

/**
 * Decide which frame indices become Grok hero keyframes.
 *
 * Always includes the first frame (0) and the last (frameCount-1) so every
 * intermediate frame is bracketed by two real keyframes — propagation is never
 * asked to extrapolate past the ends. Scheduled cadence keyframes and forced
 * anchors are merged, de-duplicated, and returned sorted ascending.
 */
export function planKeyframes(opts: KeyframePlanOptions): number[] {
  const frameCount = Math.floor(opts.frameCount);
  if (!(frameCount > 0)) throw new Error(`planKeyframes: invalid frameCount ${opts.frameCount}`);
  if (frameCount === 1) return [0];

  const cadence = clampCadence(opts.cadenceFrames);
  const set = new Set<number>();
  set.add(0);
  set.add(frameCount - 1);
  for (let i = cadence; i < frameCount - 1; i += cadence) set.add(i);

  for (const raw of opts.forcedAnchors ?? []) {
    const a = Math.floor(raw);
    if (Number.isFinite(a) && a >= 0 && a < frameCount) set.add(a);
  }

  return [...set].sort((a, b) => a - b);
}

export interface FrameSegment {
  /** The frame this record describes. */
  index: number;
  /** True when this frame is itself an approved keyframe (use it directly). */
  isKeyframe: boolean;
  /** Nearest keyframe at or before `index`. */
  prevKeyframe: number;
  /** Nearest keyframe at or after `index`. */
  nextKeyframe: number;
  /**
   * Normalised position of `index` within [prevKeyframe, nextKeyframe], 0..1.
   * 0 at prevKeyframe, 1 at nextKeyframe. A keyframe reports 0. Used as the
   * blend weight when a propagation engine warps from both bracketing
   * keyframes toward the middle.
   */
  t: number;
  /** Which bracketing keyframe is closer — the primary propagation source. */
  nearestKeyframe: number;
}

/**
 * For every frame 0..frameCount-1, resolve the two keyframes that bracket it and
 * where it sits between them. `keyframeIndices` must be sorted ascending and
 * cover both ends (as planKeyframes guarantees).
 */
export function assignSegments(keyframeIndices: number[], frameCount: number): FrameSegment[] {
  const n = Math.floor(frameCount);
  if (!(n > 0)) throw new Error(`assignSegments: invalid frameCount ${frameCount}`);
  const kfs = [...keyframeIndices]
    .filter((k) => Number.isFinite(k) && k >= 0 && k < n)
    .sort((a, b) => a - b);
  if (kfs.length === 0) throw new Error("assignSegments: no keyframes");
  if (kfs[0] !== 0) throw new Error("assignSegments: keyframes must include frame 0");
  if (kfs[kfs.length - 1] !== n - 1)
    throw new Error("assignSegments: keyframes must include the final frame");

  const kfSet = new Set(kfs);
  const out: FrameSegment[] = [];
  let seg = 0; // index into kfs of the current lower bracket

  for (let i = 0; i < n; i++) {
    // Advance so kfs[seg] <= i < kfs[seg+1] (or i == last keyframe).
    while (seg + 1 < kfs.length && kfs[seg + 1] <= i) seg++;
    const prev = kfs[seg];
    const next = seg + 1 < kfs.length ? kfs[seg + 1] : prev;
    const span = next - prev;
    const t = span > 0 ? (i - prev) / span : 0;
    const isKeyframe = kfSet.has(i);
    const nearest = t <= 0.5 ? prev : next;
    out.push({
      index: i,
      isKeyframe,
      prevKeyframe: prev,
      nextKeyframe: next,
      t,
      nearestKeyframe: nearest,
    });
  }
  return out;
}

/** Intermediate (non-keyframe) frames only — the set the propagation step fills. */
export function intermediateFrames(segments: FrameSegment[]): FrameSegment[] {
  return segments.filter((s) => !s.isKeyframe);
}
