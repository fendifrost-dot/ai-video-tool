/**
 * Whether a generated clip does what it was asked to — which is not whether it plays.
 *
 * A clip can open, decode, sit on the song's clock and pass every check in "Check this cut", and still be the wrong
 * shot: wider than the take it was restaged from, lit some other way, its change a second early, the camera move that
 * was asked for missing, his mouth off the words. Those are what a clip is accepted or sent back on, and until this
 * existed nothing held them: a measurement was shown beside the clip and counted for nothing.
 *
 * These are asked of a generated clip. Each has ONE finding, and where the finding comes from is kept with it:
 *
 *   timing     the changes its script asked for happen when it asked          a change of light is DETECTED and timed
 *                                                                              (beatCheck.ts); that it is the change
 *                                                                              asked for is for the eye — see below
 *   framing    it shows no more of him than the take it was made from         measured (takeCheck.ts)
 *   lips       his mouth moves on the take's moments                          NOT measured to a standard — see below
 *   lighting   the light is the light that was asked for                      by eye; a change nobody asked for is measured
 *   camera     the camera and the movement are what was asked for             by eye; a jump nobody asked for is measured
 *   integrity  bodies and objects are whole and connected (no empty shoe,     by eye — nothing measures it
 *              no extra hand, nothing melting or detached)
 *   action     what happens in the clip is what was asked to happen           by eye — nothing measures it
 *   review     what a second opinion found on this clip (a model shown        reviewed — neither a measurement nor a
 *              frames of the cut: astraSection.ts)                             person's judgement, and kept apart from both
 *
 * A finding is one of four, and they are not interchangeable:
 *   meets         something looked, and it does
 *   fails         something looked, and it does not
 *   undetermined  a measurement was made and could not tell (the light changes twice where one change was asked for)
 *   unverified    nothing has looked — or what looked is not a measure that can be relied on
 *
 * TIMING: DETECTED IS NOT IDENTIFIED. The beat check finds where the light of the picture changes and when. It does
 * not know WHAT changed. One change in a clip, where one was asked for, is still only "a change of light at 3.67 s":
 * that it is the mirror ball coming alive and not, say, a door opening, is something only the frames show. So a
 * detected change stands as a detected change. A beat with NO change near it, or whose only change is off its time,
 * fails without anyone having to look — whatever that change is, nothing changed when it was asked to. A change that
 * is ON time meets the requirement only once someone has looked and said it is the change that was asked for; until
 * then the line reads "cannot tell".
 *
 * MEASURED, REVIEWED AND SEEN ARE KEPT APART. A measurement is what the code read off the file. A judgement is what a person
 * decided by looking (and listening), recorded with a note and a date. A judgement settles a requirement — the
 * measurement stays beside it, as measured, and is never rewritten to agree. Nothing a person read off the frames
 * is ever stored as a measurement. A REVIEW is a third thing: a model was shown frames of the cut and said what it
 * saw. A major finding of its on a clip counts against the clip until someone looks and overrules it — a defect that
 * has been reported is not the same as a line nobody has looked at.
 *
 * LIPS. The lip check compares when his mouth opens in the clip with when it opens in the take. Its arithmetic is
 * tested on made series; its threshold has not been held against real footage whose answer is known, and nobody has
 * yet watched a clip with sound to see whether it agrees. Until one of those is done its reading is reported as a
 * reading and the requirement stays UNVERIFIED: only watching the clip with the song settles it.
 *
 * A clip is accepted when every requirement that applies to it is met. One that fails, fails it. Anything else —
 * undetermined, unverified — leaves it not yet verified, which is not a pass.
 *
 * Pure: no fetch, no storage.
 */
import { isDrift, MIN_STATE_SECONDS, type AskedChange, type BeatCheck } from "./beatCheck";
import { framingLine, lipLine, type TakeCheck } from "./takeCheck";
import type { MediaAsset, TimelineSegment } from "./media";

export type Requirement = "timing" | "framing" | "lips" | "lighting" | "camera" | "integrity" | "action" | "review";
export type Finding = "meets" | "fails" | "undetermined" | "unverified";

