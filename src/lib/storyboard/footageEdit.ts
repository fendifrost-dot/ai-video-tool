/**
 * What ONE VARIATION decides about one take on one box — and, just as carefully, what it does not decide.
 *
 * THE SPLIT THIS MODULE EXISTS TO HOLD
 *   Shared by the whole project, never per variation: the media file, its duration, and
 *   `performance_syncs` — where the recording sits on the song. A take's place on the song does not depend on
 *   which video it is cut into, so every variation of a song inherits the takes and their sync for free, and
 *   `boxMedia` re-derives each variation's own coverage from them.
 *
 *   Owned by one variation, carried on its own `shot_asset_assignments` row: whether this box uses that take at
 *   all, and how much of its synced coverage it uses. Those rows are variation-scoped, so an edit here can never
 *   reach another variation.
 *
 * WHY A TRIM IS IN SONG SECONDS AND NOT SOURCE SECONDS
 *   A trim says "this take's picture starts 0.4 s into the cut", never "play the take from 61.2 s". Trimming must
 *   not be able to break sync: a head trim SHORTENS the covered part of the box, it never slides the footage
 *   forward to fill it. Expressing the trim as a narrowing of the box's song window and mapping that through the
 *   sync — the one tested function, `takeRangeForBox` — makes that true by construction, and keeps the trim
 *   correct if the sync offset is later corrected or the box is moved, split or merged.
 *
 * WHY EXCLUSION IS A ROW AND NOT AN ABSENCE
 *   A synced take that covers a box is offered under it as the base layer whether or not anybody asked for it.
 *   So "no row" cannot mean "not used here" — it means nobody has decided. An exclusion is a row that says the
 *   director looked and said no. Those are different facts and the UI must not conflate them.
 */
import { sourceRangeForSongRange, type PerformanceSync } from "@/lib/sync/performanceSync";
import type { StoryboardBox } from "./boxes";
import type { Assignment, AssignmentOp, AssignmentRole } from "./media";

/** Less than a frame of picture: footage this much short of a shot's window covers the shot. */
export const FRAME_SLACK = 0.04;

export type TakeRange = {
  /** In/out inside the take, seconds — the song window mapped through the sync. */
  start: number;
  end: number;
  /** "full": the take covers the whole window. "partial": it covers part (the range is clamped to the take). */
  coverage: "full" | "partial";
  /**
   * Seconds of the box that pass before the take has footage (0 unless the recording starts inside the box). The
   * take is never slid to fill that gap: sliding it would break the sync.
   */
  leadIn: number;
};

/**
 * Where a box sits inside a take. The window is mapped, never scaled: one second of song is one second of take
 * (drift is parts per million and is carried by the mapping). Null when the take has nothing for this window.
 */
export function takeRangeForBox(
  box: Pick<StoryboardBox, "start" | "end">,
  sync: Pick<PerformanceSync, "offsetSeconds" | "driftPpm"> & Partial<PerformanceSync>,
  takeDurationSeconds: number | null,
): TakeRange | null {
  if (!(box.end > box.start)) return null;
  const full = sourceRangeForSongRange({ start: box.start, end: box.end }, sync as PerformanceSync, takeDurationSeconds ?? undefined);
  if (full) return { ...full, coverage: "full", leadIn: 0 };
  // partly inside the recording: clamp to what was recorded
  const k = 1 + (sync.driftPpm ?? 0) / 1e6;
  const s = (box.start - sync.offsetSeconds) / k;
  const e = (box.end - sync.offsetSeconds) / k;
  const lo = Math.max(0, s);
  const hi = takeDurationSeconds != null ? Math.min(takeDurationSeconds, e) : e;
  if (hi - lo < 0.1) return null;
  // the song time at which the clamped range begins, relative to the box
  const leadIn = Math.round(Math.max(0, lo * k + sync.offsetSeconds - box.start) * 1e4) / 1e4;
  // short of the window by less than a frame at either end is not "part of the shot": nothing a viewer could see
  // (a clip cut for this very shot starts on a frame boundary, a few milliseconds from the shot's own start). It is
  // still PLACED exactly: those milliseconds stay a lead-in, so the footage is never slid to meet the cut.
  if (lo - s < FRAME_SLACK && e - hi < FRAME_SLACK) return { start: Math.round(lo * 1e4) / 1e4, end: Math.round(hi * 1e4) / 1e4, coverage: "full", leadIn };
  return { start: Math.round(lo * 1e4) / 1e4, end: Math.round(hi * 1e4) / 1e4, coverage: "partial", leadIn };
}

