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
import { applyGenerated, orderBoxes, planMaterialize, unlockedForGeneration, type BoxWrite, type ExistingShotRow, type StoryboardBox } from "./boxes";

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
