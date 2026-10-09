/**
 * A restaged clip held against the stretch of the take it was made from — the two things a restaging is asked to
 * KEEP and nothing else measured: his mouth moving at the same moments, and no more of his body in frame than the
 * take filmed.
 *
 * Both come from one reading of each file: on every frame, where his eyes and lips are (media/faceSeries.ts). From
 * that, per frame:
 *   mouth  how open his mouth is — the gap between the lips over the distance between the eyes, so it does not
 *          change when the camera comes closer
 *   reach  how far below his eyes the frame goes, in eye-distances. A take filmed from the thighs up has one reach;
 *          a restaging that shows his knees and feet has a larger one, whatever the frame's shape or size
 *
 * Lip sync is the fit of the clip's mouth series to the take's (the measure scripts/qa/reference_fidelity.py made
 * on files; this is the same arithmetic where the app can run it): the clip's time = retime × the take's + offset,
 * chosen where the two series agree best. What is judged is the LAG that fit puts between a mouth movement in the
 * take and the same one in the clip, at its worst over the stretch compared.
 *
 * Pure: frames in, numbers out. What it cannot say: whether the lips LOOK right (a mouth that opens at the right
 * moments in the wrong shape), and anything about a stretch where his face is not seen — a silhouette, a turn away.
 */

/** One frame's face: time on the file's own clock (seconds), and the measures above. `size` is eye-distance over frame height. */
export type FaceSample = {
  t: number;
  mouth: number;
  size: number;
  cx: number;
  cy: number;
  reach: number;
  /**
   * How much there is to see of the face where the landmarks say it is: the spread of light across it, 0–1. A lit
   * face is 0.1 and more; a silhouette is next to nothing — and the reader still draws a face on a silhouette, with a
   * shut mouth, because a face is what it draws.
   */
  seen: number;
};
/** One frame of a file read for faces: the time, and his face when one was found. */
export type FaceFrame = { t: number; face: Omit<FaceSample, "t"> | null };

export type LipFit = { corr: number; retime: number; offset: number; n: number };
export type LipVerdict = "in_sync" | "off" | "unclear" | "unmeasured";
export type FramingVerdict = "kept" | "wider" | "unmeasured";

export type TakeCheck = {
  version: 2;
  measuredAt: string;
  /** The clip: frames read, frames his face could be read in (found, and lit enough to read), the first and last moment it was. */
  frames: number;
  faceFrames: number;
  faceFrom: number | null;
  faceTo: number | null;
  /** The take's stretch: the same. */
  takeFrames: number;
  takeFaceFrames: number;
  lip: {
    verdict: LipVerdict;
    /** The best fit of the clip's mouth to the take's, and how well they agree with no fit at all (same clock). */
    best: LipFit | null;
    onClock: number | null;
    /** The largest lag the fit puts between the take and the clip over the stretch compared, seconds; + is the clip late. */
    worstLag: number | null;
    /** Seconds of the take the comparison covers. */
    compared: number;
  };
  framing: {
    verdict: FramingVerdict;
    /** How far below his eyes the take's frame goes (median), and the clip's at its opening and at its widest. */
    takeReach: number | null;
    openingReach: number | null;
    widestReach: number | null;
    widestAt: number | null;
    /** widest ÷ take: above 1 the clip shows more of him than the take filmed. */
    ratio: number | null;
    /** His face was found from the clip's first moments (a figure too small or too dark to read is not measured). */
    openingSeen: boolean;
  };
  /**
   * What was measured, kept so the verdict can be looked at and re-judged without reading the files again: every
   * frame a face was FOUND in, readable or not — the take's [t, mouth, seen] over its stretch, the clip's
   * [t, mouth, reach, seen]. Both from 0.
   */
  series: { take: [number, number, number][]; clip: [number, number, number, number][] };
};

/** Landmark indices of the face mesh: outer eye corners, inner lips (the pair the script used). */
export const EYE_A = 33;
export const EYE_B = 263;
export const LIP_UPPER = 13;
export const LIP_LOWER = 14;

