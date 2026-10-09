/**
 * Match a performance take to the song by its audio (Fendi, 2026-10-03: Setup "should perform/confirm …
 * performance-to-song synchronization").
 *
 * The take was sung to the song playing in the room, so its audio track contains the song. Where the two line up
 * is the offset between the take's clock and the song's:
 *
 *     song_time = take_time + offset_seconds
 *
 * Two passes, the same idea as scripts/sync/align_song_performance.py:
 *   1. coarse — the onset envelopes of the whole song and the whole take are cross-correlated (cheap, robust to the
 *      room: it only asks when things get louder);
 *   2. fine — windows of the take are matched against the song around the coarse answer with GCC-PHAT (sharp, phase
 *      only), and the windows vote. The answer is the median; how many windows agree with it is the confidence.
 *
 * Nothing here plays, stretches or resamples footage. It measures one number, once; every box's source range is
 * then arithmetic on that number (media.ts takeRangeForBox).
 *
 * Pure module: typed arrays in, numbers out. The browser decode lives in syncAudio.ts.
 */

export type MatchResult = {
  /** song_time = take_time + offsetSeconds. Positive: the song was already playing when the recording started. */
  offsetSeconds: number;
  driftPpm: number;
  method: string;
  confidence: {
    windowsTotal: number;
    windowsConsistent: number;
    medianOffsetSeconds: number;
    minOffsetSeconds: number;
    maxOffsetSeconds: number;
    peakSharpnessMedian: number;
  };
};

export const MATCH_METHOD = "browser_envelope_gcc_phat";
/** Windows within this of the median count as agreeing with it. */
export const CONSISTENT_WITHIN_SECONDS = 0.025;

// ---------------------------------------------------------------------------
// FFT (iterative radix-2, in place)
// ---------------------------------------------------------------------------

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error("fft length must be a power of two");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/**
 * Cross-correlation c[lag] = Σ a[n]·b[n + lag], for lags in [-maxLag, +maxLag] (samples). With `phat` the spectrum
 * is whitened first (GCC-PHAT): only phase is kept, so the peak is sharp even when the two recordings are EQ'd
 * differently (a phone in a room against the master).
 * Returns the best lag, its value, and how far it stands above the rest (peak / mean |c| over the searched lags).
 */
export function bestLag(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  maxLag: number,
  opts: { phat?: boolean; minLag?: number } = {},
): { lag: number; peak: number; sharpness: number } | null {
  const n = nextPow2(a.length + b.length);
  const ar = new Float64Array(n);
  const ai = new Float64Array(n);
  const br = new Float64Array(n);
  const bi = new Float64Array(n);
  for (let i = 0; i < a.length; i++) ar[i] = a[i];
  for (let i = 0; i < b.length; i++) br[i] = b[i];
  fft(ar, ai);
  fft(br, bi);
  for (let i = 0; i < n; i++) {
    // conj(A) · B
    let r = ar[i] * br[i] + ai[i] * bi[i];
    let m = ar[i] * bi[i] - ai[i] * br[i];
    if (opts.phat) {
      const mag = Math.hypot(r, m);
      if (mag > 1e-12) {
        r /= mag;
        m /= mag;
      } else {
        r = 0;
        m = 0;
      }
    }
    ar[i] = r;
    ai[i] = m;
  }
  fft(ar, ai, true);
  const lo = Math.max(-maxLag, opts.minLag ?? -maxLag, -(n >> 1) + 1);
  const hi = Math.min(maxLag, (n >> 1) - 1);
  let best = lo;
  let peak = -Infinity;
  let sum = 0;
  let count = 0;
  for (let lag = lo; lag <= hi; lag++) {
    const v = ar[lag >= 0 ? lag : n + lag];
    sum += Math.abs(v);
    count++;
    if (v > peak) {
      peak = v;
      best = lag;
    }
  }
  if (!(peak > 0) || count === 0) return null;
  const mean = sum / count;
  return { lag: best, peak, sharpness: mean > 0 ? peak / mean : 0 };
}

// ---------------------------------------------------------------------------
// The match
// ---------------------------------------------------------------------------

/** Onset strength at `rate` Hz: how much louder each frame is than the one before (half-wave rectified log energy). */
export function onsetEnvelope(x: ArrayLike<number>, sampleRate: number, rate = 100): Float64Array {
  const hop = Math.max(1, Math.round(sampleRate / rate));
  const frames = Math.floor(x.length / hop);
  const env = new Float64Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    const base = f * hop;
    for (let i = 0; i < hop; i++) {
      const v = x[base + i];
      e += v * v;
    }
    const cur = Math.log1p((e / hop) * 1e4);
    env[f] = f === 0 ? 0 : Math.max(0, cur - prev);
    prev = cur;
  }
  // remove the mean so a constant bed does not correlate with itself at every lag
  let mean = 0;
  for (let f = 0; f < frames; f++) mean += env[f];
  mean /= Math.max(1, frames);
  for (let f = 0; f < frames; f++) env[f] -= mean;
  return env;
}

function rms(x: ArrayLike<number>, from = 0, to = x.length): number {
  let e = 0;
  const n = Math.max(1, to - from);
  for (let i = from; i < to; i++) e += x[i] * x[i];
  return Math.sqrt(e / n);
}

