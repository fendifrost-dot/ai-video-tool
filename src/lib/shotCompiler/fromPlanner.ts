/**
 * Where the compiler's phrases COME FROM (amendment A2): the coverage planner, the lyric clock and the storyboard —
 * never freeform.
 *
 *  - phrasesFromCoveragePlan(): `scripts/edit/camera_coverage.py plan` output (coverage_plan.json + angle_requests.json)
 *    → coverage_take / coverage_angle phrases. The Python planner is the engine of record for bar-grid sub-slots,
 *    seeded draws and the static budget; this module does not redo those draws.
 *  - phrasesFromShotSpecs(): the storyboard's non-performance cards (after applyShotOverrides → applyCoverageDefaults)
 *    → world phrases, each with the lyric lines sung inside its window and a motion contract read from the card.
 *
 * Pure module: no react, no supabase, no project knowledge.
 */

import { classifyMotion } from "@/lib/treatment/coverage";
import type { ShotSpec } from "@/lib/treatment/shotSpec";
import { lyricsForShot, type LyricLine } from "@/lib/lyrics/lyricsForShot";
import type { CompilerPhrase, CoverageMoveSpec, MotionContract } from "./types";

/** One sub-slot of coverage_plan.json (what camera_coverage.py plan writes). */
export type PlannerSub = {
  id: string;
  slot: string;
  section: string;
  song: [number, number];
  move: { type: string; amount: number; ease: string; start?: number; end?: number; direction?: string };
  handheld: number;
  lens: string;
  framing: string;
  source: "take" | "angle";
  transition?: string;
  angle?: string;
  variant?: string;
};
export type PlannerSlot = {
  slot: string;
  section: string;
  song: [number, number];
  source: string;
  masterStart?: number | null;
  matte_dir?: string | null;
  plate?: string | null;
  plate_loop?: boolean;
  subs: PlannerSub[];
};
export type PlannerPlan = { bpm: number; slots: PlannerSlot[] };

/** One entry of angle_requests.json (seedance_ref dialect, written by the planner for its "angle" sub-slots). */
export type PlannerAngleRequest = {
  id: string;
  kind: "angle";
  route: "seedance_ref";
  aspect?: "9:16" | "16:9" | "4:3";
  resolution?: "480p" | "720p" | "1080p";
  source_path?: string | null;
  source_local?: string | null;
  source_window?: [number, number];
  masterStart?: number;
  angle: string;
  keep?: string[];
  still_path?: string;
};

function moveSpec(sub: PlannerSub): CoverageMoveSpec {
  return {
    type: sub.move.type,
    amount: sub.move.amount,
    ease: sub.move.ease,
    handheld: sub.handheld,
    lens: sub.lens,
    start: sub.move.start,
    end: sub.move.end,
    direction: sub.move.direction,
  };
}

/**
 * Planner output → phrases. `keep` is the wardrobe constants every seedance request must carry (the planner leaves
 * `keep: []` because nothing in the scripts lane knows the wardrobe); `sourcePaths` maps a slot id to the trimmed
 * cut's project-clips path (the planner only knows local files).
 */
export function phrasesFromCoveragePlan(
  plan: PlannerPlan,
  angleRequests: readonly PlannerAngleRequest[],
  opts: { keep: string[]; sourcePaths?: Record<string, string>; resolution?: "480p" | "720p" | "1080p" },
): CompilerPhrase[] {
  const out: CompilerPhrase[] = [];
  const byId = new Map(angleRequests.map((r) => [r.id, r] as const));
  for (const slot of plan.slots) {
    const sourcePath = opts.sourcePaths?.[slot.slot] ?? slot.source;
    for (const sub of slot.subs) {
      const sourceSeconds = Math.max(0.1, sub.song[1] - sub.song[0]);
      if (sub.source === "take") {
        out.push({
          kind: "coverage_take",
          id: sub.id,
          slot: slot.slot,
          section: sub.section ?? slot.section,
          song: sub.song,
          move: moveSpec(sub),
          framing: sub.framing,
          sourcePath,
          sourceLocal: slot.source,
          sourceSeconds,
          transition: sub.transition,
          matteDir: slot.matte_dir ?? undefined,
          plate: slot.plate ?? undefined,
          plateLoop: slot.plate_loop,
          masterStart: slot.masterStart ?? undefined,
        });
      } else {
        // the planner writes the seedance request for this sub-slot; prefer its fields, fall back to the sub
        const req = [...byId.values()].find((r) => r.id === sub.id || r.id.startsWith(`${sub.id}_`));
        const angle = req?.angle ?? sub.angle;
        if (!angle) continue;
        out.push({
          kind: "coverage_angle",
          id: req?.id ?? sub.id,
          slot: slot.slot,
          section: sub.section ?? slot.section,
          song: req?.source_window ?? sub.song,
          move: moveSpec(sub),
          framing: sub.framing,
          sourcePath: req?.source_path ?? sourcePath,
          sourceLocal: req?.source_local ?? slot.source,
          sourceSeconds: req?.source_window ? Math.max(0.1, req.source_window[1] - req.source_window[0]) : sourceSeconds,
          angle,
          keep: req?.keep?.length ? req.keep : opts.keep,
          transition: sub.transition,
          stillPath: req?.still_path,
          resolution: req?.resolution ?? opts.resolution ?? "720p",
          masterStart: req?.masterStart ?? slot.masterStart ?? undefined,
        });
      }
    }
  }
  return out;
}

