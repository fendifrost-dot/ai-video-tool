/**
 * An analysis KEPT against a take — and the rules for when it may be believed again.
 *
 * Reading a file frame by frame is slow, so an analysis is stored and reused. The whole value of reusing one is that
 * it is still true, so this module is about the conditions for that and nothing else:
 *
 *   the same file     a fingerprint of what was read — where it is, how large, how long, how big a picture. A file
 *                     replaced at the same path is a DIFFERENT take and its old analysis is void, not stale.
 *   the same stretch  a shot that uses 2–6 s of a take is not answered by an analysis of 0–2 s. Two shots on one
 *                     take legitimately want two analyses, so these are kept as a list, not one per asset.
 *   the same analyzer a reading made by an older version is marked stale and offered for re-reading, not dropped:
 *                     a stale number beside its version is more use than a blank panel.
 *   the same settings what the reading was made with, so a changed sampling rate does not silently compare two
 *                     different measurements.
 *
 * Nothing here reads a file or talks to the database. `queries/footageAnalysis.ts` does that.
 */
import { FOOTAGE_ANALYZER_VERSION, type FootageAnalysis } from "./footage";
import { COMPATIBILITY_VERSION, type Compatibility } from "./compatibility";

/** What the reading was made of. A change in any of these makes an old analysis VOID, not stale. */
export type FootageFingerprint = {
  bucket: string;
  path: string;
  /** The file's length in bytes, where the server gave it. */
  bytes: number | null;
  /** The track's own duration and picture size — cheap to read and enough to catch a re-encode. */
  seconds: number | null;
  width: number | null;
  height: number | null;
};

/** How the reading was made. Kept so two analyses are only ever compared when they were made the same way. */
export type FootageSettings = {
  /** Frames actually read, and the stride if the whole stretch was not read frame by frame. */
  detailTiles: number;
  lightGrid: number;
  /** Where the frames came from: the app's own decoder, or a bundle made on a build box. */
  sampledBy: "browser" | "harness";
  /** Named so a report from the harness is never silently read as one from a tab. */
  scaler: string;
};

export type StoredFootageAnalysis = {
  id: string;
  fingerprint: FootageFingerprint;
  settings: FootageSettings;
  analysis: FootageAnalysis;
  compatibility: Compatibility;
  /**
   * Where the evidence lives: the frames a reader should look at to judge the findings for themselves. Times on the
   * file's own clock; the panel turns them into thumbnails from the same file.
   */
  evidence: { t: number; why: string }[];
};

export type Staleness =
  { state: "fresh" } | { state: "stale"; why: string } | { state: "void"; why: string };

/** The current analyzer and spec versions, as one thing to compare against. */
export const CURRENT = {
  analyzer: FOOTAGE_ANALYZER_VERSION,
  compatibility: COMPATIBILITY_VERSION,
} as const;

export function fingerprintsMatch(a: FootageFingerprint, b: FootageFingerprint): boolean {
  return (
    a.bucket === b.bucket &&
    a.path === b.path &&
    a.bytes === b.bytes &&
    a.seconds === b.seconds &&
    a.width === b.width &&
    a.height === b.height
  );
}

/** Does a stored analysis cover the stretch being asked about? A tolerance of a frame either way. */
export function covers(
  stored: readonly [number, number],
  want: readonly [number, number],
  tolerance = 0.05,
): boolean {
  return stored[0] <= want[0] + tolerance && stored[1] >= want[1] - tolerance;
}

/**
 * Whether a kept analysis may be used for this file and this stretch.
 *
 * Void beats stale: a reading of a different file is not an old answer, it is the wrong one, and the panel must not
 * offer to show it.
 */
