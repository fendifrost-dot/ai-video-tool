/**
 * compileToWorldBatch — phrases → { shots, stubs } in run_world_batch.py dialect.
 * Phase 1–2: pure, no network. Scripts stay the paid executor.
 */

import { snapDurationForRoute } from "./duration";
import { resolveLookPreset } from "./lookPresets";
import {
  cameraMoveToSentence,
  motionContractToSentence,
  seedanceAnglePrompt,
  wrapPrompt,
} from "./prompts";
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
      };
      if (phrase.stillPath) shot.still_path = phrase.stillPath;
      return { shot };
    }

    case "world": {
      const route = phrase.routeHint ?? (phrase.stillPath ? "still_kling" : "still_kling");
      const rawSec = phrase.seconds ?? songDuration(phrase.song);
      const seconds = snapDurationForRoute(route, rawSec);
      const motionSentence = [
        motionContractToSentence(phrase.motion),
        cameraMoveToSentence(phrase.camera),
      ]
        .filter(Boolean)
        .join(" ");
      const isI2v = route.startsWith("still_");
      const prompt = wrapPrompt(phrase.prompt, look, {
        motion: isI2v ? undefined : motionSentence,
        preamble: !isI2v || !phrase.stillPath,
      });
      const shot: WorldBatchShot = {
        id: phrase.id,
        kind: "world",
        aspect: phrase.aspect ?? aspectDefault,
        seconds,
        prompt,
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
      const prompt = wrapPrompt(phrase.prompt, look, {
        motion: phrase.motion,
        preamble: false, // still carries look
      });
      return {
        shot: {
          id: phrase.id,
          kind: "plate",
          aspect: phrase.aspect ?? aspectDefault,
          seconds,
          prompt,
          motion: phrase.motion,
          route,
          stills: 1,
          still_path: phrase.heroStillPath,
          heroStillUrl: phrase.heroStillPath,
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

/** Serialize non-provider stubs for coverage.py / composite_environment. */
export function toStubsJson(result: ShotCompilerResult): string {
  return JSON.stringify(result.stubs, null, 2);
}