/** Engine move named by the card (its prose first, then its typed field), as a CoverageMoveSpec with preset amounts. */
export function cameraFromSpec(spec: ShotSpec): CoverageMoveSpec {
  const named = classifyMotion(spec.cameraMotion) || "static";
  const desc = spec.cameraMotion?.description ?? "";
  // "push 0.16 · anamorphic_35 · handheld 0.25" is what applyCoverageDefaults writes; read the numbers back when present
  const amount = Number(/\b(?:push|pull|truck|pan|orbit|crane|pedestal|snap_zoom|dolly_zoom|whip_pan|static|handheld)\s+([0-9.]+)/.exec(desc)?.[1] ?? NaN);
  const lens = /·\s*([a-z0-9_]+)\s*·/i.exec(desc)?.[1];
  const handheld = Number(/handheld\s+([0-9.]+)/.exec(desc)?.[1] ?? NaN);
  return {
    type: named,
    amount: Number.isFinite(amount) ? amount : named === "static" ? 0 : 0.16,
    ease: "in_out",
    handheld: Number.isFinite(handheld) ? handheld : 0.25,
    lens: lens ?? "anamorphic_35",
  };
}

/** The motion contract (motion_story_v1: entrance / primary / secondary / exit) read from a card's fields. */
export function motionContractFromSpec(spec: ShotSpec): MotionContract {
  const fx = spec.fx.map((f) => f.description || f.type).filter(Boolean).join("; ");
  return {
    entrance: spec.transitionIn?.preset ? `arrives on a ${spec.transitionIn.preset.replace(/_/g, " ")}` : "",
    primary: spec.performanceDirection || spec.purpose,
    secondary: fx,
    exit: spec.transitionOut?.preset ? `leaves on a ${spec.transitionOut.preset.replace(/_/g, " ")}` : "",
  };
}

/**
 * Storyboard → world phrases for every card that is NOT real performance (B-roll, inserts, worlds). The scene is the
 * card's environment + purpose + required elements; the lyric is what is sung inside the card's window.
 */
export function phrasesFromShotSpecs(
  specs: readonly ShotSpec[],
  lyricLines: readonly LyricLine[],
  opts: { aspect?: "9:16" | "16:9" | "4:3"; stillPaths?: Record<string, string> } = {},
): CompilerPhrase[] {
  const out: CompilerPhrase[] = [];
  for (const spec of specs) {
    if (spec.shotType === "performance") continue;
    const lines = lyricsForShot(lyricLines, spec.timeline).map((l) => l.text).join(" / ");
    const scene = [
      spec.environment.description || spec.environment.location,
      spec.purpose,
      spec.requiredElements.length ? `Must include: ${spec.requiredElements.join(", ")}.` : "",
    ]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join(" ");
    out.push({
      kind: "world",
      id: spec.id,
      song: [spec.timeline.start, spec.timeline.end],
      lyric: lines || undefined,
      prompt: scene,
      motion: motionContractFromSpec(spec),
      camera: cameraFromSpec(spec),
      aspect: opts.aspect,
      stillPath: opts.stillPaths?.[spec.id],
    });
  }
  return out;
}
