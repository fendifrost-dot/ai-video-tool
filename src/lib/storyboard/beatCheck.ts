/**
 * Did the footage change when it was asked to? (Fendi, 2026-10-03: "When AVT says a visual change should occur at
 * time X, does the returned footage actually change around X? … Do not call Seedance timing 'working' simply because
 * the event eventually occurs. We need measured temporal adherence.")
 *
 * A clip that was asked for with a script — "from 1.9 s: the room goes dark" — is measured here against that script.
 * Every frame of the clip is reduced to a small grid of colour (media/frameSeries.ts), and this module finds the
 * moments at which the picture goes from one steady state to another:
 *
 *   1. CHANGE POINTS. The frames are cut where cutting them explains the most of how they differ (the split that
 *      leaves two runs each as alike as possible), again inside each run, for as long as a cut separates two states
 *      that differ by more than the frames inside them do. A man performing moves in every frame; that is noise
 *      inside a run, not a change of state.
 *   2. WHEN IT BEGINS. A change is not instant. Around each cut the frames are placed on the line from the state
 *      before to the state after (0 = still the old picture, 1 = the new one): the change BEGINS at the last frame
 *      still on the old side and has ARRIVED at the first frame on the new side.
 *   3. AGAINST THE SCRIPT. The asked beats and the changes found are paired in order. For each beat:
 *        error = when the change began − when it was asked for.
 *
 * What this measures is THAT the picture changed and WHEN. Whether the change is the one that was asked for (the
 * light died, not the camera cut away) is not something arithmetic on colour can say: the frames before, at and after
 * each beat are shown beside the numbers, and that judgement stays with whoever looks.
 *
 * Pure module: numbers in, numbers out.
 */

/** One frame of a clip, reduced: its time (seconds from the clip's first frame) and its picture as cell means, 0–1. */
export type FrameSig = { t: number; cells: number[] };

export type AskedChange = { id: string; offset: number; kinds: string[]; says: string };

export type ChangePoint = {
  /** When the change begins, is half made, and has arrived — seconds from the clip's first frame. */
  begins: number;
  half: number;
  arrived: number;
  /** How far apart the two states are: the root-mean-square difference per cell value, 0–1. */
  size: number;
  /** The same, in units of how much the frames inside each state differ from their own state. */
  strength: number;
  /** "light" when the picture as a whole got brighter, darker or changed colour; "picture" when it is the layout that changed. */
  kind: "light" | "picture";
  /** Mean brightness before and after, 0–1. */
  lumaBefore: number;
  lumaAfter: number;
};

export type BeatVerdict = "on_time" | "displaced" | "not_seen";

export type MeasuredBeat = AskedChange & {
  verdict: BeatVerdict;
  /** The change paired with this beat (null = no change of the picture could be paired with it). */
  change: ChangePoint | null;
  /** begins − asked, seconds. Positive = late. Null when not seen. */
  error: number | null;
};

export type BeatCheck = {
  version: 2;
  measuredAt: string;
  frames: number;
  fps: number;
  clipSeconds: number;
  /** How much the frames of one steady state differ from that state, 0–1: the floor a change has to rise above. */
  noise: number;
  beats: MeasuredBeat[];
  /** Changes of the picture nobody asked for (a cut, a jump). */
  unasked: ChangePoint[];
  /** Everything asked for was seen on time / seen, but not when asked / something asked for was not seen. */
  verdict: "kept" | "displaced" | "not_kept";
  /** The picture's distance from how the clip opens, frame by frame (t, distance 0–1, brightness 0–1): the curve the numbers were read from. */
  series: [number, number, number][];
};