const median = (v: number[]) => {
  const s = [...v].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Where the take sits on the song clock. Both signals are mono at the same sample rate. Null when the take has no
 * usable audio (silence, or a file with no audio track decoded to zeros) or nothing in it lines up with the song.
 */
export function matchTakeToSong(
  song: Float32Array | Float64Array,
  take: Float32Array | Float64Array,
  sampleRate: number,
  opts: { windowSeconds?: number; windows?: number; searchSeconds?: number } = {},
): MatchResult | null {
  if (song.length < sampleRate * 2 || take.length < sampleRate * 2) return null;
  if (rms(take) < 1e-4 || rms(song) < 1e-4) return null;

  // 1. coarse, on envelopes at 100 Hz. lag (frames) maximises Σ take[n]·song[n + lag] → song_time = take_time + lag.
  const envRate = 100;
  const eSong = onsetEnvelope(song, sampleRate, envRate);
  const eTake = onsetEnvelope(take, sampleRate, envRate);
  const coarse = bestLag(eTake, eSong, Math.max(eSong.length, eTake.length) - 1);
  if (!coarse || coarse.sharpness < 4) return null;
  const coarseSeconds = coarse.lag / envRate;

  // 2. fine: windows of the take against the song around the coarse answer
  const winSec = opts.windowSeconds ?? 10;
  const want = opts.windows ?? 12;
  const search = opts.searchSeconds ?? 0.5;
  const win = Math.round(winSec * sampleRate);
  const pad = Math.round(search * sampleRate);
  const takeSeconds = take.length / sampleRate;
  const usable = Math.max(0, takeSeconds - winSec);
  const starts: number[] = [];
  const count = Math.max(1, Math.min(want, Math.floor(usable / (winSec / 2)) + 1));
  for (let i = 0; i < count; i++) starts.push(count === 1 ? 0 : (usable * i) / (count - 1));

  const offsets: number[] = [];
  const at: number[] = [];
  const sharp: number[] = [];
  let total = 0;
  for (const t0 of starts) {
    const a0 = Math.round(t0 * sampleRate);
    const a1 = Math.min(take.length, a0 + win);
    const b0 = Math.round((t0 + coarseSeconds) * sampleRate) - pad;
    const b1 = b0 + (a1 - a0) + 2 * pad;
    if (b0 < 0 || b1 > song.length || a1 - a0 < sampleRate) continue; // the window falls outside the song
    total++;
    if (rms(take, a0, a1) < 1e-4) continue; // a silent stretch of the take cannot vote
    const r = bestLag(take.subarray(a0, a1), song.subarray(b0, b1), 2 * pad, { phat: true, minLag: 0 });
    if (!r || r.sharpness < 6) continue;
    // take[a0 + n] ↔ song[b0 + n + lag]  →  offset = (b0 + lag − a0) / sr
    offsets.push((b0 + r.lag - a0) / sampleRate);
    at.push(t0 + winSec / 2);
    sharp.push(r.sharpness);
  }
  if (offsets.length === 0) return null;

  const med = median(offsets);
  const keep = offsets.map((o, i) => ({ o, t: at[i] })).filter((p) => Math.abs(p.o - med) <= CONSISTENT_WITHIN_SECONDS);
  // drift: a line through the agreeing windows (offset against take time). Parts per million of take time.
  let driftPpm = 0;
  if (keep.length >= 4) {
    const mt = keep.reduce((s, p) => s + p.t, 0) / keep.length;
    const mo = keep.reduce((s, p) => s + p.o, 0) / keep.length;
    const den = keep.reduce((s, p) => s + (p.t - mt) ** 2, 0);
    if (den > 1) driftPpm = (keep.reduce((s, p) => s + (p.t - mt) * (p.o - mo), 0) / den) * 1e6;
  }
  // with drift d the model is song = take·(1 + d) + offset₀; report the offset at take time 0
  const offset0 = keep.length >= 4 ? med - (driftPpm / 1e6) * median(keep.map((p) => p.t)) : med;
  return {
    offsetSeconds: Math.round(offset0 * 1e4) / 1e4,
    driftPpm: Math.round(driftPpm * 10) / 10,
    method: MATCH_METHOD,
    confidence: {
      windowsTotal: total,
      windowsConsistent: keep.length,
      medianOffsetSeconds: Math.round(med * 1e4) / 1e4,
      minOffsetSeconds: Math.round(Math.min(...keep.map((p) => p.o)) * 1e4) / 1e4,
      maxOffsetSeconds: Math.round(Math.max(...keep.map((p) => p.o)) * 1e4) / 1e4,
      peakSharpnessMedian: Math.round(median(sharp) * 10) / 10,
    },
  };
}

/** A measurement the tool will accept without asking: most windows agree, tightly, and the drift is small. */
export function isConfidentMatch(m: MatchResult): boolean {
  const c = m.confidence;
  return c.windowsConsistent >= 3 && c.windowsConsistent / Math.max(1, c.windowsTotal) >= 0.6 && Math.abs(m.driftPpm) < 200;
}
