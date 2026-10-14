import type {
  BeatMarker,
  Drop,
  EnergySample,
  SongAnalysis,
} from "./types";

/**
 * Browser-side song analysis. Pulled together from scratch to avoid bringing
 * in a new dependency for a single use site. See docs/song_intelligence.md
 * for the rationale.
 *
 * Pipeline:
 *  1. Fetch the audio URL as ArrayBuffer.
 *  2. Decode via the Web Audio API to get a stereo AudioBuffer.
 *  3. Downmix to mono Float32 (averaging channels).
 *  4. Compute RMS energy in fixed windows -> energyCurve.
 *  5. Detect BPM by autocorrelating the low-pass-filtered onset envelope and
 *     picking the strongest periodicity in the 60–200 BPM range.
 *  6. Refine the tempo and find the beat phase (v2, 2026-10-14): the coarse
 *     autocorrelation lag is a whole 10 ms frame, which on "YSL Ice On" gave
 *     122.4 BPM where the song is 121.72 — a grid that slides about a third
 *     of a second per minute. The tempo and the time of the first beat are
 *     searched together for the grid whose beats land on the most onsets;
 *     the downbeat is the beat of the bar with the strongest onsets.
 *     Beats are then projected from that first beat.
 *  7. Drops = energy samples whose value exceeds (rollingMean + 1.5σ) for
 *     >=1s.
 *
 * Resilient to environments without a working AudioContext (returns nulls
 * with the energyCurve still populated when possible).
 */

const ENERGY_WINDOW_SECONDS = 0.25;
const BPM_MIN = 60;
const BPM_MAX = 200;
const DROP_THRESHOLD_SIGMA = 1.5;
const DROP_MIN_SUSTAIN_SECONDS = 1.0;
const ROLLING_MEAN_WINDOW = 16; // ~4s at 250ms windows
/** A refined grid is "measured" only when its beats beat the average phase by this much (click track ~16×, a
 *  produced song ~3.5×, white noise ~1.25×, silence 1×). Below it the v1 tempo and map are kept. */
export const MIN_BEAT_CONTRAST = 1.5;
/** A downbeat other than the first beat must lead it by this factor. */
const DOWNBEAT_MIN_LEAD = 1.03;
/** Below this lead over the runner-up the downbeat is reported as uncertain (bar lines may be half a bar off). */
export const DOWNBEAT_CONFIDENT_MARGIN = 0.1;

export type AnalysisResult = Pick<
  SongAnalysis,
  | "bpm"
  | "duration_seconds"
  | "energy_curve_json"
  | "beat_map_json"
  | "drops_json"
  | "sections_json"
  | "hooks_json"
  | "analysis_provider"
>;