/** A change that begins within this of its asked time is on time: six frames at 24 fps, half a beat at 120 BPM. */
export const ON_TIME_SECONDS = 0.25;
/** Two states are different states when they differ by at least this much per cell value (about 6 of 255)… */
export const MIN_CHANGE = 0.024;
/**
 * …and by at least this many times what could be expected between the means of two runs of the SAME state: the
 * frames inside a state differ from it (he moves, the sensor is noisy), so two runs of it differ by about that much
 * divided by the root of their lengths. Frames next to each other are alike, so a run counts for fewer independent
 * frames than it has (`CORRELATED_FRAMES` of them are one).
 */
export const MIN_STRENGTH = 1.5;
export const CORRELATED_FRAMES = 4;
/** Two changes closer together than this are one change still under way (a light that takes a second to die is not three events). */
export const SAME_CHANGE_GAP_SECONDS = 0.25;
/** A state lasts at least this long on each side of a change. */
export const MIN_STATE_SECONDS = 0.2;
/** A change of the whole picture's brightness or colour of at least this much is a change of LIGHT. */
export const LIGHT_SHIFT = 0.035;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

type Series = { t: number[]; x: Float64Array[]; d: number; prefix: Float64Array[]; sq: Float64Array };

function build(frames: readonly FrameSig[]): Series | null {
  const usable = frames.filter((f) => Number.isFinite(f.t) && Array.isArray(f.cells) && f.cells.length > 0).sort((a, b) => a.t - b.t);
  if (usable.length === 0) return null;
  const d = usable[0].cells.length;
  const same = usable.filter((f) => f.cells.length === d);
  const x = same.map((f) => Float64Array.from(f.cells));
  // prefix sums of the vectors and of their squared lengths: the mean and spread of any run in O(d)
  const prefix: Float64Array[] = [new Float64Array(d)];
  const sq = new Float64Array(same.length + 1);
  for (let i = 0; i < x.length; i++) {
    const next = new Float64Array(d);
    let s = 0;
    for (let j = 0; j < d; j++) {
      next[j] = prefix[i][j] + x[i][j];
      s += x[i][j] * x[i][j];
    }
    prefix.push(next);
    sq[i + 1] = sq[i] + s;
  }
  return { t: same.map((f) => f.t), x, d, prefix, sq };
}

function meanOf(s: Series, a: number, b: number): Float64Array {
  const n = Math.max(1, b - a);
  const out = new Float64Array(s.d);
  for (let j = 0; j < s.d; j++) out[j] = (s.prefix[b][j] - s.prefix[a][j]) / n;
  return out;
}

/** Sum over the run [a, b) of each frame's squared distance from the run's own mean. */
function spread(s: Series, a: number, b: number): number {
  const n = b - a;
  if (n <= 0) return 0;
  let sumSq = 0;
  for (let j = 0; j < s.d; j++) {
    const v = s.prefix[b][j] - s.prefix[a][j];
    sumSq += v * v;
  }
  return Math.max(0, s.sq[b] - s.sq[a] - sumSq / n);
}

function distance(u: Float64Array, v: Float64Array): number {
  let s = 0;
  for (let j = 0; j < u.length; j++) s += (u[j] - v[j]) * (u[j] - v[j]);
  return Math.sqrt(s / u.length);
}

const lumaOf = (v: Float64Array | readonly number[]): number => {
  // cells are r, g, b triples
  let y = 0;
  const n = Math.floor(v.length / 3);
  for (let i = 0; i < n; i++) y += 0.2126 * v[i * 3] + 0.7152 * v[i * 3 + 1] + 0.0722 * v[i * 3 + 2];
  return n ? y / n : 0;
};

const tintOf = (v: Float64Array): [number, number] => {
  // how far the picture as a whole leans red–cyan and blue–yellow
  let rg = 0;
  let by = 0;
  const n = Math.floor(v.length / 3);
  for (let i = 0; i < n; i++) {
    rg += v[i * 3] - v[i * 3 + 1];
    by += v[i * 3 + 2] - (v[i * 3] + v[i * 3 + 1]) / 2;
  }
  return n ? [rg / n, by / n] : [0, 0];
};

type Cut = { k: number; a: number; b: number; size: number; strength: number };