/** A sync the cut can rely on: the director confirmed it, or set it by hand. A measurement nobody confirmed is not one. */
export function isUsableSync(sync: Pick<PerformanceSync, "status">): boolean {
  return sync.status === "confirmed" || sync.status === "manual";
}

/** Below this there is no picture left to show: a trim this close to the whole box is a removal. */
export const MIN_COVERAGE_SECONDS = 0.1;

/** One variation's own decisions about one take on one box. The sync is never one of them. */
export type FootageEdit = {
  /** Seconds of the box's head this take is trimmed off. 0 means it plays from the cut. */
  head: number;
  /** Seconds of the box's tail this take is trimmed off. */
  tail: number;
  /** The director decided this take is NOT used here. Distinct from never having been put on the box. */
  excluded: boolean;
};

export const NO_EDIT: FootageEdit = { head: 0, tail: 0, excluded: false };

/**
 * Where a range came from, so nothing has to guess and the UI can offer "back to the synced coverage":
 *   sync       the whole synced coverage, nothing trimmed
 *   trimmed    the synced coverage, narrowed by this variation
 *   excluded   this variation left the take out on purpose
 *   unsynced   the take is not matched to the song, so there is no coverage to have
 *   uncovered  the recording has no footage for this part of the song
 *   emptied    trimmed until nothing is left — a removal written as a trim
 */
export type CoverageFrom = "sync" | "trimmed" | "excluded" | "unsynced" | "uncovered" | "emptied";

export type TakeCoverage = {
  /** In/out inside the take, seconds. Null when there is nothing to play. */
  sourceIn: number | null;
  sourceOut: number | null;
  /** Seconds of the box that pass before this take's picture starts — a late recording, or a head trim. */
  leadIn: number;
  /** Seconds of the box left after this take's picture ends. */
  tailOut: number;
  from: CoverageFrom;
  /** Whether the whole box is covered, for the one case a director must be told about. */
  coverage: "full" | "partial" | "none";
  note: string | null;
};

const NOTHING = (from: CoverageFrom, note: string | null, leadIn = 0, tailOut = 0): TakeCoverage => ({
  sourceIn: null,
  sourceOut: null,
  leadIn,
  tailOut,
  from,
  coverage: "none",
  note,
});

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** A number a director typed, or a column that may be null, as seconds of trim. Never negative, never NaN. */
export function trimSeconds(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? r4(n) : 0;
}

/** The edit stored on an assignment row. Columns absent (an older row, or a stand-in backend) read as no edit. */
export function editOf(a: Pick<Assignment, "trimHead" | "trimTail" | "excluded"> | null | undefined): FootageEdit {
  if (!a) return NO_EDIT;
  return { head: trimSeconds(a.trimHead), tail: trimSeconds(a.trimTail), excluded: a.excluded === true };
}

/**
 * What one take gives one box, after this variation's own trims and exclusion. The sync is read, never written:
 * every range here is the synced position of the recording, narrowed — never slid.
 */
export function takeCoverage(input: {
  box: Pick<StoryboardBox, "start" | "end">;
  sync: (Pick<PerformanceSync, "offsetSeconds" | "driftPpm" | "status"> & Partial<PerformanceSync>) | null | undefined;
  takeDurationSeconds: number | null;
  edit?: FootageEdit;
}): TakeCoverage {
  const edit = input.edit ?? NO_EDIT;
  const { box } = input;
  if (edit.excluded) return NOTHING("excluded", "left out of this variation on purpose");
  if (!input.sync || !isUsableSync(input.sync)) return NOTHING("unsynced", "this take is not matched to the song yet");

  const trimmed = { start: box.start + edit.head, end: box.end - edit.tail };
  const hasTrim = edit.head > 0 || edit.tail > 0;
  if (trimmed.end - trimmed.start < MIN_COVERAGE_SECONDS) {
    return NOTHING("emptied", "trimmed to nothing — the take is not used on this shot", edit.head, edit.tail);
  }

  const r = takeRangeForBox(trimmed, input.sync, input.takeDurationSeconds);
  if (!r) return NOTHING("uncovered", "the take has no footage for this part of the song", edit.head, edit.tail);

  // the trim is part of the lead-in: the footage sits where the sync put it, and the trimmed head stays empty
  const leadIn = r4(edit.head + r.leadIn);
  const played = r.end - r.start;
  const tailOut = r4(Math.max(0, box.end - box.start - leadIn - played));
  // "full" is about the BOX, so a trim the director asked for is reported as partial coverage of it, with no scolding note
  const covered = leadIn < 0.04 && tailOut < 0.04 && r.coverage === "full";
  const note = r.coverage === "partial" && !hasTrim ? "the take covers only part of this box" : null;
  return {
    sourceIn: r.start,
    sourceOut: r.end,
    leadIn,
    tailOut,
    from: hasTrim ? "trimmed" : "sync",
    coverage: covered ? "full" : "partial",
    note,
  };
}