export async function analyzeAudioUrl(url: string): Promise<AnalysisResult> {
  const buffer = await fetchAudioBuffer(url);
  const mono = downmixToMono(buffer);
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;

  const energyCurve = computeEnergyCurve(mono, sampleRate);
  const grid = analyzeBeatGrid(mono, sampleRate, duration);
  // no measured grid (no clear beat): the v1 tempo and a map counted from 0:00, labelled v1
  const v1Bpm = grid ? null : detectBpm(mono, sampleRate);
  const bpm = grid?.bpm ?? v1Bpm;
  const beatMap = grid ? projectBeats(grid.bpm, duration, grid.firstBeat) : v1Bpm ? projectBeats(v1Bpm, duration) : [];
  const drops = detectDrops(energyCurve);

  return {
    bpm,
    duration_seconds: duration,
    energy_curve_json: energyCurve,
    beat_map_json: beatMap,
    drops_json: drops,
    // Sections + hooks need ML or manual labelling — left empty in Phase A.
    sections_json: [],
    hooks_json: [],
    // the provider says what the map is: v2 = measured beats and downbeat; "-downbeat-uncertain" = measured beats,
    // bar lines a best guess (two beat positions nearly tie)
    analysis_provider: grid ? (grid.downbeatConfident ? "web-audio-builtin-v2" : "web-audio-builtin-v2-downbeat-uncertain") : "web-audio-builtin",
  };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function fetchAudioBuffer(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch audio (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  const AC: typeof AudioContext =
    (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext!;
  if (!AC) {
    throw new Error("AudioContext is not available in this browser");
  }
  const ctx = new AC();
  try {
    return await ctx.decodeAudioData(ab);
  } finally {
    if (typeof ctx.close === "function") {
      // Don't await — closing is best-effort cleanup
      ctx.close().catch(() => undefined);
    }
  }
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  const len = buffer.length;
  if (channels === 1) return buffer.getChannelData(0).slice();
  const out = new Float32Array(len);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) {
      out[i] += data[i] / channels;
    }
  }
  return out;
}

export function computeEnergyCurve(
  mono: Float32Array,
  sampleRate: number,
  windowSeconds: number = ENERGY_WINDOW_SECONDS,
): EnergySample[] {
  const winSamples = Math.max(1, Math.floor(windowSeconds * sampleRate));
  const out: EnergySample[] = [];
  for (let i = 0; i < mono.length; i += winSamples) {
    const end = Math.min(mono.length, i + winSamples);
    let sumSq = 0;
    for (let j = i; j < end; j++) {
      const v = mono[j];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / (end - i));
    out.push({ t: i / sampleRate, energy: rms });
  }
  return out;
}

/**
 * Detect BPM by computing an onset envelope (half-wave-rectified spectral
 * flux of energy), then autocorrelating it across the lag range corresponding
 * to BPM_MIN..BPM_MAX. The peak lag becomes the dominant tempo.
 *
 * Returns null when the audio is too short or no clear peak is found.
 */
export function detectBpm(
  mono: Float32Array,
  sampleRate: number,
): number | null {
  if (mono.length < sampleRate * 4) return null; // need at least 4s
  const { env, fps } = onsetEnvelope(mono, sampleRate);
  return coarseBpmFromEnvelope(env, fps);
}

/**
 * Onset envelope at ~100 Hz: half-wave-rectified frame-to-frame rise in RMS.
 * Shared by tempo detection, beat phase and downbeat.
 */
export function onsetEnvelope(
  mono: Float32Array,
  sampleRate: number,
): { env: Float32Array; fps: number } {
  const frameSize = Math.max(1, Math.floor(sampleRate / 100)); // ~100 Hz frames
  const n = Math.ceil(mono.length / frameSize);
  const env = new Float32Array(n);
  let prev = 0;
  for (let f = 0; f < n; f++) {
    const i = f * frameSize;
    const end = Math.min(mono.length, i + frameSize);
    let sumSq = 0;
    for (let j = i; j < end; j++) {
      const v = mono[j];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - i));
    env[f] = Math.max(0, rms - prev); // half-wave rectified
    prev = rms;
  }
  return { env, fps: sampleRate / frameSize };
}

/** Whole-frame autocorrelation peak in BPM_MIN..BPM_MAX (the v1 tempo; coarse by up to ~0.7 BPM). */
function coarseBpmFromEnvelope(env: Float32Array, fps: number): number | null {
  // Subtract mean so autocorrelation focuses on rhythm, not DC level.
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= Math.max(1, env.length);
  const centered = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) centered[i] = env[i] - mean;

  const minLag = Math.floor(fps * (60 / BPM_MAX));
  const maxLag = Math.ceil(fps * (60 / BPM_MIN));

  let bestLag = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let i = 0; i + lag < centered.length; i++) {
      score += centered[i] * centered[i + lag];
    }
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || !(bestScore > 0)) return null; // silence / no periodicity: no tempo (v1 returned ~199 BPM)
  const bpm = 60 / (bestLag / fps);
  // Round to one decimal — hand-entered BPMs are integers; this gives an
  // approximate confidence indicator.
  return Math.round(bpm * 10) / 10;
}

/**
 * How well a constant-tempo grid (bpm, first beat at `phase` seconds) sits on the onsets: the mean envelope peak
 * within one frame of each beat. Higher is better; it is only compared between grids on the same envelope.
 */