/** One face, from its landmarks in pixels of a frame `w` × `h`. Null when the eyes are too close together to be a face. */
export function faceOf(points: readonly { x: number; y: number }[], w: number, h: number): Omit<FaceSample, "t" | "seen"> | null {
  const a = points[EYE_A];
  const b = points[EYE_B];
  const up = points[LIP_UPPER];
  const lo = points[LIP_LOWER];
  if (!a || !b || !up || !lo || !(w > 0) || !(h > 0)) return null;
  const iod = Math.hypot(a.x - b.x, a.y - b.y);
  if (!(iod > 2)) return null;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return { mouth: r(Math.hypot(up.x - lo.x, up.y - lo.y) / iod), size: r(iod / h), cx: r(mx / w), cy: r(my / h), reach: r((h - my) / iod) };
}

// --- lip sync ----------------------------------------------------------------------------------------------------------

/** A lag of this much or less is in sync: two frames of 24. */
export const SYNC_SECONDS = 0.085;
/** Fewer compared frames than this and nothing is said: about a second. */
export const MIN_COMPARED = 24;
/** A value is not read across a gap in the series longer than this (his face was not found there). */
const MAX_GAP = 0.13;
/** A mouth this open (in eye-distances) or less is shut: the floor the logarithm is taken above. */
const SHUT = 0.02;
/** The clip is slid against the take by up to this much either way, in steps of half a frame. */
const MAX_SLIDE = 0.375;
const OFFSETS: number[] = [];
for (let i = -Math.round(MAX_SLIDE * 48); i <= Math.round(MAX_SLIDE * 48); i++) OFFSETS.push(Math.round((i / 48) * 10000) / 10000);
/** …and, only when it fits clearly better than the take's own speed, run up to this much faster or slower. */
const RETIMES = [0.95, 0.96, 0.97, 0.98, 0.99, 1.01, 1.02, 1.03, 1.04, 1.05];
const RETIME_HAS_TO_GAIN = 0.04;

/**
 * How well two mouths have to agree before the fit means anything, for a comparison `seconds` long. Sliding one
 * series against another always finds SOME agreement, and the shorter the stretch the more it finds: two unrelated
 * performances slid like this agree at up to about 1.0 ÷ √seconds in the worst one case in a hundred (measured on
 * made series, 400 pairs a length: 0.82 over 1.5 s, 0.64 over 2.5 s, 0.52 over 4 s, 0.44 over 6 s —
 * takeCheck.test.ts holds the 4 s case). The bar is set just clear of that, and never below a half.
 */
export function minCorr(seconds: number): number {
  return Math.round(Math.max(0.5, Math.min(0.9, 1.05 / Math.sqrt(Math.max(0.5, seconds)))) * 100) / 100;
}

/** The series' value at time `t`, between the two samples around it; null outside the series or across a gap. */
function at(ts: readonly number[], vs: readonly number[], t: number): number | null {
  const n = ts.length;
  if (n === 0 || t < ts[0] - 1e-6 || t > ts[n - 1] + 1e-6) return null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = ts[hi] - ts[lo];
  if (span > MAX_GAP) return null;
  if (span <= 0) return vs[lo];
  const f = Math.max(0, Math.min(1, (t - ts[lo]) / span));
  return vs[lo] + (vs[hi] - vs[lo]) * f;
}

function pearson(a: readonly number[], b: readonly number[]): number | null {
  const n = a.length;
  if (n < 3) return null;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    sab += x * y;
    saa += x * x;
    sbb += y * y;
  }
  if (!(saa > 1e-12) || !(sbb > 1e-12)) return null;
  return sab / Math.sqrt(saa * sbb);
}

type Fit = { corr: number; retime: number; offset: number; n: number; from: number; to: number };

/** How well the clip's mouth agrees with the take's when the clip's time is `k` × the take's + `off`. */
function agreement(take: readonly FaceSample[], ts: readonly number[], vs: readonly number[], k: number, off: number, need: number): Fit | null {
  const a: number[] = [];
  const b: number[] = [];
  let from = Infinity;
  let to = -Infinity;
  for (const s of take) {
    const v = at(ts, vs, s.t * k + off);
    if (v == null) continue;
    a.push(s.mouth);
    b.push(v);
    if (s.t < from) from = s.t;
    if (s.t > to) to = s.t;
  }
  if (a.length < need) return null;
  const corr = pearson(a, b);
  return corr == null ? null : { corr, retime: k, offset: off, n: a.length, from, to };
}