// ---------------------------------------------------------------------------
// The edits a director can make, as ops on the variation's own rows
// ---------------------------------------------------------------------------

export type FootageEditAction =
  /** Narrow this take's coverage of the box. Seconds of the box, from each end. */
  | { do: "trim"; head: number; tail: number }
  /** Leave the take out of this box in this variation — on purpose, and visibly. */
  | { do: "exclude" }
  /** Undo an exclusion, back to whatever trim the row carries. */
  | { do: "restore" }
  /** Back to the whole synced coverage: no trim, not excluded. */
  | { do: "reset" };

export type FootageEditPlan = { ops: AssignmentOp[]; refused: string | null };

/**
 * The rows one action writes. A take that is only OFFERED (the base layer, no row) needs a row before it can be
 * trimmed or excluded — that insert is part of the plan, so a first trim is one action, not two.
 *
 * Nothing here touches `performance_syncs`, and nothing writes `source_in_seconds`: a performance take's source
 * range is derived every time from the sync and this row's trim. Storing the derived seconds would let a corrected
 * sync and a stored range disagree, with no way to tell which was meant.
 */
export function planFootageEdit(input: {
  assignments: readonly Assignment[];
  box: Pick<StoryboardBox, "id" | "start" | "end">;
  assetId: string;
  action: FootageEditAction;
  role?: AssignmentRole;
}): FootageEditPlan {
  const role = input.role ?? "performance";
  const row = input.assignments.find((a) => a.shotId === input.box.id && a.assetId === input.assetId && a.role === role) ?? null;
  const current = editOf(row);
  const next = ((): FootageEdit => {
    switch (input.action.do) {
      case "trim":
        return { head: trimSeconds(input.action.head), tail: trimSeconds(input.action.tail), excluded: false };
      case "exclude":
        return { ...current, excluded: true };
      case "restore":
        return { ...current, excluded: false };
      case "reset":
        return { ...NO_EDIT };
    }
  })();

  if (input.action.do === "trim") {
    const seconds = input.box.end - input.box.start;
    if (next.head + next.tail > seconds - MIN_COVERAGE_SECONDS) {
      return { ops: [], refused: `a trim leaves at least ${MIN_COVERAGE_SECONDS} s of the ${seconds.toFixed(2)} s shot — to drop the take, leave it out instead` };
    }
  }

  const patch = { trim_head_seconds: next.head, trim_tail_seconds: next.tail, excluded: next.excluded };
  if (!row) {
    // an exclusion or a trim of an offered take: the row is the record of the decision
    if (next.head === 0 && next.tail === 0 && !next.excluded) return { ops: [], refused: null };
    const onBox = input.assignments.filter((a) => a.shotId === input.box.id);
    return {
      ops: [
        {
          op: "insert",
          shotId: input.box.id,
          assetId: input.assetId,
          role,
          // an excluded take is not what the box shows; a trimmed one is the take the director is working on
          isPrimary: !next.excluded,
          sourceIn: null,
          sourceOut: null,
          sortOrder: onBox.length,
          ...patch,
        },
      ],
      refused: null,
    };
  }
  if (current.head === next.head && current.tail === next.tail && current.excluded === next.excluded) return { ops: [], refused: null };
  // excluding what the box was showing clears the selection too, or the cut would still reach for it
  const primary = next.excluded ? { is_primary: false } : {};
  return { ops: [{ op: "update", id: row.id, patch: { ...patch, ...primary } }], refused: null };
}

/** What to tell a director about one take on one box, in words, with no claim the module cannot support. */
export function coverageLabel(c: TakeCoverage): string {
  switch (c.from) {
    case "sync":
      return c.coverage === "full" ? "synced · covers the shot" : "synced · covers part of the shot";
    case "trimmed":
      return `trimmed · ${c.leadIn > 0 ? `${c.leadIn.toFixed(2)} s in` : "from the cut"}${c.tailOut > 0 ? `, ${c.tailOut.toFixed(2)} s short of the out` : ""}`;
    case "excluded":
      return "left out of this variation";
    case "emptied":
      return "trimmed to nothing";
    case "unsynced":
      return "not matched to the song";
    case "uncovered":
      return "no footage here";
  }
}
