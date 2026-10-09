/**
 * "Check this cut" — the Review player's decisions, run over the whole song without playing it, and held against an
 * expectation worked out a second way.
 *
 * The player decides two things at every moment: which shot is on the stage (`segmentAt`) and where that shot's
 * video should be and whether it runs or holds (`videoStateAt`). This steps the song clock through the storyboard
 * and asks the player's own functions at every step, then checks each answer against the records directly — the
 * shot's window, its selected assignment, the take's sync row and the files' real lengths — not against the
 * timeline the player was given. A fault in building the timeline or in the player's arithmetic shows as a
 * disagreement.
 *
 * Pure: it plays nothing and fetches nothing. The files' real lengths come from probing them (lib/media/probe.ts).
 */
import { isPlayableRole, isUsableSync, segmentAt, videoStateAt, type Assignment, type MediaAsset, type TakeSync, type TimelineSegment } from "./media";

export type CheckResult = { id: string; label: string; ok: boolean; detail: string; failures: string[] };

export type CutRow = {
  index: number;
  key: string;
  shotId: string;
  songIn: number;
  songOut: number;
  /** What the shot shows. */
  shows: "take" | "ai clip" | "ai image" | "b-roll" | "nothing" | "other";
  assetId: string | null;
  assetName: string | null;
  sourceIn: number | null;
  sourceOut: number | null;
  /** Seconds of the shot before the take has footage / after the media has run out (0 when it covers the shot). */
  holdsFirstFrame: number;
  holdsLastFrame: number;
};

export type CutVerification = { ok: boolean; samples: number; stepSeconds: number; songSeconds: number; checks: CheckResult[]; cuts: CutRow[] };

export type VerifyInput = {
  timeline: readonly TimelineSegment[];
  /** The shot records: id and window on the song. */
  boxes: readonly { id: string; key: string; start: number; end: number }[];
  assignments: readonly Assignment[];
  assets: ReadonlyMap<string, MediaAsset>;
  syncs: readonly TakeSync[];
  /** Real length of each video file, seconds, where it was read from the file. */
  fileSeconds: ReadonlyMap<string, number>;
  /** Real length of the song, seconds, where it was read from the file (else the analysis' figure). */
  songSeconds: number | null;
  stepSeconds?: number;
};

const TOLERANCE = 0.005; // the timeline stores source times to 0.1 ms; the sync is applied twice with rounding
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
const cap = (list: string[], n = 6) => (list.length > n ? [...list.slice(0, n), `… and ${list.length - n} more`] : list);

function showsOf(seg: TimelineSegment): CutRow["shows"] {
  const m = seg.media;
  if (m.kind === "none") return "nothing";
  if (m.role === "performance") return "take";
  if (m.role === "generated_clip") return "ai clip";
  if (m.role === "generated_image") return "ai image";
  if (m.role === "b_roll") return "b-roll";
  return "other";
}