export function stalenessOf(
  stored: StoredFootageAnalysis,
  now: { fingerprint: FootageFingerprint; range: readonly [number, number] },
): Staleness {
  if (!fingerprintsMatch(stored.fingerprint, now.fingerprint))
    return { state: "void", why: "the file at this path is not the one that was read" };
  if (!covers(stored.analysis.range, now.range)) {
    return {
      state: "stale",
      why: `it was read over ${stored.analysis.range[0]}–${stored.analysis.range[1]} s, and this shot uses ${now.range[0]}–${now.range[1]} s`,
    };
  }
  if (stored.analysis.version !== CURRENT.analyzer)
    return {
      state: "stale",
      why: `read by analyzer v${stored.analysis.version}; v${CURRENT.analyzer} is current`,
    };
  if (stored.compatibility.version !== CURRENT.compatibility)
    return {
      state: "stale",
      why: `the background spec was built by v${stored.compatibility.version}; v${CURRENT.compatibility} is current`,
    };
  return { state: "fresh" };
}

/**
 * The analysis to show for a stretch, out of everything kept on the asset: a fresh one covering it, else the stalest
 * usable one, else nothing. Void readings are never returned.
 */
export function pickAnalysis(
  stored: readonly StoredFootageAnalysis[],
  now: { fingerprint: FootageFingerprint; range: readonly [number, number] },
): { analysis: StoredFootageAnalysis; staleness: Staleness } | null {
  const usable = stored
    .map((s) => ({ analysis: s, staleness: stalenessOf(s, now) }))
    .filter((x) => x.staleness.state !== "void");
  if (usable.length === 0) return null;
  const fresh = usable.find((x) => x.staleness.state === "fresh");
  if (fresh) return fresh;
  // the narrowest stale one that at least overlaps what is being asked about
  return usable.sort(
    (a, b) =>
      Math.abs(a.analysis.analysis.range[0] - now.range[0]) -
      Math.abs(b.analysis.analysis.range[0] - now.range[0]),
  )[0];
}

/** Keep the new reading and drop any it replaces: the same stretch, read the same way, is one record. */
export function withAnalysis(
  stored: readonly StoredFootageAnalysis[],
  next: StoredFootageAnalysis,
  limit = 8,
): StoredFootageAnalysis[] {
  const same = (s: StoredFootageAnalysis) =>
    fingerprintsMatch(s.fingerprint, next.fingerprint) &&
    s.analysis.range[0] === next.analysis.range[0] &&
    s.analysis.range[1] === next.analysis.range[1];
  const kept = stored.filter((s) => !same(s));
  // readings of a file that is no longer there are dropped at the same time
  const live = kept.filter(
    (s) =>
      s.fingerprint.path === next.fingerprint.path &&
      s.fingerprint.bucket === next.fingerprint.bucket,
  );
  return [next, ...live].slice(0, limit);
}

/**
 * The moments worth looking at to judge this reading. Named rather than taken at a fixed stride: a reader checking
 * "he moves across 41 % of the frame" wants the two frames that bound it, not six evenly spaced ones.
 */
export function evidenceFor(
  a: FootageAnalysis,
  faces: readonly { t: number; face: { cx: number; reach: number } | null }[],
): { t: number; why: string }[] {
  const out: { t: number; why: string }[] = [];
  const seen = faces.filter((f) => f.face);
  if (seen.length) {
    const byX = [...seen].sort((p, q) => p.face!.cx - q.face!.cx);
    out.push({ t: byX[0].t, why: "furthest to frame left he gets" });
    out.push({ t: byX[byX.length - 1].t, why: "furthest to frame right he gets" });
    const byReach = [...seen].sort((p, q) => q.face!.reach - p.face!.reach);
    if (byReach.length && Math.abs(byReach[0].t - byX[0].t) > 0.3)
      out.push({ t: byReach[0].t, why: "most of him in frame" });
  }
  if ((a.focus.blurredFrames.value ?? 0) > 0.05)
    out.push({ t: a.range[0], why: "check the softest frames for movement blur" });
  if (out.length === 0) out.push({ t: a.range[0], why: "the opening frame" });
  return out
    .filter((e, i, all) => all.findIndex((o) => Math.abs(o.t - e.t) < 0.2) === i)
    .map((e) => ({ t: Math.round(e.t * 1000) / 1000, why: e.why }));
}
