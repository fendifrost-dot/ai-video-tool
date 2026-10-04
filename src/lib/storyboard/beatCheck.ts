/**
 * Did the footage change when it was asked to? (Fendi, 2026-10-03: "When AVT says a visual change should occur at
 * time X, does the returned footage actually change around X? … Do not call Seedance timing 'working' simply because
 * the event eventually occurs. We need measured temporal adherence.")
 *
 * A clip that was asked for with a script — "from 1.9 s: the room goes dark" — is measured here against that script.
 * Every frame of the clip is reduced to a small grid of colour (media/frameSeries.ts). Two things are then looked for:
 *
 *   1. A CHANGE OF LIGHT. Each frame is summed up as the light of the whole picture: how bright it is, how much
 *      contrast it has, which way its colour leans. A man performing moves in every frame and a camera drifts, and
 *      neither moves these numbers — measured on real restaged takes they stay within about a hundredth of
 *      themselves — while a light that dies, comes up or changes colour moves them by many times that. The frames are
 *      cut where cutting them explains the most of how these numbers differ, again inside each run, for as long as a
 *      cut separates two runs that differ by more than the frames inside them do.
 *   2. A JUMP OF THE PICTURE. Two frames next to each other that are different pictures (a cut inside the clip).
 *      Ordinary movement is not a change of state and is not reported: on real clips it moves the grid as much as a
 *      small staged change would, so nothing honest can be said about it from colour alone.
 *
 *   WHEN IT BEGINS. A change is not instant. Around each cut the frames are placed on the line from the state before
 *   to the state after (0 = still the old light, 1 = the new one): the change BEGINS at the first frame from which
 *   the picture never goes back, and has ARRIVED at the first frame on the new side.
 *
 *   AGAINST THE SCRIPT. The asked beats and the changes found are paired in order. For each beat:
 *        error = when the change began − when it was asked for.
 *   A beat that asked for something other than light (a camera move, an action) and has no change near it is
 *   UNMEASURED, not failed: it is for the eye.
 *
 *   WHICH CHANGE IS THE ONE ASKED FOR is something this cannot know. It sees that the light changed, not what into.
 *   So a beat is timed only when there is no choice to make: no more changes of light near the beats than beats.
 *   When the clip changes its light MORE times than it was asked to — it opens dark and comes up before the change
 *   that was asked, say — every beat near those changes is UNDETERMINED: the changes that could be it are listed and
 *   no time is given. A change that happens in steps with the light standing between them (cut as one change because
 *   the light never quite settles) counts as its steps: one of them may be the change asked for and another not.
 *   (The fresh section's retest did exactly that. It opened dark, came up, and lit the mirror ball a third of a
 *   second later; the first version of this check read that as one change beginning 1.40 s early and reported it as
 *   the mirror ball's timing. A number like that, handed to anything that retries on its own, is optimised against
 *   the wrong event.)
 *
 * What this measures is THAT the light changed and WHEN. Whether the change is the one that was asked for (the pool
 * died and points of light came up, not the whole frame fading) is not something arithmetic on colour can say: the
 * frames before, at and after each beat are shown beside the numbers, and that judgement stays with whoever looks.
 * Everything here is AUTOMATIC detection; what a person reads off the frames is kept elsewhere (acceptance.ts), as
 * theirs.
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
  /** "light" = the light of the whole picture changed (brighter, darker, another colour); "picture" = two neighbouring frames are different pictures (a jump). */
  kind: "light" | "picture";
  /** Mean brightness before and after, 0–1. */
  lumaBefore: number;
  lumaAfter: number;
  /**
   * When the change happened in steps with the light standing still between them for more than a quarter of a second:
   * each step, in time order. Absent for a change made in one go.
   */
  steps?: ChangePoint[];
};

/**
 * `unmeasured` = the beat asked for something colour cannot time (a camera move, an action) and nothing was found near it.
 * `undetermined` = the light changes more times near this beat than changes were asked for, so which is this beat's cannot be told.
 */
export type BeatVerdict = "on_time" | "displaced" | "not_seen" | "unmeasured" | "undetermined";