export function verifyCut(input: VerifyInput): CutVerification {
  const step = input.stepSeconds ?? 0.1;
  const timeline = input.timeline;
  const boxes = [...input.boxes].sort((a, b) => a.start - b.start);
  const syncByAsset = new Map(input.syncs.filter(isUsableSync).map((s) => [s.performanceAssetId, s]));
  const lengthOf = (assetId: string): number | null => input.fileSeconds.get(assetId) ?? input.assets.get(assetId)?.durationSeconds ?? null;
  const takeTime = (assetId: string, t: number): number | null => {
    const sync = syncByAsset.get(assetId);
    return sync ? (t - sync.offsetSeconds) / (1 + (sync.driftPpm ?? 0) / 1e6) : null;
  };
  const end = timeline.length ? timeline[timeline.length - 1].end : 0;
  const songSeconds = input.songSeconds ?? end;
  const checks: CheckResult[] = [];

  // ---- 1. the shots tile the song -------------------------------------------------------------------------------
  {
    const failures: string[] = [];
    if (boxes.length && Math.abs(boxes[0].start) > 0.02) failures.push(`the first shot starts at ${fmt(boxes[0].start)}, not at 0`);
    for (let i = 1; i < boxes.length; i++) {
      const gap = boxes[i].start - boxes[i - 1].end;
      if (gap > 0.02) failures.push(`${gap.toFixed(2)} s with no shot between ${boxes[i - 1].key} and ${boxes[i].key}`);
      if (gap < -0.02) failures.push(`${boxes[i - 1].key} and ${boxes[i].key} overlap by ${(-gap).toFixed(2)} s`);
    }
    if (boxes.length && input.songSeconds && Math.abs(boxes[boxes.length - 1].end - input.songSeconds) > 1.5) failures.push(`the last shot ends at ${fmt(boxes[boxes.length - 1].end)}; the song is ${fmt(input.songSeconds)} long`);
    if (timeline.length !== boxes.length) failures.push(`${boxes.length} shot records but ${timeline.length} segments to play`);
    checks.push({ id: "tiles", label: "The shots cover the song with no gap or overlap", ok: failures.length === 0, detail: `${boxes.length} shots, ${fmt(boxes.length ? boxes[boxes.length - 1].end - boxes[0].start : 0)}`, failures: cap(failures) });
  }

  // ---- 2. each shot plays the media selected on its record ------------------------------------------------------
  {
    const failures: string[] = [];
    let selected = 0;
    let base = 0;
    let empty = 0;
    for (const box of boxes) {
      const seg = timeline.find((s) => s.shotId === box.id);
      if (!seg) {
        failures.push(`${box.key} has no segment`);
        continue;
      }
      const primary = input.assignments
        .filter((a) => a.shotId === box.id && a.isPrimary && isPlayableRole(a.role) && input.assets.has(a.assetId))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (primary) {
        selected += 1;
        if (seg.media.kind === "none" || seg.media.assetId !== primary.assetId) failures.push(`${box.key}: its record selects ${input.assets.get(primary.assetId)?.name ?? primary.assetId}, the player has ${seg.media.kind === "none" ? "nothing" : (input.assets.get(seg.media.assetId)?.name ?? seg.media.assetId)}`);
        continue;
      }
      // nothing selected: the synced take underneath, where one has footage for this window
      const covering = [...syncByAsset.keys()].filter((id) => {
        const a = input.assets.get(id);
        if (!a || a.footageRole !== "performance") return false;
        const lo = Math.max(0, takeTime(id, box.start)!);
        const hi = Math.min(a.durationSeconds ?? lengthOf(id) ?? Infinity, takeTime(id, box.end)!);
        return hi - lo >= 0.1;
      });
      if (covering.length) {
        base += 1;
        if (seg.media.kind !== "video" || !seg.media.base || !covering.includes(seg.media.assetId)) failures.push(`${box.key}: nothing is selected and a synced take covers it, but the player has ${seg.media.kind === "none" ? "nothing" : (input.assets.get(seg.media.assetId)?.name ?? "something else")}`);
      } else {
        empty += 1;
        if (seg.media.kind !== "none") failures.push(`${box.key}: nothing is selected and no take covers it, but the player shows ${input.assets.get(seg.media.assetId)?.name ?? "a file"}`);
      }
    }
    checks.push({ id: "selected", label: "Every shot plays what is selected on its own record", ok: failures.length === 0, detail: `${selected} with footage selected, ${base} on the synced take, ${empty} empty`, failures: cap(failures) });
  }

  // ---- 2b. the files are as long as their records say ------------------------------------------------------------
  {
    const failures: string[] = [];
    let compared = 0;
    for (const [assetId, real] of input.fileSeconds) {
      const recorded = input.assets.get(assetId)?.durationSeconds;
      if (recorded == null) continue;
      compared += 1;
      if (Math.abs(recorded - real) > 0.25) failures.push(`${input.assets.get(assetId)?.name ?? assetId}: its record says ${recorded.toFixed(2)} s, the file is ${real.toFixed(2)} s`);
    }
    checks.push({ id: "lengths", label: "Each file is as long as its record says", ok: failures.length === 0, detail: `${compared} file${compared === 1 ? "" : "s"} compared`, failures: cap(failures) });
  }

  // ---- 3. generated media and B-roll appear only on the shots they are assigned to ------------------------------
  {
    const failures: string[] = [];
    let placed = 0;
    for (const seg of timeline) {
      if (seg.media.kind === "none" || seg.media.role === "performance") continue;
      placed += 1;
      const assetId = seg.media.assetId;
      if (!input.assignments.some((a) => a.shotId === seg.shotId && a.assetId === assetId)) failures.push(`${seg.key} shows ${input.assets.get(assetId)?.name ?? assetId}, which is not assigned to it`);
    }
    checks.push({ id: "slots", label: "AI clips, images and B-roll appear only on the shots they are assigned to", ok: failures.length === 0, detail: `${placed} shot${placed === 1 ? "" : "s"} showing assigned footage`, failures: cap(failures) });
  }

  // ---- 4–7. the song clock stepped through the cut ---------------------------------------------------------------
  const cutFailures: string[] = [];
  const syncFailures: string[] = [];
  const holdFailures: string[] = [];
  const orderFailures: string[] = [];
  const resumeFailures: string[] = [];
  let samples = 0;
  let takeSamples = 0;
  let worstTake = 0;
  let resumes = 0;
  const holdFirst = new Map<string, number>();
  const holdLast = new Map<string, number>();
  let prevAt: { shotId: string; at: number } | null = null;

  const boxAt = (t: number) => boxes.find((b) => t >= b.start - 1e-6 && t < b.end - 1e-6) ?? null;
  for (let n = 0; n * step < end - 1e-6; n++) {
    const t = Math.round(n * step * 1000) / 1000;
    samples += 1;
    const seg = segmentAt(timeline, t);
    const box = boxAt(t);
    if (!seg || !box || seg.shotId !== box.id) {
      cutFailures.push(`at ${fmt(t)} the player is on ${seg?.key ?? "nothing"}; the shot whose window holds that moment is ${box?.key ?? "none"}`);
      continue;
    }
    if (seg.media.kind !== "video") {
      prevAt = null;
      continue;
    }
    const assetId = seg.media.assetId;
    const length = lengthOf(assetId);
    const state = videoStateAt(seg, t, length);
    if (!state) continue;
    if (prevAt && prevAt.shotId === seg.shotId && state.at < prevAt.at - 1e-6) orderFailures.push(`${seg.key}: the picture goes backwards at ${fmt(t)} (${prevAt.at.toFixed(3)} → ${state.at.toFixed(3)})`);
    prevAt = { shotId: seg.shotId, at: state.at };
    if (state.hold === "lead_in") holdFirst.set(seg.shotId, (holdFirst.get(seg.shotId) ?? 0) + step);
    if (state.hold === "ran_out") holdLast.set(seg.shotId, (holdLast.get(seg.shotId) ?? 0) + step);

    if (seg.media.role === "performance") {
      const want = takeTime(assetId, t);
      if (want === null) {
        syncFailures.push(`${seg.key}: plays a take that has no confirmed sync`);
        continue;
      }
      takeSamples += 1;
      if (want < -TOLERANCE) {
        // the song has started and the take has not: the first frame is held, the take is not slid
        if (state.hold !== "lead_in" || Math.abs(state.at) > TOLERANCE) holdFailures.push(`${seg.key} at ${fmt(t)}: the take has not started yet (it starts ${(-want).toFixed(2)} s later) and should hold its first frame; the player has it at ${state.at.toFixed(3)}${state.hold ? "" : " and running"}`);
      } else if (length !== null && want >= length - 0.04) {
        // the take is over and the shot is not: the last frame is held
        if (state.hold !== "ran_out" || state.at > length + TOLERANCE) holdFailures.push(`${seg.key} at ${fmt(t)}: the take ended ${(want - length).toFixed(2)} s ago and should hold its last frame; the player has it at ${state.at.toFixed(3)}${state.hold ? "" : " and running"}`);
      } else if (length !== null && want >= length - 0.1) {
        // the last tenth of a second of the file: running or already holding are both right
      } else {
        const off = Math.abs(state.at - want);
        worstTake = Math.max(worstTake, off);
        if (off > TOLERANCE || state.hold) syncFailures.push(`${seg.key} at ${fmt(t)}: the take should be at ${want.toFixed(3)} s; the player has it at ${state.at.toFixed(3)} s${state.hold ? ` (held: ${state.hold})` : ""}`);
      }
    } else {
      // a clip plays from its own in-point for as long as it lasts, then holds
      const want = seg.media.sourceIn + (t - seg.start);
      const stop = Math.min(seg.media.sourceOut ?? Infinity, length ?? Infinity);
      if (want >= stop - 0.04) {
        if (stop !== Infinity && state.at > stop + TOLERANCE) holdFailures.push(`${seg.key} at ${fmt(t)}: the clip is ${stop.toFixed(2)} s long and the player asks for ${state.at.toFixed(3)} s`);
      } else if (Math.abs(state.at - want) > TOLERANCE || state.hold) {
        syncFailures.push(`${seg.key} at ${fmt(t)}: the clip should be at ${want.toFixed(3)} s; the player has it at ${state.at.toFixed(3)} s`);
      }
    }
  }

  // a take picks up where the SONG is after other footage, not where the take left off
  for (let i = 1; i < timeline.length; i++) {
    const before = timeline[i - 1];
    const seg = timeline[i];
    if (seg.media.kind !== "video" || seg.media.role !== "performance") continue;
    if (before.media.kind !== "none" && before.media.role === "performance" && before.media.assetId === seg.media.assetId) continue;
    const t = seg.start + 0.05;
    const want = takeTime(seg.media.assetId, t);
    const length = lengthOf(seg.media.assetId);
    if (want === null || want < 0 || (length !== null && want >= length - 0.04)) continue;
    resumes += 1;
    const state = videoStateAt(seg, t, length);
    if (!state || Math.abs(state.at - want) > TOLERANCE) resumeFailures.push(`${seg.key}: after ${before.key} the take should resume at ${want.toFixed(3)} s; the player has ${state ? state.at.toFixed(3) : "nothing"}`);
  }

  checks.push({ id: "cuts", label: "Every cut lands on its shot's own time", ok: cutFailures.length === 0, detail: `${Math.max(0, timeline.length - 1)} cuts, checked at ${samples} moments ${step} s apart`, failures: cap(cutFailures) });
  checks.push({ id: "sync", label: "Performance is where the song clock says, in every shot", ok: syncFailures.length === 0, detail: takeSamples ? `${takeSamples} moments on a take, furthest ${worstTake < 0.0005 ? "0" : (worstTake * 1000).toFixed(1)} ms from the song clock` : "no take in the cut", failures: cap(syncFailures) });
  checks.push({ id: "resume", label: "After other footage, the take resumes on the song clock", ok: resumeFailures.length === 0, detail: `${resumes} return${resumes === 1 ? "" : "s"} to the take checked`, failures: cap(resumeFailures) });
  checks.push({
    id: "hold",
    label: "Before a take starts and after it ends, the frame holds",
    ok: holdFailures.length === 0,
    detail: [...holdFirst.values(), ...holdLast.values()].length ? `first frame held in ${holdFirst.size} shot${holdFirst.size === 1 ? "" : "s"}, last frame held in ${holdLast.size}` : "nothing has to hold in this cut",
    failures: cap(holdFailures),
  });
  checks.push({ id: "order", label: "No shot's picture ever runs backwards or restarts", ok: orderFailures.length === 0, detail: `${samples} moments`, failures: cap(orderFailures) });

  const cuts: CutRow[] = timeline.map((seg) => {
    const m = seg.media;
    const asset = m.kind === "none" ? null : (input.assets.get(m.assetId) ?? null);
    return {
      index: seg.index,
      key: seg.key,
      shotId: seg.shotId,
      songIn: seg.start,
      songOut: seg.end,
      shows: showsOf(seg),
      assetId: m.kind === "none" ? null : m.assetId,
      assetName: asset?.name ?? null,
      sourceIn: m.kind === "video" ? m.sourceIn : null,
      sourceOut: m.kind === "video" ? m.sourceOut : null,
      holdsFirstFrame: Math.round((holdFirst.get(seg.shotId) ?? 0) * 100) / 100,
      holdsLastFrame: Math.round((holdLast.get(seg.shotId) ?? 0) * 100) / 100,
    };
  });

  return { ok: checks.every((c) => c.ok), samples, stepSeconds: step, songSeconds, checks, cuts };
}
