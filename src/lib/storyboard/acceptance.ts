/**
 * Whether a generated clip does what it was asked to — which is not whether it plays.
 *
 * A clip can open, decode, sit on the song's clock and pass every check in "Check this cut", and still be the wrong
 * shot: wider than the take it was restaged from, lit some other way, its change a second early, the camera move that
 * was asked for missing, his mouth off the words. Those are what a clip is accepted or sent back on, and until this
 * existed nothing held them: a measurement was shown beside the clip and counted for nothing.
 *
 * Five things are asked of a generated clip. Each has ONE finding, and where the finding comes from is kept with it:
 *
 *   timing    the changes its script asked for happen when it asked           measured (beatCheck.ts)
 *   framing   it shows no more of him than the take it was made from          measured (takeCheck.ts)
 *   lips      his mouth moves on the take's moments                           NOT measured to a standard — see below
 *   lighting  the light is the light that was asked for                       by eye; a change nobody asked for is measured
 *   camera    the camera and the movement are what was asked for              by eye; a jump nobody asked for is measured
 *
 * A finding is one of four, and they are not interchangeable:
 *   meets         something looked, and it does
 *   fails         something looked, and it does not
 *   undetermined  a measurement was made and could not tell (the light changes twice where one change was asked for)
 *   unverified    nothing has looked — or what looked is not a measure that can be relied on
 *
 * MEASURED AND SEEN ARE KEPT APART. A measurement is what the code read off the file. A judgement is what a person
 * decided by looking (and listening), recorded with a note and a date. A judgement settles a requirement — the
 * measurement stays beside it, as measured, and is never rewritten to agree. Nothing a person read off the frames
 * is ever stored as a measurement.
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

export type Requirement = "timing" | "framing" | "lips" | "lighting" | "camera";
export type Finding = "meets" | "fails" | "undetermined" | "unverified";

/** What a person decided by looking. */
export type Judgement = { finding: "meets" | "fails"; note: string; at: string };
/** Kept on the clip (`metadata_json.acceptance`): the judgements made by eye, by requirement. */
export type AcceptanceRecord = { version: 1; judged: Partial<Record<Requirement, Judgement>> };

/** What the code read off the file for one requirement. */
export type Measured = { finding: Finding; says: string };

export type RequirementLine = {
  requirement: Requirement;
  label: string;
  /** The finding that stands. */
  finding: Finding;
  /** Where it comes from: a measurement, a person's judgement, or nothing yet. */
  source: "measured" | "by_eye" | "none";
  says: string;
  /** The measurement, whatever was judged by eye. Null when nothing measures this. */
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
};
export const FINDING_LABEL: Record<Finding, string> = { meets: "meets", fails: "fails", undetermined: "cannot tell", unverified: "not verified" };
export const SOURCE_LABEL: Record<RequirementLine["source"], string> = { measured: "measured", by_eye: "by eye", none: "nothing has looked" };
export const VERDICT_LABEL: Record<AcceptanceVerdict, string> = { meets: "does what was asked", fails: "fails what was asked", unverified: "not yet verified" };

/**
 * Whether the lip check's reading can stand as a finding. False: its threshold has not been held against real
 * footage whose answer is known (the take against its own playback copy, the same shifted by a known amount, a
 * different stretch of it), and no clip it has read has been watched with sound to see whether it agrees.
 */
export const LIP_MEASURE_VALIDATED = false;

const REQUIREMENTS: readonly Requirement[] = ["timing", "framing", "lips", "lighting", "camera"];
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
  if (notSeen.length + displaced.length > 0) {
    const parts = [
      displaced.length ? `${displaced.length} of ${n} not when asked (${displaced.map((b) => signed(b.error ?? 0)).join(", ")})` : null,
      notSeen.length ? `${notSeen.length} of ${n} not seen at all` : null,
    ].filter(Boolean);
    return { finding: "fails", says: `${parts.join("; ")}` };
  }
  const unsure = of("undetermined");
  if (unsure.length > 0) return { finding: "undetermined", says: `the light changes more times than it was asked to, and which change is the one asked for cannot be told from the light — no timing is given for ${unsure.length} of ${n}` };
  const forEye = of("unmeasured");
  if (forEye.length > 0) return { finding: "unverified", says: `${forEye.length} of ${n} asked for something that is not a change of light: colour cannot time it` };
  return { finding: "meets", says: `${n} of ${n} within a quarter of a second of where it was asked` };
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
};

/**
 * A clip held against everything it was asked for. `record` is what has been judged by eye; the checks are what has
 * been measured. A requirement that does not apply to this clip (no timed script; not made from a take) has no line.
 */
export function acceptanceOf(input: { ask: ClipAsk; beatCheck: BeatCheck | null; takeCheck: TakeCheck | null; record: AcceptanceRecord | null }): Acceptance {
  const measuredBy: Record<Requirement, Measured | null> = {
    timing: timingOf(input.ask, input.beatCheck),
    framing: framingOf(input.ask, input.takeCheck),
    lips: lipsOf(input.ask, input.takeCheck),
    lighting: lightingOf(input.beatCheck),
    camera: cameraOf(input.beatCheck),
  };
  const applies: Record<Requirement, boolean> = {
    timing: timedOf(input.ask.asked).length > 0,
    framing: input.ask.fromTake,
    lips: input.ask.fromTake,
    lighting: true,
    camera: true,
  };
  const lines = REQUIREMENTS.filter((r) => applies[r]).map((requirement): RequirementLine => {
    const measured = measuredBy[requirement];
    const judged = input.record?.judged[requirement] ?? null;
    const label = REQUIREMENT_LABEL[requirement];
    if (judged) return { requirement, label, finding: judged.finding, source: "by_eye", says: judged.note || (judged.finding === "meets" ? "looked at, and it does" : "looked at, and it does not"), measured, judged };
    if (measured) return { requirement, label, finding: measured.finding, source: measured.finding === "unverified" ? "none" : "measured", says: measured.says, measured, judged: null };
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
export function cutAcceptance(timeline: readonly TimelineSegment[], assets: ReadonlyMap<string, MediaAsset>, asks: ReadonlyMap<string, ClipAsk>): CutAcceptance {
  const clips: ClipAcceptance[] = [];
  for (const seg of timeline) {
    if (seg.media.kind !== "video") continue;
    const asset = assets.get(seg.media.assetId);
    const ask = asks.get(seg.media.assetId);
    if (!asset || !ask) continue;
    clips.push({ index: seg.index, key: seg.key, shotId: seg.shotId, start: seg.start, end: seg.end, assetId: asset.id, name: asset.name, acceptance: acceptanceOf({ ask, beatCheck: asset.beatCheck ?? null, takeCheck: asset.takeCheck ?? null, record: asset.acceptance ?? null }) });
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
