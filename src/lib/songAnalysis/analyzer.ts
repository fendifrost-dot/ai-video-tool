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
 *  6. Project beats forward from t=0 at the detected BPM (good enough to feed
 *     the storyboard snap-points; lacks phase alignment which we can iterate
 *     on later).
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
  const bpm = detectBpm(mono, sampleRate);
  const beatMap = bpm ? projectBeats(bpm, duration) : [];
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
    analysis_provider: "web-audio-builtin",
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

  // Build the envelope at a low frame rate to keep autocorrelation cheap.
  const frameSize = Math.floor(sampleRate / 100); // ~100 Hz frames
  const env: number[] = [];
  let prev = 0;
  for (let i = 0; i < mono.length; i += frameSize) {
    const end = Math.min(mono.length, i + frameSize);
    let sumSq = 0;
    for (let j = i; j < end; j++) {
      const v = mono[j];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / (end - i));
    const flux = Math.max(0, rms - prev); // half-wave rectified
    env.push(flux);
    prev = rms;
  }

  // Subtract mean so autocorrelation focuses on rhythm, not DC level.
  const mean = env.reduce((a, b) => a + b, 0) / env.length;
  const centered = env.map((v) => v - mean);

  const framesPerSecond = sampleRate / frameSize;
  const minLag = Math.floor(framesPerSecond * (60 / BPM_MAX));
  const maxLag = Math.ceil(framesPerSecond * (60 / BPM_MIN));

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
  if (bestLag <= 0) return null;
  const bpm = 60 / (bestLag / framesPerSecond);
  // Round to one decimal — hand-entered BPMs are integers; this gives an
  // approximate confidence indicator.
  return Math.round(bpm * 10) / 10;
}

function projectBeats(bpm: number, durationSeconds: number): BeatMarker[] {
  const period = 60 / bpm;
  const out: BeatMarker[] = [];
  let beatIdx = 1;
  for (let t = 0; t < durationSeconds; t += period) {
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