/** The best place to cut the run [a, b) in two, with at least `m` frames on each side. */
function bestCut(s: Series, a: number, b: number, m: number): Cut | null {
  if (b - a < 2 * m) return null;
  const whole = spread(s, a, b);
  let best = -1;
  let bestWithin = Infinity;
  for (let k = a + m; k <= b - m; k++) {
    const within = spread(s, a, k) + spread(s, k, b);
    if (within < bestWithin) {
      bestWithin = within;
      best = k;
    }
  }
  if (best < 0 || !(whole > 0)) return null;
  const size = distance(meanOf(s, a, best), meanOf(s, best, b));
  const noise = Math.sqrt(bestWithin / ((b - a) * s.d));
  return { k: best, a, b, size, strength: strengthOf(size, noise, best - a, b - best) };
}

/** How many times larger a difference between two runs is than two runs of one state would show. */
function strengthOf(size: number, noise: number, n1: number, n2: number): number {
  const independent = (n: number) => Math.max(1, n / CORRELATED_FRAMES);
  const expected = noise * Math.sqrt(1 / independent(n1) + 1 / independent(n2));
  return expected > 1e-6 ? size / expected : size > 0 ? 999 : 0;
}

/**
 * Every moment in a clip at which the picture goes from one steady state to another, in time order. `max` bounds how
 * many are looked for.
 */
