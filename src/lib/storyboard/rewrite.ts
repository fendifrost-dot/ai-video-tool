/**
 * Writing the storyboard from the treatment — the plan (pure).
 *
 * The treatment model is handed the storyboard's OWN boxes as its grid (their keys, their windows), so what it
 * writes maps onto the permanent records one to one. Only boxes that are unlocked, unedited and hold no footage are
 * rewritten; everything else is the director's and is kept exactly as it is.
 */
import type { LyricLine } from "@/lib/lyrics/lyricsForShot";
import { applyCoverageDefaults, DEFAULT_COVERAGE_PRESETS } from "@/lib/treatment/coverage";
import type { ClipEnergy, GridClip } from "@/lib/treatment/grid";
import type { ShotSpec } from "@/lib/treatment/shotSpec";
import { applyGenerated, boxIsStale, orderBoxes, planMaterialize, unlockedForGeneration, withHistory, writeOf, type BoxWrite, type ExistingShotRow, type StoryboardBox } from "./boxes";
import type { Assignment, AssignmentOp } from "./media";

/** The energy of the beat-grid clip a window overlaps most ("mid" when the song has not been analysed). */
export function energyForWindow(window: { start: number; end: number }, beatGrid: readonly GridClip[]): ClipEnergy {
  let best: ClipEnergy = "mid";
  let most = 0;
  for (const g of beatGrid) {
    const overlap = Math.min(window.end, g.end) - Math.max(window.start, g.start);
    if (overlap > most) {
      most = overlap;
      best = g.energy;
    }
  }
  return best;
}

/** The storyboard's own boxes as the grid the treatment model writes for. */
export function gridFromBoxes(boxes: readonly StoryboardBox[], beatGrid: readonly GridClip[]): GridClip[] {
  return orderBoxes(boxes).map((b) => {
    const overlapping = beatGrid.filter((g) => Math.min(b.end, g.end) - Math.max(b.start, g.start) > 0);
    return {
      key: b.key,
      start: b.start,
      end: b.end,
      section: b.section ?? overlapping[0]?.section ?? "verse",
      energy: energyForWindow(b, beatGrid),
    };
  });
}

export type RewritePlan = {
  updates: { id: string; write: BoxWrite }[];
  inserts: BoxWrite[];
  /** Boxes rewritten, and boxes left alone because they are the director's. */
  written: number;
  kept: number;
};

/**
 * Turn a fresh draft into box writes.
 *   • No boxes yet → every drafted clip becomes a box.
 *   • Boxes exist  → the unlocked ones take the draft written for their key; the rest are kept untouched.
 * The coverage planner runs over the WHOLE board (kept boxes included) so the camera budget is judged in context,
 * but only the rewritten boxes take its result.
 */
export function planRewrite(input: {
  boxes: readonly StoryboardBox[];
  boxIdsWithMedia: ReadonlySet<string>;
  /** The draft's specs, keyed by box key (grid key). */
  drafted: readonly ShotSpec[];
  sections: Record<string, string | null | undefined>;
  existingRows: readonly ExistingShotRow[];
  lyricLines: readonly LyricLine[] | undefined;
  at: string;
}): RewritePlan {
  if (input.boxes.length === 0) {
    const specs = applyCoverageDefaults([...input.drafted], DEFAULT_COVERAGE_PRESETS, input.lyricLines as LyricLine[] | undefined);
    const plan = planMaterialize({ specs, sections: input.sections, existing: input.existingRows, at: input.at });
    return { ...plan, written: plan.updates.length + plan.inserts.length, kept: 0 };
  }
  const ordered = orderBoxes(input.boxes);
  const open = new Set(unlockedForGeneration(ordered, input.boxIdsWithMedia).map((b) => b.id));
  const draftedByKey = new Map(input.drafted.map((s) => [s.id, s]));
  const board = ordered.map((b) => {
    const d = open.has(b.id) ? draftedByKey.get(b.key) : undefined;
    // the draft is written on the box's own window: its timeline is the box's, whatever the model echoed back
    return d ? { ...d, id: b.key, timeline: { start: b.start, end: b.end } } : b.spec;
  });
  const planned = applyCoverageDefaults(board, DEFAULT_COVERAGE_PRESETS, input.lyricLines as LyricLine[] | undefined);
  const updates: RewritePlan["updates"] = [];
  ordered.forEach((b, i) => {
    if (!open.has(b.id) || !draftedByKey.has(b.key)) return;
    updates.push({ id: b.id, write: applyGenerated(b, planned[i], input.at, input.sections[b.key] ?? b.section) });
  });
  return { updates, inserts: [], written: updates.length, kept: ordered.length - updates.length };
}