export function beatAlignmentScore(env: Float32Array, fps: number, bpm: number, phase: number): number {
  const period = 60 / bpm;
  const durationSeconds = env.length / fps;
  let sum = 0;
  let count = 0;
  for (let t = phase; t < durationSeconds; t += period) {
    const i = Math.round(t * fps);
    if (i <= 0 || i >= env.length - 1) continue;
    sum += Math.max(env[i - 1], env[i], env[i + 1]);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

/**
 * Like `beatAlignmentScore`, but reads the envelope at each beat's exact (fractional) frame by linear
 * interpolation, with no ±1-frame tolerance — a peaked score for the fine search, where the tolerant score is flat
 * across a whole 10 ms frame and would leave the tempo anywhere on that plateau.
 */
export function beatAlignmentScoreExact(env: Float32Array, fps: number, bpm: number, phase: number): number {
  const period = 60 / bpm;
  const durationSeconds = env.length / fps;
  let sum = 0;
  let count = 0;
  for (let t = phase; t < durationSeconds; t += period) {
    const x = t * fps;
    const i = Math.floor(x);
    if (i <= 0 || i >= env.length - 1) continue;
    const f = x - i;
    sum += env[i] * (1 - f) + env[i + 1] * f;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

export type BeatGridFit = {
  bpm: number;
  /** Seconds of the first beat (0 <= phase < one beat). */
  phase: number;
  /** Best score divided by the mean score over all phases at that tempo; ~1 means no beat was found. */
  contrast: number;
};

function bestOver(
  env: Float32Array,
  fps: number,
  bpmLo: number,
  bpmHi: number,
  bpmStep: number,
  phaseStep: number,
  score: (env: Float32Array, fps: number, bpm: number, phase: number) => number = beatAlignmentScore,
  phaseLo = 0,
  phaseHi?: number,
): { bpm: number; phase: number; score: number } {
  let best = { bpm: bpmLo, phase: 0, score: -Infinity };
  for (let bpm = bpmLo; bpm <= bpmHi + 1e-9; bpm += bpmStep) {
    const period = 60 / bpm;
    for (let phase = phaseLo; phase < (phaseHi ?? period); phase += phaseStep) {
      const scoreNow = score(env, fps, bpm, phase);
      if (scoreNow > best.score) best = { bpm, phase, score: scoreNow };
    }
  }
  return best;
}

/**
 * Refine a coarse tempo and find the beat phase together: the (bpm, first beat) whose beats land on the strongest
 * onsets, searched within ±1 BPM of the coarse tempo (so the tempo octave is kept), first at 0.02 BPM / 10 ms,
 * then at 0.002 BPM / 2.5 ms around the winner.
 */
export function refineBeatGrid(env: Float32Array, fps: number, coarseBpm: number): BeatGridFit {
  const coarse = bestOver(env, fps, coarseBpm - 1, coarseBpm + 1, 0.02, 0.01);
  // fine: exact (interpolated) score, phase within ±20 ms of the coarse winner
  // (the window may start below 0: a phase just under one period is the same grid one beat earlier)
  const fine0 = bestOver(env, fps, coarse.bpm - 0.03, coarse.bpm + 0.03, 0.002, 0.001, beatAlignmentScoreExact, coarse.phase - 0.02, coarse.phase + 0.02);
  const period0 = 60 / fine0.bpm;
  const wrapped = ((fine0.phase % period0) + period0) % period0;
  const fine = { ...fine0, phase: wrapped, score: beatAlignmentScore(env, fps, fine0.bpm, wrapped) };
  const period = 60 / fine.bpm;
  let total = 0;
  let n = 0;
  for (let phase = 0; phase < period; phase += 0.01) {
    total += beatAlignmentScore(env, fps, fine.bpm, phase);
    n++;
  }
  const meanScore = n > 0 ? total / n : 0;
  return {
    bpm: Math.round(fine.bpm * 1000) / 1000,
    phase: Math.round((fine.phase % period) * 10000) / 10000,
    contrast: meanScore > 0 ? fine.score / meanScore : 1,
  };
}

/**
 * Which of the four beats starts the bar: the beat position whose every-fourth beats carry the strongest onsets.
 * Returns 0 (the first beat) unless another position is ahead by more than 3% — kick-on-1-and-3 songs make
 * positions 0 and 2 close, and a tie is not evidence.
 */
export function detectDownbeat(env: Float32Array, fps: number, bpm: number, phase: number): { downbeat: number; margin: number } {
  const period = 60 / bpm;
  const scores = [0, 1, 2, 3].map((j) => beatAlignmentScore(env, fps, bpm / 4, phase + j * period));
  const sorted = [...scores].sort((a, b) => b - a);
  // how far the winner leads the runner-up, as a fraction of the winner (0 = a tie)
  const margin = sorted[0] > 0 ? (sorted[0] - sorted[1]) / sorted[0] : 0;
  const best = scores.indexOf(sorted[0]);
  if (best === 0) return { downbeat: 0, margin };
  return scores[best] > scores[0] * DOWNBEAT_MIN_LEAD ? { downbeat: best, margin } : { downbeat: 0, margin };
}

export type BeatGrid = BeatGridFit & {
  /** Seconds of the first beat of the first bar. */
  firstBeat: number;
  /** Beats between `phase` and the first downbeat (0..3). */
  downbeat: number;
  /** Lead of the chosen downbeat over the runner-up (0 = tie). */
  downbeatMargin: number;
  /** False when the margin is under DOWNBEAT_CONFIDENT_MARGIN: beats are measured, bar lines are a best guess. */
  downbeatConfident: boolean;
};

/** Tempo, beat phase and downbeat for a decoded mono signal; null when there is no usable tempo. */
export function analyzeBeatGrid(mono: Float32Array, sampleRate: number, durationSeconds: number): BeatGrid | null {
  if (mono.length < sampleRate * 4) return null;
  const { env, fps } = onsetEnvelope(mono, sampleRate);
  const coarse = coarseBpmFromEnvelope(env, fps);
  if (!coarse) return null;
  const fit = refineBeatGrid(env, fps, coarse);
  if (!(fit.contrast >= MIN_BEAT_CONTRAST)) return null; // no clear beat: not a measured grid
  const { downbeat, margin } = detectDownbeat(env, fps, fit.bpm, fit.phase);
  const firstBeat = fit.phase + downbeat * (60 / fit.bpm);
  if (!(firstBeat < durationSeconds)) return null;
  return {
    ...fit,
    downbeat,
    downbeatMargin: Math.round(margin * 1000) / 1000,
    downbeatConfident: margin >= DOWNBEAT_CONFIDENT_MARGIN,
    firstBeat: Math.round(firstBeat * 10000) / 10000,
  };
}

/**
 * Beats at a constant tempo. `firstBeat` is the first downbeat (bar 1, beat 1); the beats before it, if any, are
 * the pickup and are numbered as bar 0 so that every bar line in the map is a real downbeat.
 */
export function projectBeats(
  bpm: number,
  durationSeconds: number,
  firstBeat: number = 0,
): BeatMarker[] {
  if (!(bpm >= 30 && bpm <= 300) || !Number.isFinite(durationSeconds) || !Number.isFinite(firstBeat) || firstBeat < 0) return [];
  const period = 60 / bpm;
  const out: BeatMarker[] = [];
  // pickup beats before the first downbeat
  const pickup = Math.floor(firstBeat / period + 1e-9);
  for (let k = pickup; k >= 1; k--) {
    const t = firstBeat - k * period;
    out.push({ t: Math.round(t * 1000) / 1000, beat: 4 - ((k - 1) % 4), bar: 0 });
  }
  let beatIdx = 1;
  for (let t = firstBeat; t < durationSeconds; t += period) {
    const bar = Math.floor((beatIdx - 1) / 4) + 1;
    const beat = ((beatIdx - 1) % 4) + 1;
    out.push({ t: Math.round(t * 1000) / 1000, beat, bar });
    beatIdx += 1;
  }
  return out;
}

export function detectDrops(energyCurve: EnergySample[]): Drop[] {
  if (energyCurve.length < ROLLING_MEAN_WINDOW + 2) return [];
  const out: Drop[] = [];
  const samplePeriod =
    energyCurve.length >= 2 ? energyCurve[1].t - energyCurve[0].t : ENERGY_WINDOW_SECONDS;
  const minSustainSamples = Math.max(
    1,
    Math.floor(DROP_MIN_SUSTAIN_SECONDS / samplePeriod),
  );

  // Sliding mean + variance over a window of size ROLLING_MEAN_WINDOW.
  let runStart = -1;
  let runMaxIntensity = 0;
  let runMaxT = 0;
  for (let i = ROLLING_MEAN_WINDOW; i < energyCurve.length; i++) {
    let sum = 0;
    for (let j = i - ROLLING_MEAN_WINDOW; j < i; j++) sum += energyCurve[j].energy;
    const mean = sum / ROLLING_MEAN_WINDOW;
    let varSum = 0;
    for (let j = i - ROLLING_MEAN_WINDOW; j < i; j++) {
      const d = energyCurve[j].energy - mean;
      varSum += d * d;
    }
    const sigma = Math.sqrt(varSum / ROLLING_MEAN_WINDOW);
    const v = energyCurve[i].energy;
    const intensity = sigma > 0 ? (v - mean) / sigma : 0;
    if (intensity >= DROP_THRESHOLD_SIGMA) {
      if (runStart < 0) {
        runStart = i;
        runMaxIntensity = intensity;
        runMaxT = energyCurve[i].t;
      }
      if (intensity > runMaxIntensity) {
        runMaxIntensity = intensity;
        runMaxT = energyCurve[i].t;
      }
    } else {
      if (runStart >= 0 && i - runStart >= minSustainSamples) {
        // Normalise intensity to a 0..1 scale — anything >5σ saturates.
        const clamped = Math.min(1, runMaxIntensity / 5);
        out.push({ t: runMaxT, intensity: Math.round(clamped * 100) / 100 });
      }
      runStart = -1;
      runMaxIntensity = 0;
    }
  }
  // Trailing run
  if (runStart >= 0 && energyCurve.length - runStart >= minSustainSamples) {
    const clamped = Math.min(1, runMaxIntensity / 5);
    out.push({ t: runMaxT, intensity: Math.round(clamped * 100) / 100 });
  }
  return out;
}