export type MeasuredBeat = AskedChange & {
  verdict: BeatVerdict;
  /** The change paired with this beat (null = no change of the picture could be paired with it). */
  change: ChangePoint | null;
  /** begins − asked, seconds. Positive = late. Null when not seen, and when which change is this beat's could not be told. */
  error: number | null;
  /** When undetermined: the changes of light that could be the one asked for, in time order. Never chosen between here. */
  candidates?: ChangePoint[];
  /** When undetermined: how many beats were asked for among those changes. */
  askedNear?: number;
};

export type BeatCheck = {
  version: 4;
  measuredAt: string;
  frames: number;
  fps: number;
  clipSeconds: number;
  /** How much the light of a frame differs from the light of the run it is in, 0–1: the floor a change has to rise above. */
  noise: number;
  beats: MeasuredBeat[];
  /** Changes of the picture nobody asked for (a cut, a jump). */
  unasked: ChangePoint[];
  /**
   * Everything that could be measured was seen on time / seen, but not when asked / a change of light that was asked
   * for was not seen / there were more changes than were asked for and no beat could be told from another.
   */
  verdict: "kept" | "displaced" | "not_kept" | "undetermined";
  /** The light's distance from how the clip opens, frame by frame (t, distance, brightness 0–1): the curve the numbers were read from. */
  series: [number, number, number][];
};

/** A change that begins within this of its asked time is on time: six frames at 24 fps, half a beat at 120 BPM. */
export const ON_TIME_SECONDS = 0.25;
/**
 * The light of two runs is a different light when their summaries (brightness, contrast, colour lean — each 0–1) are
 * at least this far apart. Measured: a restaged take of a man performing under a moving camera holds its brightness
 * within about ±0.01 over four seconds; a room that goes dark moves it by 0.1 and more.
 */
export const LIGHT_SHIFT = 0.035;
/**
 * …and at least this many times what two runs of the SAME light would show: the frames inside a run differ from it,
 * so two runs of it differ by about that much divided by the root of their lengths. Frames next to each other are
 * alike, so a run counts for fewer independent frames than it has (`CORRELATED_FRAMES` of them are one).
 */
export const MIN_STRENGTH = 3;
export const CORRELATED_FRAMES = 4;
/** Two changes closer together than this are one change still under way (a light that takes a second to die is not three events). */
export const SAME_CHANGE_GAP_SECONDS = 0.25;
/** A run between two cuts that itself covers this share of the way from the light before to the light after is the change still under way. */
export const STILL_TRAVELLING = 0.15;
/** Two cuts are steps of one change only when, together, they cover at least this share of what the larger covers alone. */
export const SAME_WAY = 0.9;
/** A change that takes at least this long to arrive is a drift (a camera move, a slow fade), not a moment. */
export const DRIFT_SECONDS = 0.5;
/** A state lasts at least this long on each side of a change. */
export const MIN_STATE_SECONDS = 0.2;
/** Two neighbouring frames are different PICTURES when their grids differ by at least this much per cell value… */
export const JUMP_SIZE = 0.06;
/** …and by this many times what neighbouring frames of this clip usually differ by. */
export const JUMP_TIMES_USUAL = 4;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

type Series = { t: number[]; x: Float64Array[]; d: number; prefix: Float64Array[]; sq: Float64Array };

function seriesOf(t: number[], x: Float64Array[]): Series {
  const d = x[0]?.length ?? 0;
  // prefix sums of the vectors and of their squared lengths: the mean and spread of any run in O(d)
  const prefix: Float64Array[] = [new Float64Array(d)];
  const sq = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) {
    const next = new Float64Array(d);
    let sum = 0;
    for (let j = 0; j < d; j++) {
      next[j] = prefix[i][j] + x[i][j];
      sum += x[i][j] * x[i][j];
    }
    prefix.push(next);
    sq[i + 1] = sq[i] + sum;
  }
  return { t, x, d, prefix, sq };
}

/** Mean brightness of a frame's cells (r, g, b triples), 0–1. */
const lumaOf = (v: readonly number[] | Float64Array): number => {
  let y = 0;
  const n = Math.floor(v.length / 3);
  for (let i = 0; i < n; i++) y += 0.2126 * v[i * 3] + 0.7152 * v[i * 3 + 1] + 0.0722 * v[i * 3 + 2];
  return n ? y / n : 0;
};