export function findChanges(frames: readonly FrameSig[], max = 6): { changes: ChangePoint[]; noise: number; fps: number; clipSeconds: number; series: [number, number, number][] } {
  const s = build(frames);
  if (!s || s.t.length < 4) return { changes: [], noise: 0, fps: 0, clipSeconds: 0, series: [] };
  const n = s.t.length;
  const span = s.t[n - 1] - s.t[0];
  const fps = span > 0 ? (n - 1) / span : 0;
  const m = Math.max(3, Math.round(MIN_STATE_SECONDS * (fps || 24)));
  const cuts: Cut[] = [];
  const queue: [number, number][] = [[0, n]];
  while (queue.length > 0 && cuts.length < max) {
    // the most significant cut of any run still open
    let pick: { cut: Cut; at: number } | null = null;
    queue.forEach(([a, b], at) => {
      const c = bestCut(s, a, b, m);
      if (c && c.size >= MIN_CHANGE && c.strength >= MIN_STRENGTH && (!pick || c.size * Math.min(c.strength, 8) > pick.cut.size * Math.min(pick.cut.strength, 8))) pick = { cut: c, at };
    });
    if (!pick) break;
    const { cut, at } = pick as { cut: Cut; at: number };
    queue.splice(at, 1, [cut.a, cut.k], [cut.k, cut.b]);
    cuts.push(cut);
  }
  cuts.sort((p, q) => p.k - q.k);
  const edges = [0, ...cuts.map((c) => c.k), n];

  /** The change across the cuts edges[i+1 … j+1]: from the state before the first of them to the state after the last. */
  const changeAcross = (i: number, j: number): ChangePoint => {
    const runStart = edges[i];
    const firstCut = edges[i + 1];
    const lastCut = edges[j + 1];
    const runEnd = edges[j + 2];
    const before = meanOf(s, runStart, firstCut);
    const after = meanOf(s, lastCut, runEnd);
    const size = distance(before, after);
    // every frame, on the line from the state before (0) to the state after (1)
    const dir = new Float64Array(s.d);
    let len = 0;
    for (let q = 0; q < s.d; q++) {
      dir[q] = after[q] - before[q];
      len += dir[q] * dir[q];
    }
    const along = (f: number) => {
      let p = 0;
      for (let q = 0; q < s.d; q++) p += (s.x[f][q] - before[q]) * dir[q];
      return len > 0 ? p / len : 0;
    };
    // A cut sits where the two runs are most alike within themselves; the change itself can start before it and
    // arrive after it. It BEGINS at the first frame from which the picture never goes back to the old state.
    let begin = lastCut;
    while (begin - 1 >= runStart && along(begin - 1) > 0.2) begin--;
    let arrive = begin;
    for (let f = begin; f < runEnd; f++) {
      arrive = f;
      if (along(f) >= 0.8) break;
    }
    let half = begin;
    for (let f = begin; f <= arrive; f++) {
      half = f;
      if (along(f) >= 0.5) break;
    }
    const noise = Math.sqrt((spread(s, runStart, firstCut) + spread(s, lastCut, runEnd)) / (Math.max(1, firstCut - runStart + runEnd - lastCut) * s.d));
    const lumaBefore = lumaOf(before);
    const lumaAfter = lumaOf(after);
    const [rg0, by0] = tintOf(before);
    const [rg1, by1] = tintOf(after);
    const light = Math.abs(lumaAfter - lumaBefore) >= LIGHT_SHIFT || Math.hypot(rg1 - rg0, by1 - by0) >= LIGHT_SHIFT;
    return {
      begins: round3(s.t[begin] - s.t[0]),
      half: round3(s.t[half] - s.t[0]),
      arrived: round3(s.t[arrive] - s.t[0]),
      size: round3(size),
      strength: round3(Math.min(999, strengthOf(size, noise, firstCut - runStart, runEnd - lastCut))),
      kind: light ? "light" : "picture",
      lumaBefore: round3(lumaBefore),
      lumaAfter: round3(lumaAfter),
    };
  };

  // Cuts that follow each other with no steady state between them are ONE change still under way: a light that
  // takes a second to die is cut into several steps above, and is one event.
  const groups: [number, number][] = [];
  for (let i = 0; i < cuts.length; i++) {
    const last = groups[groups.length - 1];
    if (last) {
      const prev = changeAcross(last[0], last[1]);
      const next = changeAcross(i, i);
      if (next.begins - prev.arrived <= SAME_CHANGE_GAP_SECONDS) {
        last[1] = i;
        continue;
      }
    }
    groups.push([i, i]);
  }
  const changes = groups.map(([i, j]) => changeAcross(i, j)).filter((c) => c.size >= MIN_CHANGE);
  // the floor: how much frames differ from the state they are in, over the whole clip
  let within = 0;
  for (let i = 0; i + 1 < edges.length; i++) within += spread(s, edges[i], edges[i + 1]);
  const noise = Math.sqrt(within / (n * s.d));
  const open = meanOf(s, 0, Math.min(n, Math.max(m, 3)));
  const series = s.x.map((v, i): [number, number, number] => [round3(s.t[i] - s.t[0]), round3(distance(v, open)), round3(lumaOf(v))]);
  return { changes, noise: round3(noise), fps: round3(fps), clipSeconds: round3(span + (fps > 0 ? 1 / fps : 0)), series };
}

/**
 * Pair the asked beats with the changes found, both in time order, so the total distance between each beat and its
 * change is the least it can be. A beat may be left without a change (not seen); a change without a beat (unasked).
 * A beat is never paired with a change more than `reach` seconds from it.
 */
export function pairBeats(asked: readonly AskedChange[], changes: readonly ChangePoint[], reach: number): (number | null)[] {
  const A = asked.length;
  const C = changes.length;
  const SKIP = reach; // leaving a beat unpaired costs as much as the farthest pairing allowed
  // best[i][j] = least cost of settling beats i.. with changes j..
  const best: number[][] = Array.from({ length: A + 1 }, () => new Array<number>(C + 1).fill(0));
  const take: ("pair" | "skipBeat" | "skipChange")[][] = Array.from({ length: A + 1 }, () => new Array(C + 1).fill("skipBeat"));
  for (let i = A - 1; i >= 0; i--) best[i][C] = best[i + 1][C] + SKIP;
  for (let i = A - 1; i >= 0; i--) {
    for (let j = C - 1; j >= 0; j--) {
      const gap = Math.abs(changes[j].begins - asked[i].offset);
      const pair = gap <= reach ? gap + best[i + 1][j + 1] : Infinity;
      const skipBeat = SKIP + best[i + 1][j];
      const skipChange = best[i][j + 1];
      const least = Math.min(pair, skipBeat, skipChange);
      best[i][j] = least;
      take[i][j] = least === pair ? "pair" : least === skipChange ? "skipChange" : "skipBeat";
    }
  }
  const out: (number | null)[] = new Array(A).fill(null);
  let i = 0;
  let j = 0;
  while (i < A && j < C) {
    const step = take[i][j];
    if (step === "pair") {
      out[i] = j;
      i++;
      j++;
    } else if (step === "skipChange") j++;
    else i++;
  }
  return out;
}