/**
 * The clip's mouth against the take's. Both series start at 0 where the stretch starts (the take's is re-based to
 * its window by the caller), so "on the clock" is retime 1, offset 0. The clip is slid at the take's own speed
 * first; another speed is taken only when it agrees clearly better, because every extra way of fitting two series
 * finds agreement that is not there.
 */
export function fitLips(take: readonly FaceSample[], clip: readonly FaceSample[]): TakeCheck["lip"] {
  const none: TakeCheck["lip"] = { verdict: "unmeasured", best: null, onClock: null, worstLag: null, compared: 0 };
  if (take.length < MIN_COMPARED || clip.length < MIN_COMPARED) return none;
  // compared as the LOGARITHM of how open it is: what is seen of speech is the mouth shutting and opening, and on a
  // plain scale a wide vowel outweighs every shut between words. (On the first real clip the two mouths agreed at
  // 0.28 plain and 0.41 so, at the same moment.)
  const open = (m: number) => Math.log(SHUT + Math.max(0, m));
  take = take.map((s) => ({ ...s, mouth: open(s.mouth) }));
  const ts = clip.map((s) => s.t);
  const vs = clip.map((s) => open(s.mouth));
  const need = Math.max(MIN_COMPARED, Math.floor(Math.min(take.length, clip.length) / 2));
  const bestOf = (ks: readonly number[]): Fit | null => {
    let best: Fit | null = null;
    for (const k of ks) for (const off of OFFSETS) {
      const g = agreement(take, ts, vs, k, off, need);
      if (g && (!best || g.corr > best.corr + 1e-9)) best = g;
    }
    return best;
  };
  const straight = bestOf([1]);
  if (!straight) return none;
  const retimed = bestOf(RETIMES);
  const best = retimed && retimed.corr > straight.corr + RETIME_HAS_TO_GAIN ? retimed : straight;
  const clock = agreement(take, ts, vs, 1, 0, need);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  // where a movement at take time t lands in the clip, less t: the lag, at both ends of what was compared
  const lagAt = (t: number) => t * (best.retime - 1) + best.offset;
  const a = lagAt(best.from);
  const b = lagAt(best.to);
  const worst = Math.abs(a) >= Math.abs(b) ? a : b;
  const compared = Math.max(0, best.to - best.from);
  const verdict: LipVerdict = best.corr < minCorr(compared) ? "unclear" : Math.abs(worst) <= SYNC_SECONDS ? "in_sync" : "off";
  return { verdict, best: { corr: r3(best.corr), retime: best.retime, offset: best.offset, n: best.n }, onClock: clock ? r3(clock.corr) : null, worstLag: r3(worst), compared: r3(compared) };
}

// --- framing -----------------------------------------------------------------------------------------------------------

/** The clip shows more of him than the take when its frame reaches this much further below his eyes. */
export const WIDER_RATIO = 1.15;
/** His face has to be found within this of the clip's first frame for the opening to count as seen. */
const OPENING_SECONDS = 0.3;

const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** How much of him the clip shows, against how much the take does. A single odd frame does not make a clip wide: the widest is of five frames together. */
export function framingOf(take: readonly FaceSample[], clip: readonly FaceSample[], clipStart = 0): TakeCheck["framing"] {
  const none: TakeCheck["framing"] = { verdict: "unmeasured", takeReach: null, openingReach: null, widestReach: null, widestAt: null, ratio: null, openingSeen: false };
  const takeReach = median(take.map((s) => s.reach));
  if (takeReach == null || !(takeReach > 0) || clip.length < 5) return none;
  let widest = -Infinity;
  let widestAt = clip[0].t;
  for (let i = 0; i + 5 <= clip.length; i++) {
    const m = median(clip.slice(i, i + 5).map((s) => s.reach))!;
    if (m > widest) {
      widest = m;
      widestAt = clip[i + 2].t;
    }
  }
  const openingSeen = clip[0].t - clipStart <= OPENING_SECONDS;
  const opening = openingSeen ? median(clip.filter((s) => s.t - clip[0].t <= OPENING_SECONDS).map((s) => s.reach)) : null;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const ratio = widest / takeReach;
  return { verdict: ratio > WIDER_RATIO ? "wider" : "kept", takeReach: r2(takeReach), openingReach: opening == null ? null : r2(opening), widestReach: r2(widest), widestAt, ratio: r2(ratio), openingSeen };
}

