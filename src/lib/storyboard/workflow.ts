/**
 * Where one video stands in the music-video workflow (Fendi, 15 Oct 2026) — read-only, so the steps can be run again
 * without an agent and anyone can see what is left:
 *
 *   1. Treatment built.
 *   2. Outfits built, and scenes wear them.
 *   3. AI shots generated (a clip selected on each).
 *   4. A performance take under each performance shot.
 *   5. Clothing swap on the performance shot, only where the scene's outfit needs it (dress.ts) — current or STALE.
 *   6. Integrate the performance into the AI location (composite). NOT automated yet: compositing is under
 *      validation, and restaging is not an approved production method (DECISION, Fendi, 15 Oct). Counted, not run.
 *
 * Pure: it is handed facts the storyboard already holds and counts them.
 */
import { takeRangeForBox } from "./footageEdit";
import { dressStaleness, type DressRecord, type DressStaleness } from "./dress";
import type { StoryboardBox } from "./boxes";

export type WorkflowShot = {
  performance: boolean;
  /** An original take in sync covers the shot (its base layer, or the take put on it). */
  hasTake: boolean;
  /** What the shot shows is a clip made for it (selected), not the take or nothing. */
  hasSelectedClip: boolean;
  /** A performance shot whose scene's outfit has pieces to swap onto the take. */
  needsDress: boolean;
  /** The dressed takes on this shot, and whether each is stale. */
  dressed: { stale: boolean }[];
  /** A take composited over a place is on this shot (made outside the storyboard). */
  composited: boolean;
};

export type WorkflowInput = {
  hasTreatment: boolean;
  outfits: number;
  scenes: { assigned: boolean }[];
  shots: WorkflowShot[];
};

export type WorkflowState = "done" | "partial" | "todo" | "none" | "manual";

export type WorkflowStep = {
  id: "treatment" | "outfits" | "ai_shots" | "performance" | "dress" | "integrate";
  label: string;
  state: WorkflowState;
  /** The headline count ("3/5"). */
  count: string;
  /** One line more. */
  detail: string;
  /** Dressed shots whose every dressed take is stale (step 5 only). */
  stale?: number;
};

const ratio = (done: number, total: number): WorkflowState => (total === 0 ? "none" : done >= total ? "done" : done === 0 ? "todo" : "partial");

export function workflowStatus(input: WorkflowInput): WorkflowStep[] {
  const ai = input.shots.filter((s) => !s.performance);
  const perf = input.shots.filter((s) => s.performance);
  const assigned = input.scenes.filter((s) => s.assigned).length;
  const needDress = perf.filter((s) => s.needsDress);
  const dressedCurrent = needDress.filter((s) => s.dressed.some((d) => !d.stale)).length;
  const dressedStale = needDress.filter((s) => s.dressed.length > 0 && s.dressed.every((d) => d.stale)).length;
  const withTake = perf.filter((s) => s.hasTake).length;
  const composited = perf.filter((s) => s.composited).length;
  return [
    {
      id: "treatment",
      label: "Treatment",
      state: input.hasTreatment ? "done" : "todo",
      count: input.hasTreatment ? "1/1" : "0/1",
      detail: input.hasTreatment ? "written" : "not written yet",
    },
    {
      id: "outfits",
      label: "Outfits",
      state: input.outfits === 0 || input.scenes.length === 0 ? "todo" : ratio(assigned, input.scenes.length),
      count: `${assigned}/${input.scenes.length}`,
      detail: `${input.outfits} outfit${input.outfits === 1 ? "" : "s"} · scenes assigned`,
    },
    {
      id: "ai_shots",
      label: "AI shots",
      state: ratio(ai.filter((s) => s.hasSelectedClip).length, ai.length),
      count: `${ai.filter((s) => s.hasSelectedClip).length}/${ai.length}`,
      detail: "with a selected clip",
    },
    {
      id: "performance",
      label: "Performance",
      state: ratio(withTake, perf.length),
      count: `${withTake}/${perf.length}`,
      detail: "with a take in sync",
    },
    {
      id: "dress",
      label: "Dress",
      state: needDress.length === 0 ? "none" : dressedStale > 0 && dressedCurrent < needDress.length ? "partial" : ratio(dressedCurrent, needDress.length),
      count: `${dressedCurrent}/${needDress.length}`,
      detail: needDress.length === 0 ? "no shot needs a swap" : `dressed / needing the scene's outfit${dressedStale ? ` · ${dressedStale} stale` : ""}`,
      stale: dressedStale,
    },
    {
      id: "integrate",
      label: "Integrate (composite)",
      state: "manual",
      count: `${composited}/${withTake}`,
      detail: "not automated yet — compositing is under validation",
    },
  ];
}

/**
 * A dressed take on a shot, held against the state now (dress.ts dressStaleness): the scene's outfit, the parent
 * take's sync and the shot's stretch of the parent take. A take without a whole dress record is stale — nothing says
 * what it was made from.
 */
export function dressedTakeState(input: {
  record: DressRecord | null | undefined;
  box: Pick<StoryboardBox, "start" | "end">;
  outfit: { id: string; key: string; name: string; version: number } | null;
  parentSync: { id: string; offsetSeconds: number; driftPpm: number; status?: string } | null;
  parentSeconds: number | null;
}): DressStaleness {
  if (!input.record) return { state: "stale", reasons: [{ code: "sync_changed", text: "the dressed take carries no record of what it was made from" }] };
  const usable = input.parentSync && (input.parentSync.status === undefined || input.parentSync.status === "confirmed" || input.parentSync.status === "manual") ? input.parentSync : null;
  const range = usable ? takeRangeForBox(input.box, usable, input.parentSeconds) : null;
  return dressStaleness(input.record, {
    outfit: input.outfit,
    sync: usable ? { id: usable.id, offsetSeconds: usable.offsetSeconds, driftPpm: usable.driftPpm } : null,
    shotRange: range && range.coverage === "full" ? { start: range.start, end: range.end } : null,
  });
}