/** What a person decided by looking. */
export type Judgement = { finding: "meets" | "fails"; note: string; at: string };
/** Kept on the clip (`metadata_json.acceptance`): the judgements made by eye, by requirement. */
export type AcceptanceRecord = { version: 1; judged: Partial<Record<Requirement, Judgement>> };

/** What the code read off the file for one requirement. */
export type Measured = { finding: Finding; says: string };

/** One thing a second opinion said about a clip (astraSection.ts: a model shown frames of the cut). */
export type ReviewedFinding = { severity: "blocker" | "major" | "minor"; area: string; finding: string; at: string };

export type RequirementLine = {
  requirement: Requirement;
  label: string;
  /** The finding that stands. */
  finding: Finding;
  /** Where it comes from: a measurement, a second opinion's review, a person's judgement, or nothing yet. */
  source: "measured" | "reviewed" | "by_eye" | "none";
  says: string;
  /** The measurement (or, on the review line, what the review said), whatever was judged by eye. Null when nothing measures this. */
  measured: Measured | null;
  judged: Judgement | null;
};

export type AcceptanceVerdict = "meets" | "fails" | "unverified";
export type Acceptance = { verdict: AcceptanceVerdict; lines: RequirementLine[]; fails: number; open: number };

/** What a clip was asked for, as far as acceptance needs it. */
export type ClipAsk = {
  /** The script's timed lines (empty = it was asked for as one state). */
  asked: readonly AskedChange[];
  /** It was restaged from a take: it is asked to keep that take's framing and his mouth on its moments. */
  fromTake: boolean;
};

export const REQUIREMENT_LABEL: Record<Requirement, string> = {
  timing: "Timing",
  framing: "Framing",
  lips: "Lip sync",
  lighting: "Lighting",
  camera: "Camera and movement",
  integrity: "Bodies and objects",
  action: "Action",
  review: "Second opinion",
};
export const FINDING_LABEL: Record<Finding, string> = { meets: "meets", fails: "fails", undetermined: "cannot tell", unverified: "not verified" };
export const SOURCE_LABEL: Record<RequirementLine["source"], string> = { measured: "measured", reviewed: "reviewed by a model", by_eye: "by eye", none: "nothing has looked" };
export const VERDICT_LABEL: Record<AcceptanceVerdict, string> = { meets: "does what was asked", fails: "fails what was asked", unverified: "not yet verified" };

/**
 * Whether the lip check's reading can stand as a finding. False: its threshold has not been held against real
 * footage whose answer is known (the take against its own playback copy, the same shifted by a known amount, a
 * different stretch of it), and no clip it has read has been watched with sound to see whether it agrees.
 */
export const LIP_MEASURE_VALIDATED = false;