// --- the check ---------------------------------------------------------------------------------------------------------

const faces = (frames: readonly FaceFrame[], rebase = 0): FaceSample[] =>
  frames
    .filter((f): f is FaceFrame & { face: NonNullable<FaceFrame["face"]> } => !!f.face)
    .map((f) => ({ t: Math.round((f.t - rebase) * 1000) / 1000, ...f.face }))
    .sort((a, b) => a.t - b.t);

/** A face with less to see than this is not read, whatever the rest of the file looks like. */
export const MIN_SEEN = 0.02;
/**
 * …nor one with less than this share of what the file's faces usually show: the stretch where the lights are out.
 * Set on the fresh section's clips: his lit face spreads 0.15–0.20, the same face in the dark 0.03–0.12 (the points of
 * a mirror ball crossing it are the top of that), so two-thirds of the usual keeps every lit frame and no dark one.
 */
export const SEEN_SHARE = 0.65;

/**
 * The faces that can be READ. The reader finds a face in a silhouette and gives it a shut mouth; measured as it
 * came, the dark end of a shot whose lights go out read as two seconds of a man not rapping, and the lips of a clip
 * that were on the take's moments came out as agreeing with nothing (the first check of the fresh section's c038).
 */
export function readable(found: readonly FaceSample[]): FaceSample[] {
  const usual = median(found.map((f) => f.seen));
  if (usual == null) return [];
  const bar = Math.max(MIN_SEEN, usual * SEEN_SHARE);
  return found.filter((f) => f.seen >= bar);
}

/**
 * The whole check. `takeFrames` are the frames of the take's stretch on the take's own clock; `takeStart` is where
 * the stretch the clip was made from begins there, so both series run from 0.
 */
export function checkAgainstTake(takeFrames: readonly FaceFrame[], takeStart: number, clipFrames: readonly FaceFrame[], measuredAt: string): TakeCheck {
  const takeFound = faces(takeFrames, takeStart);
  const clipFound = faces(clipFrames);
  const take = readable(takeFound);
  const clip = readable(clipFound);
  const first = clipFrames.length ? Math.min(...clipFrames.map((f) => f.t)) : 0;
  return {
    version: 2,
    measuredAt,
    frames: clipFrames.length,
    faceFrames: clip.length,
    faceFrom: clip.length ? clip[0].t : null,
    faceTo: clip.length ? clip[clip.length - 1].t : null,
    takeFrames: takeFrames.length,
    takeFaceFrames: take.length,
    lip: fitLips(take, clip),
    framing: framingOf(take, clip, first),
    series: { take: takeFound.map((x) => [x.t, x.mouth, x.seen]), clip: clipFound.map((x) => [x.t, x.mouth, x.reach, x.seen]) },
  };
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): number | null => (num(v) ? v : null);

const rows = (raw: unknown, width: number): number[][] => (Array.isArray(raw) ? raw.filter((r): r is number[] => Array.isArray(r) && r.length === width && r.every(num)) : []);

/** A stored check, read back. Anything that is not one (an older shape, a hand edit) is no check. */
export function parseTakeCheck(raw: unknown): TakeCheck | null {
  const v = raw as Partial<TakeCheck> | null;
  if (!v || typeof v !== "object" || v.version !== 2 || typeof v.measuredAt !== "string" || !v.lip || !v.framing) return null;
  const lip = v.lip as TakeCheck["lip"];
  const fr = v.framing as TakeCheck["framing"];
  if (!["in_sync", "off", "unclear", "unmeasured"].includes(lip.verdict) || !["kept", "wider", "unmeasured"].includes(fr.verdict)) return null;
  const best = lip.best && num(lip.best.corr) && num(lip.best.retime) && num(lip.best.offset) ? { corr: lip.best.corr, retime: lip.best.retime, offset: lip.best.offset, n: num(lip.best.n) ? lip.best.n : 0 } : null;
  return {
    version: 2,
    measuredAt: v.measuredAt,
    frames: num(v.frames) ? v.frames : 0,
    faceFrames: num(v.faceFrames) ? v.faceFrames : 0,
    faceFrom: numOrNull(v.faceFrom),
    faceTo: numOrNull(v.faceTo),
    takeFrames: num(v.takeFrames) ? v.takeFrames : 0,
    takeFaceFrames: num(v.takeFaceFrames) ? v.takeFaceFrames : 0,
    lip: { verdict: lip.verdict, best, onClock: numOrNull(lip.onClock), worstLag: numOrNull(lip.worstLag), compared: num(lip.compared) ? lip.compared : 0 },
    framing: { verdict: fr.verdict, takeReach: numOrNull(fr.takeReach), openingReach: numOrNull(fr.openingReach), widestReach: numOrNull(fr.widestReach), widestAt: numOrNull(fr.widestAt), ratio: numOrNull(fr.ratio), openingSeen: fr.openingSeen === true },
    series: { take: rows(v.series?.take, 3) as [number, number, number][], clip: rows(v.series?.clip, 4) as [number, number, number, number][] },
  };
}