/**
 * The light of one frame as four numbers, each 0–1: how bright the picture is, how far its cells are from that
 * brightness (a lit pool in a dark room has a lot; an evenly lit room has little), and which way its colour leans
 * (red–green, blue–yellow). Where a figure stands and how he moves leaves all four nearly as they were.
 */
export function lightOf(cells: readonly number[]): [number, number, number, number] {
  const n = Math.floor(cells.length / 3);
  if (n === 0) return [0, 0, 0, 0];
  let y = 0;
  let rg = 0;
  let by = 0;
  const ys = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const r = cells[i * 3];
    const g = cells[i * 3 + 1];
    const b = cells[i * 3 + 2];
    ys[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    y += ys[i];
    rg += r - g;
    by += b - (r + g) / 2;
  }
  y /= n;
  let spreadY = 0;
  for (let i = 0; i < n; i++) spreadY += (ys[i] - y) * (ys[i] - y);
  return [y, Math.sqrt(spreadY / n), rg / n, by / n];
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

/** How far apart two summaries are (the straight-line distance between them). */
function distance(u: Float64Array, v: Float64Array): number {
  let sum = 0;
  for (let j = 0; j < u.length; j++) sum += (u[j] - v[j]) * (u[j] - v[j]);
  return Math.sqrt(sum);
}

/** How many times larger a difference between two runs is than two runs of one state would show. */
function strengthOf(size: number, noise: number, n1: number, n2: number): number {
  const independent = (n: number) => Math.max(1, n / CORRELATED_FRAMES);
  const expected = noise * Math.sqrt(1 / independent(n1) + 1 / independent(n2));
  return expected > 1e-6 ? size / expected : size > 0 ? 999 : 0;
}

type Cut = { k: number; a: number; b: number; size: number; strength: number };

/** The best place to cut the run [a, b) in two, with at least `m` frames on each side. */
function bestCut(s: Series, a: number, b: number, m: number): Cut | null {
  if (b - a < 2 * m) return null;
  let best = -1;
  let bestWithin = Infinity;
  for (let k = a + m; k <= b - m; k++) {
    const within = spread(s, a, k) + spread(s, k, b);
    if (within < bestWithin) {
      bestWithin = within;
      best = k;
    }
  }
  if (best < 0) return null;
  const size = distance(meanOf(s, a, best), meanOf(s, best, b));
  const noise = Math.sqrt(bestWithin / (b - a));
  return { k: best, a, b, size, strength: strengthOf(size, noise, best - a, b - best) };
}

/**
 * The best place to cut the run [a, b) in THREE: a stretch inside it that is lit differently from what is on both
 * sides of it. One cut cannot find a room that goes dark and comes up again — whichever side of the cut holds the
 * dark stretch also holds the light it returns to, the two halves look alike, and nothing is found. Null unless both
 * cuts are changes by the same measure a single cut is held to.
 */
function bestPair(s: Series, a: number, b: number, m: number): [Cut, Cut] | null {
  if (b - a < 3 * m) return null;
  let best: [number, number] | null = null;
  let bestWithin = Infinity;
  for (let k1 = a + m; k1 <= b - 2 * m; k1++) {
    const left = spread(s, a, k1);
    for (let k2 = k1 + m; k2 <= b - m; k2++) {
      const within = left + spread(s, k1, k2) + spread(s, k2, b);
      if (within < bestWithin) {
        bestWithin = within;
        best = [k1, k2];
      }
    }
  }
  if (!best) return null;
  const [k1, k2] = best;
  const noise = Math.sqrt(bestWithin / (b - a));
  const inside = meanOf(s, k1, k2);
  const first = distance(meanOf(s, a, k1), inside);
  const second = distance(inside, meanOf(s, k2, b));
  const cuts: [Cut, Cut] = [
    { k: k1, a, b: k2, size: first, strength: strengthOf(first, noise, k1 - a, k2 - k1) },
    { k: k2, a: k1, b, size: second, strength: strengthOf(second, noise, k2 - k1, b - k2) },
  ];
  return cuts.every((c) => c.size >= LIGHT_SHIFT && c.strength >= MIN_STRENGTH) ? cuts : null;
}

/** The change of light across the cuts edges[i+1 … j+1]: from the light before the first of them to the light after the last. */
function lightChange(s: Series, edges: readonly number[], i: number, j: number): ChangePoint {
  const runStart = edges[i];
  const firstCut = edges[i + 1];
  const lastCut = edges[j + 1];
  const runEnd = edges[j + 2];
  const before = meanOf(s, runStart, firstCut);
  const after = meanOf(s, lastCut, runEnd);
  const size = distance(before, after);
  // every frame, on the line from the light before (0) to the light after (1)
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
  // A cut sits where the two runs are most alike within themselves; the change itself can start before it and arrive
  // after it. It BEGINS at the first frame from which the light never goes back to what it was.
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
  const noise = Math.sqrt((spread(s, runStart, firstCut) + spread(s, lastCut, runEnd)) / Math.max(1, firstCut - runStart + runEnd - lastCut));
  return {
    begins: round3(s.t[begin] - s.t[0]),
    half: round3(s.t[half] - s.t[0]),
    arrived: round3(s.t[arrive] - s.t[0]),
    size: round3(size),
    strength: round3(Math.min(999, strengthOf(size, noise, firstCut - runStart, runEnd - lastCut))),
    kind: "light",
    lumaBefore: round3(before[0]),
    lumaAfter: round3(after[0]),
  };
}

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((p, q) => p - q);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Every moment in a clip at which the LIGHT goes from one steady state to another, and every JUMP of the picture, in
 * time order. `max` bounds how many changes of light are looked for.
 */
export function findChanges(frames: readonly FrameSig[], max = 6): { changes: ChangePoint[]; noise: number; fps: number; clipSeconds: number; series: [number, number, number][] } {
  const usable = frames.filter((f) => Number.isFinite(f.t) && Array.isArray(f.cells) && f.cells.length >= 3).sort((a, b) => a.t - b.t);
  const cellsLength = usable[0]?.cells.length ?? 0;
  const same = usable.filter((f) => f.cells.length === cellsLength);
  if (same.length < 4) return { changes: [], noise: 0, fps: 0, clipSeconds: 0, series: [] };
  const t = same.map((f) => f.t);
  const n = t.length;
  const span = t[n - 1] - t[0];
  const fps = span > 0 ? (n - 1) / span : 0;
  const m = Math.max(3, Math.round(MIN_STATE_SECONDS * (fps || 24)));
  const s = seriesOf(t, same.map((f) => Float64Array.from(lightOf(f.cells))));

  // --- the light: cut the frames where the light of the whole picture changes
  const cuts: Cut[] = [];
  const queue: [number, number][] = [[0, n]];
  // what a run can be cut into is asked once: one cut where one is a change, otherwise a stretch inside it
  const asked = new Map<string, Cut[] | null>();
  const cutsOf = (a: number, b: number): Cut[] | null => {
    const key = `${a}:${b}`;
    if (!asked.has(key)) {
      const one = bestCut(s, a, b, m);
      asked.set(key, one && one.size >= LIGHT_SHIFT && one.strength >= MIN_STRENGTH ? [one] : bestPair(s, a, b, m));
    }
    return asked.get(key)!;
  };
  while (queue.length > 0 && cuts.length < max) {
    // the largest change of any run still open
    let pick: { found: Cut[]; at: number } | null = null;
    const sizeOf = (found: Cut[]) => Math.max(...found.map((c) => c.size));
    queue.forEach(([a, b], at) => {
      const found = cutsOf(a, b);
      if (found && (!pick || sizeOf(found) > sizeOf(pick.found))) pick = { found, at };
    });
    if (!pick) break;
    const { found, at } = pick as { found: Cut[]; at: number };
    const [a, b] = queue[at];
    const ks = found.map((c) => c.k);
    queue.splice(at, 1, ...[a, ...ks].map((from, i): [number, number] => [from, [...ks, b][i]]));
    cuts.push(...found);
  }
  cuts.sort((p, q) => p.k - q.k);
  const edges = [0, ...cuts.map((c) => c.k), n];
  // Cuts that follow each other with no steady light between them are ONE change still under way: a light that takes
  // a second to die is cut into several steps above, and is one event.
  // The same holds when the run between two cuts is not a steady light at all but the change still travelling: a
  // camera pushing in on a lit floor brightens the picture for two seconds, and that is one drift, not two events.
  const travelling = (from: number, to: number): boolean => {
    const a = edges[to]; // the run between cut `to - 1` and cut `to`
    const b = edges[to + 1];
    const third = Math.max(1, Math.floor((b - a) / 3));
    if (b - a < 3) return true;
    const before = meanOf(s, edges[from], edges[from + 1]);
    const after = meanOf(s, edges[to + 1], edges[to + 2]);
    const first = meanOf(s, a, a + third);
    const last = meanOf(s, b - third, b);
    let along = 0;
    let len = 0;
    for (let q = 0; q < s.d; q++) {
      along += (last[q] - first[q]) * (after[q] - before[q]);
      len += (after[q] - before[q]) * (after[q] - before[q]);
    }
    // the run itself covers a real share of the way from the light before to the light after
    return len > 0 && along / len >= STILL_TRAVELLING;
  };
  // Neither joins two cuts that go THERE AND BACK. A room that goes dark and comes up again has changed twice; joined,
  // it is a change from the light it had to the light it has again — no change at all — and both were dropped and
  // reported as jumps of the picture, so a beat that asked for the blackout was told nothing was seen. Steps of one
  // change go the same way: together they cover at least as much as the larger of them does alone.
  const sameWay = (group: readonly [number, number], i: number): boolean =>
    lightChange(s, edges, group[0], i).size >= SAME_WAY * Math.max(lightChange(s, edges, group[0], group[1]).size, lightChange(s, edges, i, i).size);
  const groups: [number, number][] = [];
  for (let i = 0; i < cuts.length; i++) {
    const last = groups[groups.length - 1];
    if (last && sameWay(last, i) && (lightChange(s, edges, i, i).begins - lightChange(s, edges, last[0], last[1]).arrived <= SAME_CHANGE_GAP_SECONDS || travelling(last[0], i))) {
      last[1] = i;
      continue;
    }
    groups.push([i, i]);
  }
  // A group joined because the light was still travelling between its cuts may all the same have STOOD between them
  // for longer than two steps of one change do: it is reported as one change (a camera pushing in is one drift) and
  // its steps are kept, because a beat cannot be timed against "the change" when one step may be the change that was
  // asked for and another something else.
  const stepsOf = (i: number, j: number): ChangePoint[] => {
    const runs: [number, number][] = [[i, i]];
    for (let k = i + 1; k <= j; k++) {
      const run = runs[runs.length - 1];
      if (lightChange(s, edges, k, k).begins - lightChange(s, edges, run[0], run[1]).arrived <= SAME_CHANGE_GAP_SECONDS) run[1] = k;
      else runs.push([k, k]);
    }
    return runs.map(([a, b]) => lightChange(s, edges, a, b));
  };
  const light = groups
    .map(([i, j]): ChangePoint => {
      const whole = lightChange(s, edges, i, j);
      const steps = i === j ? [] : stepsOf(i, j);
      return steps.length > 1 ? { ...whole, steps } : whole;
    })
    .filter((c) => c.size >= LIGHT_SHIFT);

  // --- the picture: two neighbouring frames that are different pictures (a cut inside the clip)
  const grid = same.map((f) => f.cells);
  const step = (i: number) => {
    let sum = 0;
    for (let j = 0; j < cellsLength; j++) sum += (grid[i][j] - grid[i - 1][j]) * (grid[i][j] - grid[i - 1][j]);
    return Math.sqrt(sum / cellsLength);
  };
  const steps = grid.map((_, i) => (i === 0 ? 0 : step(i)));
  const usual = median(steps.slice(1));
  const jumps: ChangePoint[] = [];
  for (let i = 1; i < n; i++) {
    if (steps[i] < JUMP_SIZE || steps[i] < JUMP_TIMES_USUAL * usual) continue;
    const at = round3(t[i] - t[0]);
    // a light that snaps is a jump too: it is reported once, as the change of light it is
    if (light.some((c) => at >= c.begins - 0.1 && at <= c.arrived + 0.1)) continue;
    jumps.push({ begins: at, half: at, arrived: at, size: round3(steps[i]), strength: round3(usual > 1e-6 ? steps[i] / usual : 999), kind: "picture", lumaBefore: round3(lumaOf(grid[i - 1])), lumaAfter: round3(lumaOf(grid[i])) });
  }

  // the floor: how much the light of a frame differs from the light of the run it is in, over the whole clip
  let within = 0;
  for (let i = 0; i + 1 < edges.length; i++) within += spread(s, edges[i], edges[i + 1]);
  const noise = Math.sqrt(within / n);
  const open = meanOf(s, 0, Math.min(n, m));
  const series = s.x.map((v, i): [number, number, number] => [round3(t[i] - t[0]), round3(distance(v, open)), round3(v[0])]);
  return { changes: [...light, ...jumps].sort((p, q) => p.begins - q.begins), noise: round3(noise), fps: round3(fps), clipSeconds: round3(span + (fps > 0 ? 1 / fps : 0)), series };
}

/** A change counts for a beat when it begins within this of it — beyond that it is another event. */
export const REACH_SECONDS = 1.5;

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
  const asksLight = (b: AskedChange) => b.kinds.length === 0 || b.kinds.includes("lighting");
  const lightBeats = timed.filter(asksLight);
  const lightChanges = found.changes.filter((c) => c.kind === "light");
  const near = (c: ChangePoint, b: AskedChange) => Math.abs(c.begins - b.offset) <= REACH_SECONDS;

  // What each beat could be: the changes of light that begin within reach of it — a change made in steps counting as
  // its steps. A drift (a camera move brightening the picture over a second) is left out when there is a change that
  // happens at a moment to hold the beat against, as it always was; when a drift is all there is, it is what there is.
  const owner = new Map<ChangePoint, ChangePoint>();
  const could = new Map<string, ChangePoint[]>();
  for (const b of lightBeats) {
    const reached = lightChanges.filter((c) => (c.steps ?? [c]).some((p) => near(p, b)));
    const moments = reached.filter((c) => !isDrift(c));
    const parts = (moments.length > 0 ? moments : reached).flatMap((c) => (c.steps ?? [c]).filter((p) => near(p, b)).map((p) => (owner.set(p, c), p)));
    could.set(b.id, parts.sort((p, q) => p.begins - q.begins));
  }

  // Beats that share a change they could be are settled together. Where there are no more changes than beats, they
  // are paired in order and timed. Where there are more, nothing here can say which change is whose: none is timed.
  const used = new Set<ChangePoint>();
  const settled = new Map<string, MeasuredBeat>();
  const settle = (beats: readonly AskedChange[], changes: readonly ChangePoint[]) => {
    const pairs = pairBeats(beats, changes, REACH_SECONDS);
    beats.forEach((b, i) => {
      const change = pairs[i] != null ? changes[pairs[i]!] : null;
      if (change) used.add(owner.get(change) ?? change);
      const error = change ? round3(change.begins - b.offset) : null;
      // a beat that asked for no change of light (a camera move, an action) and has nothing near it was not measured —
      // colour cannot time it — which is not the same as it not having happened
      settled.set(b.id, { ...b, change, error, verdict: !change ? (asksLight(b) ? "not_seen" : "unmeasured") : Math.abs(error!) <= ON_TIME_SECONDS ? "on_time" : "displaced" });
    });
  };
  const open = new Set(lightBeats.map((b) => b.id));
  for (const first of lightBeats) {
    if (!open.has(first.id)) continue;
    const together: AskedChange[] = [];
    const changes = new Set<ChangePoint>();
    const walk = [first];
    while (walk.length > 0) {
      const b = walk.pop()!;
      if (!open.delete(b.id)) continue;
      together.push(b);
      for (const p of could.get(b.id)!) {
        changes.add(p);
        for (const other of lightBeats) if (open.has(other.id) && could.get(other.id)!.includes(p)) walk.push(other);
      }
    }
    together.sort((a, b) => a.offset - b.offset);
    if (changes.size > together.length) {
      for (const b of together) {
        const candidates = could.get(b.id)!;
        candidates.forEach((p) => used.add(owner.get(p) ?? p));
        settled.set(b.id, { ...b, change: null, error: null, verdict: "undetermined", candidates, askedNear: together.length });
      }
      continue;
    }
    settle(together, [...changes].sort((p, q) => p.begins - q.begins));
  }
  // beats that ask for something else are held against whatever is left
  settle(
    timed.filter((b) => !asksLight(b)),
    found.changes.filter((c) => !used.has(c)),
  );
  const beats = timed.map((b) => settled.get(b.id)!);
  const verdict = beats.some((b) => b.verdict === "not_seen") ? "not_kept" : beats.some((b) => b.verdict === "displaced") ? "displaced" : beats.some((b) => b.verdict === "undetermined") ? "undetermined" : "kept";
  return {
    version: 4,
    measuredAt,
    frames: frames.length,
    fps: found.fps,
    clipSeconds: found.clipSeconds,
    noise: found.noise,
    beats,
    unasked: found.changes.filter((c) => !used.has(c)),
    verdict: beats.length === 0 ? "kept" : verdict,
    series: found.series,
  };
}