/**
 * Measure a clip against the script it was asked for with. `asked` are the script's lines whose moment lies inside
 * the clip after its first frames (a state the clip OPENS in is not a change inside it and cannot be timed).
 */
export function measureBeats(frames: readonly FrameSig[], asked: readonly AskedChange[], measuredAt: string): BeatCheck {
  const timed = [...asked].filter((b) => b.offset >= MIN_STATE_SECONDS / 2).sort((a, b) => a.offset - b.offset);
  const found = findChanges(frames, timed.length + 3);
  // a change counts for a beat when it begins within a second and a half of it — beyond that it is another event
  const pairs = pairBeats(timed, found.changes, 1.5);
  const used = new Set(pairs.filter((x): x is number => x != null));
  const beats: MeasuredBeat[] = timed.map((b, i) => {
    const change = pairs[i] != null ? found.changes[pairs[i]!] : null;
    const error = change ? round3(change.begins - b.offset) : null;
    return { ...b, change, error, verdict: !change ? "not_seen" : Math.abs(error!) <= ON_TIME_SECONDS ? "on_time" : "displaced" };
  });
  const verdict = beats.some((b) => b.verdict === "not_seen") ? "not_kept" : beats.some((b) => b.verdict === "displaced") ? "displaced" : "kept";
  return {
    version: 2,
    measuredAt,
    frames: frames.length,
    fps: found.fps,
    clipSeconds: found.clipSeconds,
    noise: found.noise,
    beats,
    unasked: found.changes.filter((_, j) => !used.has(j)),
    verdict: beats.length === 0 ? "kept" : verdict,
    series: found.series,
  };
}

/** A stored check, read back. Null when it is not one (or from an older way of measuring). */
export function parseBeatCheck(value: unknown): BeatCheck | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<BeatCheck>;
  if (v.version !== 2 || !Array.isArray(v.beats) || typeof v.measuredAt !== "string") return null;
  return v as BeatCheck;
}

/** True when a stored check answers this script (the same beats at the same moments). */
export function checkAnswers(check: BeatCheck | null, asked: readonly AskedChange[]): boolean {
  if (!check) return false;
  const timed = asked.filter((b) => b.offset >= MIN_STATE_SECONDS / 2);
  return timed.length === check.beats.length && timed.every((b) => check.beats.some((m) => m.id === b.id && Math.abs(m.offset - b.offset) < 0.005));
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(2)} s`;

/** One beat's result in words. */
export function beatLine(b: MeasuredBeat): string {
  if (!b.change || b.error == null) return `asked at ${b.offset.toFixed(2)} s — no change of the picture was found near it`;
  const took = Math.max(0, b.change.arrived - b.change.begins);
  return `asked at ${b.offset.toFixed(2)} s — the ${b.change.kind === "light" ? "light" : "picture"} begins to change at ${b.change.begins.toFixed(2)} s (${signed(b.error)})${took >= 0.1 ? `, arrived by ${b.change.arrived.toFixed(2)} s` : ""}`;
}

export const VERDICT_LABEL: Record<BeatVerdict, string> = { on_time: "on time", displaced: "not on time", not_seen: "not seen" };