// --- words -------------------------------------------------------------------------------------------------------------

export const LIP_LABEL: Record<LipVerdict, string> = { in_sync: "lips in sync", off: "lips off", unclear: "lips unclear", unmeasured: "lips not measured" };
export const FRAMING_LABEL: Record<FramingVerdict, string> = { kept: "framing kept", wider: "shows more of him", unmeasured: "framing not measured" };

const signed = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n).toFixed(2)} s`;
const frames24 = (seconds: number) => Math.round(Math.abs(seconds) * 24);

/** The lip line, in a director's words. */
export function lipLine(c: TakeCheck): string {
  const l = c.lip;
  const seen = c.faceFrames < c.frames && c.faceTo != null ? ` His face can be read in ${c.faceFrames} of ${c.frames} frames (to ${c.faceTo.toFixed(2)} s) — nothing is said about the rest.` : "";
  if (l.verdict === "unmeasured" || !l.best) return `His mouth could not be compared with the take's: his face can be read in ${c.faceFrames} of ${c.frames} frames of the clip and ${c.takeFaceFrames} of ${c.takeFrames} of the take.`;
  const fit = `agreement ${l.best.corr.toFixed(2)} over ${l.compared.toFixed(1)} s`;
  if (l.verdict === "unclear") {
    const lag = l.worstLag ?? 0;
    const near = Math.abs(lag) < 0.0105 ? "on the take's clock" : `${signed(lag)} from it`;
    return `His mouth does not follow the take's closely enough to say it is in time: ${fit}, and over that long it takes ${minCorr(l.compared).toFixed(2)}. Where they agree best is ${near} — a pointer, not a measurement.${seen}`;
  }
  const lag = l.worstLag ?? 0;
  const where = Math.abs(lag) < 0.0105 ? "on the take's clock" : `${signed(lag)} (${frames24(lag)} frame${frames24(lag) === 1 ? "" : "s"} ${lag > 0 ? "late" : "early"}) at its worst`;
  const speed = Math.abs(l.best.retime - 1) >= 0.015 ? `, running at ${l.best.retime.toFixed(2)}× the take's speed` : "";
  return `His mouth moves with the take's — ${where}${speed} (${fit}).${seen}`;
}

/** The framing line. */
export function framingLine(c: TakeCheck): string {
  const f = c.framing;
  if (f.verdict === "unmeasured" || f.takeReach == null || f.widestReach == null || f.ratio == null) return "How much of him the frame shows could not be measured: his face was not found.";
  const opening = !f.openingSeen ? ` His face is not found until ${(c.faceFrom ?? 0).toFixed(2)} s, so the opening itself is not measured.` : "";
  const numbers = `the take's frame reaches ${f.takeReach.toFixed(1)} eye-widths below his eyes; this clip reaches ${f.widestReach.toFixed(1)} at its widest (${(f.widestAt ?? 0).toFixed(2)} s)${f.openingReach != null ? `, ${f.openingReach.toFixed(1)} at its opening` : ""}`;
  if (f.verdict === "wider") return `It shows more of his body than the take filmed — ${numbers}: ${f.ratio.toFixed(2)}× as far.${opening}`;
  return `It shows no more of him than the take filmed — ${numbers}.${opening}`;
}

/** Whether a stored check is of this clip as it is (a clip is a file that does not change; a check is kept until measured again). */
export function hasTakeCheck(c: TakeCheck | null | undefined): c is TakeCheck {
  return !!c;
}