/** A stored check, read back. Null when it is not one (or from an older way of measuring). */
export function parseBeatCheck(value: unknown): BeatCheck | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<BeatCheck>;
  if (v.version !== 4 || !Array.isArray(v.beats) || typeof v.measuredAt !== "string") return null;
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
  if (b.verdict === "undetermined") {
    const c = b.candidates ?? [];
    const k = b.askedNear ?? 1;
    const each = c.map((x) => `${x.begins.toFixed(2)} s${x.arrived - x.begins >= 0.1 ? ` to ${x.arrived.toFixed(2)} s` : ""}, ${x.lumaAfter >= x.lumaBefore ? "brighter" : "darker"}`).join("; ");
    return `asked at ${b.offset.toFixed(2)} s — the light changes ${c.length === 2 ? "twice" : `${c.length} times`} near it (${each}) and ${k === 1 ? "one change was" : `${k} changes were`} asked for. Which of them is the one asked for cannot be told from the light, so no timing is given: the frames are the check`;
  }
  if (!b.change || b.error == null) {
    return b.verdict === "unmeasured"
      ? `asked at ${b.offset.toFixed(2)} s — not a change of light, and colour cannot time it: look at the frames`
      : `asked at ${b.offset.toFixed(2)} s — no change of the light was found near it`;
  }
  const took = Math.max(0, b.change.arrived - b.change.begins);
  const what = b.change.kind === "light" ? `the light begins to change at ${b.change.begins.toFixed(2)} s` : `the picture jumps at ${b.change.begins.toFixed(2)} s`;
  return `asked at ${b.offset.toFixed(2)} s — ${what} (${signed(b.error)})${took >= 0.1 ? `, arrived by ${b.change.arrived.toFixed(2)} s` : ""}`;
}

/** True when a change takes long enough to arrive that it is a drift rather than a moment. */
export function isDrift(c: Pick<ChangePoint, "begins" | "arrived" | "kind">): boolean {
  return c.kind === "light" && c.arrived - c.begins >= DRIFT_SECONDS;
}

/** A change nobody asked for, in words: a moment is said as a moment, a drift as a drift (a camera pushing in on a lit floor brightens the whole picture). */
export function unaskedLine(c: ChangePoint): string {
  if (c.kind === "picture") return `the picture jumps at ${c.begins.toFixed(2)} s — nothing in the request asked for a change there`;
  if (isDrift(c)) {
    return `the picture ${c.lumaAfter >= c.lumaBefore ? "brightens" : "darkens"} between ${c.begins.toFixed(2)} s and ${c.arrived.toFixed(2)} s — a drift, as a camera move or a slow change of light makes; nothing in the request asked for a change of light`;
  }
  return `the light changes at ${c.begins.toFixed(2)} s — nothing in the request asked for a change there`;
}

export const VERDICT_LABEL: Record<BeatVerdict, string> = { on_time: "on time", displaced: "not on time", not_seen: "not seen", unmeasured: "for the eye", undetermined: "cannot tell which" };
