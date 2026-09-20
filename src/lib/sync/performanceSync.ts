/**
 * Song ↔ performance synchronization (YSL Real Video #1, 2026-09-20).
 *
 * The performance master is one continuous recording whose t=0 is NOT the
 * song's t=0. Every editorial decision is made on the SONG clock and mapped
 * to a SOURCE RANGE on the master through a PerformanceSync record.
 *
 *   song_time = performance_time * (1 + driftPpm / 1e6) + offsetSeconds
 *
 * Records are produced by `scripts/sync/align_song_performance.py`
 * (windowed GCC-PHAT cross-correlation) and stored in `public.performance_syncs`.
 * This module is pure and dependency-free so treatment, timeline and QA code
 * can all share one mapping.
 */

export type PerformanceSyncStatus = "auto" | "manual" | "confirmed" | "rejected";

export type PerformanceSync = {
  id?: string;
  projectId: string;
  songAssetId: string | null;
  performanceAssetId: string | null;
  /** Seconds. Positive: the song was already playing when the recording started. */
  offsetSeconds: number;
  /** Clock drift of the performance recording vs the song, parts per million. */
  driftPpm: number;
  method: string;
  status: PerformanceSyncStatus;
  /** Windowed evidence (see scripts/sync/align_song_performance.py). */
  confidence?: {
    windowsTotal: number;
    windowsConsistent: number;
    medianOffsetSeconds: number;
    minOffsetSeconds: number;
    maxOffsetSeconds: number;
    peakSharpnessMedian?: number;
  };
  notes?: string;
};

export type TimeRange = { start: number; end: number };

const round = (v: number, places = 4) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

/** Map a performance-master time (s) to song time (s). */
export function performanceToSong(performanceSeconds: number, sync: PerformanceSync): number {
  return performanceSeconds * (1 + sync.driftPpm / 1e6) + sync.offsetSeconds;
}

/** Map a song time (s) to performance-master time (s). */
export function songToPerformance(songSeconds: number, sync: PerformanceSync): number {
  return (songSeconds - sync.offsetSeconds) / (1 + sync.driftPpm / 1e6);
}

/**
 * Resolve the master source range for a shot that lives on the song clock.
 * Returns null when the range falls outside the recorded performance.
 */
export function sourceRangeForSongRange(
  songRange: TimeRange,
  sync: PerformanceSync,
  performanceDurationSeconds?: number,
): TimeRange | null {
  const start = songToPerformance(songRange.start, sync);
  const end = songToPerformance(songRange.end, sync);
  if (end <= start) return null;
  if (start < 0) return null;
  if (performanceDurationSeconds != null && end > performanceDurationSeconds + 1e-6) return null;
  return { start: round(start), end: round(end) };
}

/** Frame index on a fixed-fps timeline for a song time (floor, never negative). */
export function songSecondsToFrame(songSeconds: number, fps: number): number {
  return Math.max(0, Math.floor(songSeconds * fps + 1e-9));
}

/**
 * A sync is usable for production only when its evidence is consistent:
 * ≥ 60 % of windows agree within 25 ms and the drift is small.
 */
export function isSyncProductionReady(sync: PerformanceSync): boolean {
  if (sync.status === "rejected") return false;
  if (sync.status === "confirmed" || sync.status === "manual") return true;
  const c = sync.confidence;
  if (!c) return false;
  const spread = c.maxOffsetSeconds - c.minOffsetSeconds;
  return c.windowsConsistent / Math.max(1, c.windowsTotal) >= 0.6 && spread <= 0.025 && Math.abs(sync.driftPpm) < 50;
}

/**
 * Canonical YSL (Ice On) record — measured 2026-09-20 from the album master WAV
 * (asset 067a4cbf) against the audio track of the original performance master
 * IMG_5633.mov (asset 55bdc383, 190.33 s). 30 windows of 10 s, GCC-PHAT at 16 kHz.
 * 23/30 windows consistent at 0.8536–0.8538 s; drift fit −0.3 ppm.
 */
export const YSL_ICE_ON_PERFORMANCE_SYNC: PerformanceSync = {
  projectId: "764a63d2-93cd-44f3-905f-292f14ab2f51",
  songAssetId: "067a4cbf-6fd0-4601-9111-df1119c52fa6",
  /** IMG_5633.mov — the only master encode that carries the audio track. */
  performanceAssetId: "55bdc383-50e7-41b8-9ec9-8bda031ac5e0",
  offsetSeconds: 0.8538,
  driftPpm: -0.3,
  method: "gcc_phat_windowed_16k_10s",
  status: "auto",
  confidence: {
    windowsTotal: 30,
    windowsConsistent: 23,
    medianOffsetSeconds: 0.8538,
    minOffsetSeconds: 0.8536,
    maxOffsetSeconds: 0.8538,
  },
  notes:
    "song_time = master_time + 0.8538 s. The recording started 0.85 s after the song began playing in the room; Fendi enters frame at master ≈ 9 s during the intro. Master ends at song 191.19 s (song runs to 201.87 s).",
};

/** Musical grid measured from the album master (onset comb filter): 122.00 BPM, downbeat at 0.000 s. */
export const YSL_ICE_ON_GRID = {
  bpm: 122.0,
  beatSeconds: 60 / 122.0,
  barSeconds: (4 * 60) / 122.0,
  downbeat0Seconds: 0.0,
} as const;

export function barStartSeconds(bar: number, grid = YSL_ICE_ON_GRID): number {
  return round(grid.downbeat0Seconds + bar * grid.barSeconds);
}