const REQUIREMENTS: readonly Requirement[] = ["timing", "framing", "lips", "lighting", "camera", "integrity", "action", "review"];
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(2)} s`;
const timedOf = (asked: readonly AskedChange[]) => asked.filter((b) => b.offset >= MIN_STATE_SECONDS / 2);

function timingOf(ask: ClipAsk, check: BeatCheck | null): Measured | null {
  const timed = timedOf(ask.asked);
  if (timed.length === 0) return null;
  if (!check) return { finding: "unverified", says: "not measured yet" };
  const n = check.beats.length;
  const of = (v: string) => check.beats.filter((b) => b.verdict === v);
  const notSeen = of("not_seen");
  const displaced = of("displaced");
  // Nothing changed when it was asked to: no change near the beat at all, or the only change near it is off its
  // time. That holds whatever the change is, so it needs nobody to say what it is.
  if (notSeen.length + displaced.length > 0) {
    const parts = [
      displaced.length ? `${displaced.length} of ${n}: the only change of light near it began ${displaced.map((b) => signed(b.error ?? 0)).join(", ")} from where it was asked` : null,
      notSeen.length ? `${notSeen.length} of ${n}: no change of light near it at all` : null,
    ].filter(Boolean);
    return { finding: "fails", says: `${parts.join("; ")} — whatever that change is, nothing changed when it was asked to` };
  }
  const unsure = of("undetermined");
  if (unsure.length > 0) return { finding: "undetermined", says: `the light changes more times than it was asked to, and which change is the one asked for cannot be told from the light — no timing is given for ${unsure.length} of ${n}` };
  const forEye = of("unmeasured");
  if (forEye.length > 0) return { finding: "unverified", says: `${forEye.length} of ${n} asked for something that is not a change of light: colour cannot time it` };
  // A change of light on time is a change of light on time. Whether it is the change that was asked for is not
  // something the light can say.
  return { finding: "undetermined", says: `a change of light begins within a quarter of a second of each of the ${n} it was asked for — whether it is the change that was asked for is not something the light can say: look at the frames beside the beat` };
}

function framingOf(ask: ClipAsk, check: TakeCheck | null): Measured | null {
  if (!ask.fromTake) return null;
  if (!check) return { finding: "unverified", says: "not held against the take yet" };
  const v = check.framing.verdict;
  return { finding: v === "kept" ? "meets" : v === "wider" ? "fails" : "unverified", says: framingLine(check) };
}

function lipsOf(ask: ClipAsk, check: TakeCheck | null): Measured | null {
  if (!ask.fromTake) return null;
  if (!check) return { finding: "unverified", says: "not held against the take yet — and the check is a pointer: watch it with the song" };
  const v = check.lip.verdict;
  if (LIP_MEASURE_VALIDATED && (v === "in_sync" || v === "off")) return { finding: v === "in_sync" ? "meets" : "fails", says: lipLine(check) };
  const reading = v === "in_sync" ? "reads in sync" : v === "off" ? "reads off" : v === "unclear" ? "could not tell" : "could not compare his mouth";
  return {
    finding: v === "unclear" ? "undetermined" : "unverified",
    says: `the lip check ${reading}. ${lipLine(check)} That check has not been held against footage whose answer is known, so its reading settles nothing: watch the clip with the song`,
  };
}

/** A change of light the clip makes where nothing asked for one (a drift is a camera move's doing and is not counted). */
function lightingOf(check: BeatCheck | null): Measured | null {
  const stray = (check?.unasked ?? []).filter((c) => c.kind === "light" && !isDrift(c));
  if (stray.length === 0) return null;
  return { finding: "fails", says: `the light changes at ${stray.map((c) => `${c.begins.toFixed(2)} s`).join(", ")} where nothing asked it to` };
}

/** A jump of the picture inside the clip that nothing asked for. */
function cameraOf(check: BeatCheck | null): Measured | null {
  const jumps = (check?.unasked ?? []).filter((c) => c.kind === "picture");
  if (jumps.length === 0) return null;
  return { finding: "fails", says: `the picture jumps at ${jumps.map((c) => `${c.begins.toFixed(2)} s`).join(", ")} where nothing asked it to` };
}

const BY_EYE: Record<Requirement, string> = {
  timing: "look at the frames beside each beat",
  framing: "hold the clip's frame against the take's",
  lips: "watch the clip with the song",
  lighting: "nothing measures whether the light is the light that was asked for: look at it",
  camera: "nothing measures whether the camera and the movement are what was asked for: look at it",
  integrity: "nothing measures whether bodies and objects are whole and connected — a limb missing, a shoe with no leg in it, a hand too many: look at it",
  action: "nothing measures whether what happens is what was asked to happen: look at it",
  review: "",
};

/** A review's findings that count against a clip: the ones it called a blocker or major. */
function reviewOf(reviewed: readonly ReviewedFinding[] | null | undefined): Measured | null {
  const counted = (reviewed ?? []).filter((f) => f.severity === "blocker" || f.severity === "major");
  if (counted.length === 0) return null;
  return { finding: "fails", says: counted.map((f) => `${f.severity} (${f.area}, ${f.at.slice(0, 10)}): ${f.finding}`).join(" · ") };
}

/**
 * A clip held against everything it was asked for. `record` is what has been judged by eye; the checks are what has
 * been measured. A requirement that does not apply to this clip (no timed script; not made from a take) has no line.
 */
export function acceptanceOf(input: { ask: ClipAsk; beatCheck: BeatCheck | null; takeCheck: TakeCheck | null; record: AcceptanceRecord | null; reviewed?: readonly ReviewedFinding[] | null }): Acceptance {
  const measuredBy: Record<Requirement, Measured | null> = {
    timing: timingOf(input.ask, input.beatCheck),
    framing: framingOf(input.ask, input.takeCheck),
    lips: lipsOf(input.ask, input.takeCheck),
    lighting: lightingOf(input.beatCheck),
    camera: cameraOf(input.beatCheck),
    integrity: null,
    action: null,
    review: reviewOf(input.reviewed),
  };
  const applies: Record<Requirement, boolean> = {
    timing: timedOf(input.ask.asked).length > 0,
    framing: input.ask.fromTake,
    lips: input.ask.fromTake,
    lighting: true,
    camera: true,
    integrity: true,
    action: true,
    // a second opinion has a line only where it found something that counts
    review: reviewOf(input.reviewed) !== null,
  };
  const lines = REQUIREMENTS.filter((r) => applies[r]).map((requirement): RequirementLine => {
    const measured = measuredBy[requirement];
    const judged = input.record?.judged[requirement] ?? null;
    const label = REQUIREMENT_LABEL[requirement];
    if (judged) return { requirement, label, finding: judged.finding, source: "by_eye", says: judged.note || (judged.finding === "meets" ? "looked at, and it does" : "looked at, and it does not"), measured, judged };
    if (measured) return { requirement, label, finding: measured.finding, source: measured.finding === "unverified" ? "none" : requirement === "review" ? "reviewed" : "measured", says: measured.says, measured, judged: null };
    return { requirement, label, finding: "unverified", source: "none", says: BY_EYE[requirement], measured: null, judged: null };
  });
  const fails = lines.filter((l) => l.finding === "fails").length;
  const open = lines.filter((l) => l.finding === "undetermined" || l.finding === "unverified").length;
  return { verdict: fails > 0 ? "fails" : open > 0 ? "unverified" : "meets", lines, fails, open };
}

/** A stored record, read back. Anything that is not one is no record. */
export function parseAcceptance(value: unknown): AcceptanceRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { version?: unknown; judged?: unknown };
  if (v.version !== 1 || !v.judged || typeof v.judged !== "object") return null;
  const judged: AcceptanceRecord["judged"] = {};
  for (const r of REQUIREMENTS) {
    const j = (v.judged as Record<string, unknown>)[r] as Partial<Judgement> | undefined;
    if (j && (j.finding === "meets" || j.finding === "fails") && typeof j.at === "string") judged[r] = { finding: j.finding, note: typeof j.note === "string" ? j.note : "", at: j.at };
  }
  return { version: 1, judged };
}

/** The record with one requirement judged — or, with `finding` null, that judgement taken back. */
export function withJudgement(record: AcceptanceRecord | null, requirement: Requirement, finding: "meets" | "fails" | null, note: string, at: string): AcceptanceRecord {
  const judged = { ...(record?.judged ?? {}) };
  if (finding === null) delete judged[requirement];
  else judged[requirement] = { finding, note: note.trim(), at };
  return { version: 1, judged };
}

/** One clip's acceptance in a line: what fails, what is still open. */
export function acceptanceLine(a: Acceptance): string {
  const named = (f: (l: RequirementLine) => boolean) => a.lines.filter(f).map((l) => l.label.toLowerCase());
  const failing = named((l) => l.finding === "fails");
  const open = named((l) => l.finding === "undetermined" || l.finding === "unverified");
  if (a.verdict === "meets") return `meets all ${a.lines.length} it was asked for`;
  return [failing.length ? `fails ${failing.join(", ")}` : null, open.length ? `not verified: ${open.join(", ")}` : null].filter(Boolean).join(" · ");
}

export type ClipAcceptance = { index: number; key: string; shotId: string; start: number; end: number; assetId: string; name: string; acceptance: Acceptance };
export type CutAcceptance = { clips: ClipAcceptance[]; meets: number; fails: number; open: number; verdict: AcceptanceVerdict | "none" };

/**
 * Every generated clip a cut plays, held against what it was asked for. `asks` is what each clip was asked for, by
 * asset (from the job that made it); footage nothing was asked of — a take as filmed, an upload — is not in it and
 * is not counted. A cut with no generated clip has nothing to accept ("none").
 */
export function cutAcceptance(timeline: readonly TimelineSegment[], assets: ReadonlyMap<string, MediaAsset>, asks: ReadonlyMap<string, ClipAsk>, reviewed?: ReadonlyMap<string, readonly ReviewedFinding[]>): CutAcceptance {
  const clips: ClipAcceptance[] = [];
  for (const seg of timeline) {
    if (seg.media.kind !== "video") continue;
    const asset = assets.get(seg.media.assetId);
    const ask = asks.get(seg.media.assetId);
    if (!asset || !ask) continue;
    clips.push({ index: seg.index, key: seg.key, shotId: seg.shotId, start: seg.start, end: seg.end, assetId: asset.id, name: asset.name, acceptance: acceptanceOf({ ask, beatCheck: asset.beatCheck ?? null, takeCheck: asset.takeCheck ?? null, record: asset.acceptance ?? null, reviewed: reviewed?.get(asset.id) ?? null }) });
  }
  const count = (v: AcceptanceVerdict) => clips.filter((c) => c.acceptance.verdict === v).length;
  const fails = count("fails");
  const open = count("unverified");
  return { clips, meets: count("meets"), fails, open, verdict: clips.length === 0 ? "none" : fails > 0 ? "fails" : open > 0 ? "unverified" : "meets" };
}

/** A cut's acceptance in a line. */
export function cutAcceptanceLine(c: CutAcceptance): string {
  if (c.clips.length === 0) return "no generated clip in this cut";
  const n = c.clips.length;
  const parts = [c.fails ? `${c.fails} ${c.fails === 1 ? "fails" : "fail"} what was asked` : null, c.open ? `${c.open} not yet verified` : null, c.meets ? `${c.meets} ${c.meets === 1 ? "does" : "do"} what was asked` : null].filter(Boolean);
  return `${n} generated clip${n === 1 ? "" : "s"}: ${parts.join(", ")}`;
}

/** A stored review, as far as this needs it: when it was made and what it found on which shot (and, when the review recorded it, on which clip). */
export type ReviewLike = { at: string; findings: readonly { shotId: string | null; assetId?: string | null; severity: ReviewedFinding["severity"]; area: string; finding: string }[] };

/**
 * Which clip each of a review's findings is about. A review looks at the cut as it stood: the finding belongs to the
 * clip the shot was showing THEN, not to whatever is on the shot now. A review that recorded the clip says so. One
 * that did not (an older review) is tied to a clip only when there is no choice: exactly one generated clip on that
 * shot existed when the review was made. Otherwise the finding is tied to nothing — it is never guessed onto a clip
 * made after the review looked.
 */
const madeBy = (createdAt: string | undefined, at: string) => {
  const made = Date.parse(createdAt ?? "");
  const then = Date.parse(at);
  return Number.isFinite(made) && Number.isFinite(then) && made <= then;
};

export function reviewedByAsset(
  review: ReviewLike | null | undefined,
  assignments: readonly { shotId: string; assetId: string }[],
  assets: ReadonlyMap<string, Pick<MediaAsset, "id" | "createdAt">>,
  asks: ReadonlyMap<string, ClipAsk>,
): Map<string, ReviewedFinding[]> {
  const out = new Map<string, ReviewedFinding[]>();
  if (!review) return out;
  for (const f of review.findings) {
    if (!f.shotId) continue;
    let assetId = f.assetId ?? null;
    if (!assetId) {
      const then = [...new Set(assignments.filter((a) => a.shotId === f.shotId).map((a) => a.assetId))].filter((id) => asks.has(id) && madeBy(assets.get(id)?.createdAt, review.at));
      assetId = then.length === 1 ? then[0] : null;
    }
    if (!assetId || !asks.has(assetId)) continue;
    out.set(assetId, [...(out.get(assetId) ?? []), { severity: f.severity, area: f.area, finding: f.finding, at: review.at }]);
  }
  return out;
}
