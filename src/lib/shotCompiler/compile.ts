/**
 * compileToWorldBatch — phrases → { shots, stubs } in run_world_batch.py dialect.
 * Phase 1–2: pure, no network. Scripts stay the paid executor.
 */

import { snapDurationForRoute } from "./duration";
import { resolveLookPreset } from "./lookPresets";
import { cameraMoveToSentence, motionContractToSentence, seedanceAnglePrompt } from "./prompts";
import type {
  AspectRatio,
  CompilerPhrase,
  CompilerStub,
  GateHints,
  ShotCompilerInput,
  ShotCompilerResult,
  WorldBatchShot,
} from "./types";

function songDuration(song: [number, number]): number {
  return Math.max(0.1, song[1] - song[0]);
}

function compilePhrase(
  phrase: CompilerPhrase,
  look: ReturnType<typeof resolveLookPreset>["look"],
  aspectDefault: AspectRatio,
  defaultKeep: string[],
): { shot?: WorldBatchShot; stub?: CompilerStub } {
  switch (phrase.kind) {
    case "coverage_take": {
      // $0 take_move — never DoP/Kling on a singing take
      return {
        stub: {
          id: phrase.id,
          route: "take_move",
          provider: false,
          song: phrase.song,
          sourcePath: phrase.sourcePath,
          move: phrase.move,
          handheld: phrase.move.handheld,
          lens: phrase.move.lens,
          framing: phrase.framing,
          transition: phrase.transition,
          slot: phrase.slot,
          section: phrase.section,
          matteDir: phrase.matteDir,
          plate: phrase.plate,
          plateLoop: phrase.plateLoop,
          masterStart: phrase.masterStart,
        },
      };
    }

    case "coverage_angle": {
      const keep = phrase.keep.length ? phrase.keep : defaultKeep;
      if (!keep.length) {
        throw new Error(
          `coverage_angle ${phrase.id}: keep[] wardrobe constants are required for seedance_ref`,
        );
      }
      const seconds = snapDurationForRoute("seedance_ref", phrase.sourceSeconds, phrase.sourceSeconds);
      const withImage = Boolean(phrase.stillPath);
      const prompt = seedanceAnglePrompt(phrase.angle, keep, look, withImage);
      const shot: WorldBatchShot = {
        id: phrase.id,
        kind: "angle",
        aspect: aspectDefault,
        seconds,
        prompt,
        motion: phrase.angle,
        route: "seedance_ref",
        source_path: phrase.sourcePath,
        source_local: phrase.sourceLocal,
        angle: phrase.angle,
        keep,
        resolution: phrase.resolution ?? "720p",
        source_seconds: phrase.sourceSeconds,
        source_window: phrase.song,
      };
      if (phrase.masterStart != null) shot.masterStart = phrase.masterStart;
      if (phrase.stillPath) shot.still_path = phrase.stillPath;
      return { shot };
    }

    case "world": {
      const route = phrase.routeHint ?? "still_kling";
      const rawSec = phrase.seconds ?? songDuration(phrase.song);
      const seconds = snapDurationForRoute(route, rawSec);
      const motionSentence = [
        motionContractToSentence(phrase.motion),
        cameraMoveToSentence(phrase.camera),
      ]
        .filter(Boolean)
        .join(" ");
      // The dialect's `prompt` is the scene itself: run_world_batch.py wraps it in the look preset (preamble for
      // the still, suffix for the motion) — wrapping here too sent the preamble and suffix twice.
      const shot: WorldBatchShot = {
        id: phrase.id,
        kind: "world",
        aspect: phrase.aspect ?? aspectDefault,
        seconds,
        prompt: phrase.prompt.trim(),
        motion: motionSentence,
        route,
        stills: 2,
      };
      if (phrase.stillPath) shot.still_path = phrase.stillPath;
      return { shot };
    }

    case "hero_broll": {
      // Non-singing B-roll only — DoP or Kling from hero still
      const route = phrase.routeHint ?? "still_dop";
      const rawSec = phrase.seconds ?? (phrase.song ? songDuration(phrase.song) : 5);
      const seconds = snapDurationForRoute(route, rawSec);
      return {
        shot: {
          id: phrase.id,
          kind: "plate",
          aspect: phrase.aspect ?? aspectDefault,
          seconds,
          prompt: phrase.prompt.trim(),
          motion: phrase.motion.trim(),
          route,
          stills: 1,
          still_path: phrase.heroStillPath,
        },
      };
    }

    case "living_plate": {
      return {
        stub: {
          id: phrase.id,
          route: "living_plate",
          provider: false,
          song: phrase.song,
          takePath: phrase.takePath,
          platePath: phrase.platePath,
          placement: phrase.placement,
        },
      };
    }

    default: {
      const _exhaustive: never = phrase;
      throw new Error(`Unknown phrase kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function compileToWorldBatch(input: ShotCompilerInput): ShotCompilerResult {
  const { id: lookPresetId, look } = resolveLookPreset(input.lookPresetId, input.lookPreset);
  const aspectDefault = input.aspectDefault ?? "9:16";
  const defaultKeep = input.defaultKeep ?? [];

  const shots: WorldBatchShot[] = [];
  const stubs: CompilerStub[] = [];

  for (const phrase of input.phrases) {
    const { shot, stub } = compilePhrase(phrase, look, aspectDefault, defaultKeep);
    if (shot) shots.push(shot);
    if (stub) stubs.push(stub);
  }

  const hasSeedance = shots.some((s) => s.route === "seedance_ref");
  const hasCoverageStubs = stubs.some((s) => s.route === "take_move");

  const gateHints: GateHints = {
    lookPresetId,
    requireLookBank: true,
    requireReferenceFidelity: hasSeedance,
    requireCoverageQa: hasCoverageStubs || hasSeedance,
  };

  return { shots, stubs, lookPresetId, gateHints };
}

/** Serialize paid shots only — drop into run_world_batch.py --shots. */
export function toShotsJson(result: ShotCompilerResult): string {
  return JSON.stringify(result.shots, null, 2);
}

/** Serialize non-provider stubs (take_move → toCoveragePlan(), living_plate → compositorArgs()). */
export function toStubsJson(result: ShotCompilerResult): string {
  return JSON.stringify(result.stubs, null, 2);
}

/** Variant file name the Python planner uses: `<sub id>_<move type>.mp4` under <out>/variants/. */
export function variantPath(outDir: string, subId: string, moveType: string): string {
  return `${outDir.replace(/\/+$/, "")}/variants/${subId}_${moveType}.mp4`;
}

/**
 * take_move stubs → the coverage_plan.json dialect that `scripts/edit/camera_coverage.py render` consumes
 * (slots[].{slot, section, song, source, masterStart, matte_dir, plate, plate_loop, subs[].{id, move, handheld,
 * lens, framing, source:"take", variant}}). One slot per performance take; its subs are the bar-grid cuts.
 */
export function toCoveragePlan(
  result: ShotCompilerResult,
  opts: { outDir: string; bpm: number; seed?: number; presets?: string },
): CoveragePlan {
  const slots = new Map<string, CoveragePlanSlot>();
  for (const st of result.stubs) {
    if (st.route !== "take_move" || !st.move || !st.sourcePath) continue;
    const slotId = st.slot ?? st.id.replace(/[a-z]$/, "");
    let slot = slots.get(slotId);
    if (!slot) {
      slot = {
        slot: slotId,
        section: st.section ?? "default",
        song: [st.song[0], st.song[1]],
        source: st.sourcePath,
        masterStart: st.masterStart ?? null,
        matte_dir: st.matteDir ?? null,
        plate: st.plate ?? null,
        plate_loop: Boolean(st.plateLoop),
        subs: [],
      };
      slots.set(slotId, slot);
    }
    slot.song = [Math.min(slot.song[0], st.song[0]), Math.max(slot.song[1], st.song[1])];
    slot.subs.push({
      id: st.id,
      slot: slotId,
      section: slot.section,
      song: st.song,
      move: st.move,
      handheld: st.handheld ?? st.move.handheld,
      lens: st.lens ?? st.move.lens,
      framing: st.framing ?? "medium",
      transition: st.transition,
      source: "take",
      variant: variantPath(opts.outDir, st.id, st.move.type),
    });
  }
  return {
    bpm: opts.bpm,
    presets: opts.presets ?? "config/coverage_presets.json",
    seed: opts.seed ?? 7,
    slots: [...slots.values()].sort((a, b) => a.song[0] - b.song[0]),
  };
}

export type CoveragePlanSub = {
  id: string;
  slot: string;
  section: string;
  song: [number, number];
  move: CompilerStub["move"];
  handheld: number;
  lens: string;
  framing: string;
  transition?: string;
  source: "take";
  variant: string;
};
export type CoveragePlanSlot = {
  slot: string;
  section: string;
  song: [number, number];
  source: string;
  masterStart: number | null;
  matte_dir: string | null;
  plate: string | null;
  plate_loop: boolean;
  subs: CoveragePlanSub[];
};
export type CoveragePlan = { bpm: number; presets: string; seed: number; slots: CoveragePlanSlot[] };

/** living_plate stub → composite_environment.py argv (flags as data; nothing here knows a project). */
export function compositorArgs(stub: CompilerStub, out: string): string[] {
  if (stub.route !== "living_plate" || !stub.takePath || !stub.platePath) {
    throw new Error(`compositorArgs: ${stub.id} is not a living_plate stub`);
  }
  const args = ["scripts/edit/composite_environment.py", "--in", stub.takePath, "--plate", stub.platePath, "--out", out];
  const p = stub.placement ?? {};
  if (p.matchPlate != null) args.push("--match-plate", String(p.matchPlate));
  if (p.fgPlace) args.push("--fg-place", p.fgPlace.join(","));
  if (p.fgAnchor) args.push("--fg-anchor", p.fgAnchor);
  if (p.occluderAuto) args.push("--occluder-auto", p.occluderAuto.join(","));
  if (p.occluderBelow != null) args.push("--occluder-below", String(p.occluderBelow));
  if (p.occluderFromPlate) args.push("--occluder-from-plate", p.occluderFromPlate);
  if (p.occluderFeather != null) args.push("--occluder-feather", String(p.occluderFeather));
  return args;
}
