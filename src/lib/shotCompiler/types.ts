/**
 * Shot compiler types — amended after Claude review (rev D).
 * Payload dialect = shots.json in scripts/broll/run_world_batch.py lines 8–20, verbatim: `prompt` is THE SCENE and
 * `motion` the motion sentence — the executor wraps them in the look preset itself (wrap()), so the compiler never
 * pre-wraps. Stubs (take_move, living_plate) stay out of the paid shots array; toCoveragePlan() turns take_move
 * stubs into the coverage_plan.json that scripts/edit/camera_coverage.py render consumes.
 */

/** Typed camera move — same fields as config/coverage_presets.json move entries (+ optional window). */
export type CoverageMoveSpec = {
  type: string;
  amount: number;
  ease: string;
  handheld: number;
  lens: string;
  start?: number;
  end?: number;
  direction?: string;
};

export type MotionContract = {
  entrance: string;
  primary: string;
  secondary: string;
  exit: string;
};

/** A shape a provider can be asked for. The PROJECT frame is src/lib/project/aspect.ts; this is the request made of a model. */
export type AspectRatio = "9:16" | "16:9" | "4:3" | "1:1" | "3:4";

export type WorldBatchRoute =
  | "still_runway"
  | "still_runway45"
  | "still_kling"
  | "still_dop"
  | "runway_t2v"
  | "kling_t2v"
  | "seedance_ref";

/** Paid shot entry matching run_world_batch.py shots.json dialect. */
export type WorldBatchShot = {
  id: string;
  kind: "world" | "plate" | "angle";
  aspect: AspectRatio;
  seconds: number;
  prompt: string;
  motion: string;
  route: WorldBatchRoute;
  stills?: number;
  still_path?: string;
  /** seedance_ref: trimmed take (project-clips path). @Video1 = this, never a hero still. */
  source_path?: string;
  source_local?: string;
  /** seedance_ref: new camera sentence */
  angle?: string;
  /** seedance_ref: wardrobe / identity constants — required */
  keep?: string[];
  resolution?: "480p" | "720p" | "1080p";
  /** seedance_ref: the source's own seconds (run_world_batch.py prefers this over `seconds`). */
  source_seconds?: number;
  /** seedance_ref: [start, end] of the sung window on the song clock, for the fidelity check and the cut. */
  source_window?: [number, number];
  /** seedance_ref: master time at the source file's first frame (the assembler's clock). */
  masterStart?: number;
};

export type CompilerStubRoute = "take_move" | "living_plate";

/** How the compositor places the real take against a plate (composite_environment.py flags, as data). */
export type CompositorPlacement = {
  /** --match-plate weight 0–1 (plate-aware grade on the performer). */
  matchPlate?: number;
  /** --fg-place scale,cx,cy */
  fgPlace?: [number, number, number];
  /** --fg-anchor */
  fgAnchor?: "bottom" | "centre";
  /** --occluder-auto x0,y0,x1,y1 (fractions of the plate): the salient object in the box is lifted in front of him. */
  occluderAuto?: [number, number, number, number];
  /** --occluder-below y (fraction): everything below this horizon is in front. */
  occluderBelow?: number;
  /** --occluder-from-plate mask path (plate geometry). */
  occluderFromPlate?: string;
  /** --occluder-feather px */
  occluderFeather?: number;
};

/** Non-provider stub for scripts/edit/camera_coverage.py (take_move) / composite_environment.py (living_plate). */
export type CompilerStub = {
  id: string;
  route: CompilerStubRoute;
  provider: false;
  song: [number, number];
  /** take_move */
  sourcePath?: string;
  move?: CoverageMoveSpec;
  handheld?: number;
  lens?: string;
  framing?: string;
  transition?: string;
  slot?: string;
  section?: string;
  matteDir?: string;
  plate?: string;
  plateLoop?: boolean;
  masterStart?: number;
  /** living_plate */
  takePath?: string;
  platePath?: string;
  placement?: CompositorPlacement;
};

/**
 * Phrases come from the coverage planner / motion contract — not freeform.
 * - coverage_take → take_move stub ($0, pixel-true)
 * - coverage_angle → seedance_ref (@Video1 = real take)
 * - world → still_kling (default) / t2v from lyric window + motion contract
 * - hero_broll → DoP/Kling i2v from hero still (non-singing only)
 * - living_plate → compositor stub
 */
export type CompilerPhrase =
  | {
      kind: "coverage_take";
      id: string;
      slot: string;
      section: string;
      song: [number, number];
      move: CoverageMoveSpec;
      framing: string;
      sourcePath: string;
      sourceLocal?: string;
      sourceSeconds: number;
      transition?: string;
      matteDir?: string;
      plate?: string;
      plateLoop?: boolean;
      /** master time at the source file's first frame — camera_coverage.py / assemble_section.py clock */
      masterStart?: number;
    }
  | {
      kind: "coverage_angle";
      id: string;
      slot: string;
      section: string;
      song: [number, number];
      move: CoverageMoveSpec;
      framing: string;
      sourcePath: string;
      sourceLocal?: string;
      sourceSeconds: number;
      /** Angle sentence for Seedance (from coverage_presets angles[].sentence). */
      angle: string;
      /** Wardrobe constants — required for seedance_ref. */
      keep: string[];
      transition?: string;
      stillPath?: string;
      resolution?: "480p" | "720p" | "1080p";
      masterStart?: number;
    }
  | {
      kind: "world";
      id: string;
      song: [number, number];
      lyric?: string;
      prompt: string;
      motion: MotionContract;
      camera: CoverageMoveSpec;
      aspect?: AspectRatio;
      seconds?: number;
      stillPath?: string;
      routeHint?: WorldBatchRoute;
    }
  | {
      kind: "hero_broll";
      id: string;
      prompt: string;
      /** Camera-only motion sentence for i2v (non-singing B-roll). */
      motion: string;
      heroStillPath: string;
      seconds?: number;
      aspect?: AspectRatio;
      routeHint?: "still_dop" | "still_kling";
      song?: [number, number];
    }
  | {
      kind: "living_plate";
      id: string;
      takePath: string;
      platePath: string;
      song: [number, number];
      placement?: CompositorPlacement;
    };

export type LookPreset = {
  preamble: string;
  shot_suffix: string;
};

export type ShotCompilerInput = {
  phrases: CompilerPhrase[];
  lookPresetId?: string;
  lookPreset?: LookPreset;
  aspectDefault?: AspectRatio;
  /** Default wardrobe keep[] when coverage_angle omits (should not); used as fail-soft only. */
  defaultKeep?: string[];
};

export type GateHints = {
  lookPresetId: string;
  requireLookBank: boolean;
  /** reference_fidelity.py on every seedance_ref result */
  requireReferenceFidelity: boolean;
  /** coverage_qa.py on the assembled cut */
  requireCoverageQa: boolean;
};

export type ShotCompilerResult = {
  shots: WorldBatchShot[];
  stubs: CompilerStub[];
  lookPresetId: string;
  gateHints: GateHints;
};

/** Genjutsu stays in the route table but is out of the next sample (garment lane parked). */
export type DeferredRoute = "genjutsu_swap" | "genjutsu_motion" | "world_around_still";