export type ReleasePlan = {
  updates: { id: string; write: BoxWrite }[];
  /** The assignment rows taken off the released shots. The files are not touched and stay in the project. */
  assignmentOps: AssignmentOp[];
  released: number;
  /** How many of them held footage, and how many pieces come off in all. */
  withFootage: number;
  pieces: number;
};

/**
 * Hand back to the treatment the shots that are the director's AND were written from an earlier treatment.
 *
 * A whole-board rewrite never touches a shot that is locked, edited or holding footage — that is what makes it safe
 * to press. It is also what stops a REPLACED treatment from ever taking over a board that has been worked on: the
 * worked-on shots are exactly the ones it skips, and they stay the old video in the middle of the new one. This is
 * the one deliberate way through: the director says these shots belong to the treatment that is gone.
 *
 * For each such shot: the edit is cleared and the lock opened (the scene it had is kept in the shot's history, as any
 * reset keeps it), and the footage on it is taken off — a clip made for the old scene must not be what the new scene
 * shows. Which files were on it is written into the same history entry, so it can be put back. No file is deleted and
 * no shot's window changes. A shot that is not stale, or that a rewrite could already reach, is left alone.
 */
export function planRelease(input: { boxes: readonly StoryboardBox[]; assignments: readonly Assignment[]; treatment: { text: string; updatedAt: string }; at: string }): ReleasePlan {
  const byShot = new Map<string, Assignment[]>();
  for (const a of input.assignments) byShot.set(a.shotId, [...(byShot.get(a.shotId) ?? []), a]);
  const open = new Set(unlockedForGeneration(input.boxes, new Set(byShot.keys())).map((b) => b.id));
  const plan: ReleasePlan = { updates: [], assignmentOps: [], released: 0, withFootage: 0, pieces: 0 };
  for (const box of orderBoxes(input.boxes)) {
    if (open.has(box.id) || !boxIsStale(box, input.treatment)) continue;
    const on = byShot.get(box.id) ?? [];
    const showing = on.find((a) => a.isPrimary);
    const note = on.length
      ? `released to be rewritten from the treatment; footage taken off — ${showing ? `showing was ${showing.assetId} (${showing.role})` : "nothing was showing"}${on.length > (showing ? 1 : 0) ? `; also on it: ${on.filter((a) => a !== showing).map((a) => `${a.assetId} (${a.role})`).join(", ")}` : ""}`
      : "released to be rewritten from the treatment";
    plan.updates.push({
      id: box.id,
      write: writeOf(box, {
        override: null,
        locked: false,
        history: withHistory(box.history, {
          at: input.at,
          event: "reset",
          purpose: box.spec.purpose,
          direction: box.spec.performanceDirection || undefined,
          frame: box.spec.openingFrame || undefined,
          ...(box.spec.events.length ? { events: box.spec.events } : {}),
          note,
        }),
      }),
    });
    for (const a of on) plan.assignmentOps.push({ op: "delete", id: a.id });
    plan.released += 1;
    if (on.length) plan.withFootage += 1;
    plan.pieces += on.length;
  }
  return plan;
}

