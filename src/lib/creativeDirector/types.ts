/**
 * Creative Director — boundary types (Lane D · Treatment UX Sprint).
 *
 * The Creative Director is the planning surface that stands between everything
 * a filmmaker brings to the table and a machine-executable plan:
 *
 *     source footage  ┐
 *     song + timing   │
 *     wardrobe refs   ├──►  Creative Director  ──►  ShotSpec[] sequence
 *     creative brief  │        (planner)            (filmmaker language +
 *     capabilities    ┘                              production requirements)
 *
 * It speaks *filmmaker language* on the way in (a brief, looks, references) and
 * emits the generalized {@link ShotSpec} contract on the way out — nothing here
 * is project- or brand-specific. A "look" is a name + description + references;
 * the creative brief lives on the project, never in these defaults.
 *
 * This module owns only the data shapes. The planner adapter interface lives in
 * `planner.ts`; provider capability description in `capabilities.ts`.
 */

import type { GridClip } from "@/lib/treatment/grid";
import type { Reference, ShotSpec } from "@/lib/treatment/shotSpec";
import type { ProviderCapabilities } from "@/lib/creativeDirector/capabilities";

/** Editorial format of the piece. Mirrors treatment `ProjectType`. */
export type CreativeFormat = "music_video" | "commercial" | "social";

/**
 * A wardrobe look as the Creative Director consumes it. Deliberately generic —
 * a free-form name + description + references. NO brand is baked in; the panel
 * rotates whatever looks the project supplies (falling back to "Look A/B/…").
 */
export type WardrobeLook = {
  /** Human name, e.g. "Opening look". Never a hardcoded brand. */
  name: string;
  description?: string | null;
  /** Managed look/wardrobe asset id, when this maps to one. */
  lookId?: string | null;
  references?: Reference[];
};

/**
 * A piece of source footage available to cut from. The Creative Director may
 * assign a performance clip to a shot instead of requiring fresh generation.
 */
export type SourceFootage = {
  /** Managed asset / media id, when tracked. */
  mediaId?: string | null;
  uri?: string | null;
  /** What it depicts, in plain language, e.g. "full-song closet performance". */
  description?: string | null;
  /** Duration of the captured take in seconds, when known. */
  durationSeconds?: number | null;
};

/**
 * The complete creative boundary the director plans against. Every field is
 * optional except `format` and `grid`: a brief can be as thin as "music video,
 * here's the beat grid" and the planner still produces a coherent sequence.
 */
export type CreativeBrief = {
  format: CreativeFormat;
  /** The one-paragraph concept / logline chosen for the piece. */
  concept?: string | null;
  /** Longer narrative-through-line notes, if any. */
  narrative?: string | null;
  mood?: string | null;
  /** Free-form visual-style reference, e.g. "kinetic, high-contrast". */
  visualStyle?: string | null;
  /** Named song, for context. */
  songTitle?: string | null;
  /** Available wardrobe looks, in intended order of appearance. */
  wardrobe?: WardrobeLook[];
  /** Captured footage the director can cut to instead of generating. */
  sourceFootage?: SourceFootage[];
  /** Extra direction: must-have shots, constraints, references. */
  notes?: string | null;
};

/**
 * The full input to a planning run: the brief, the deterministic timing grid
 * (timing math is NEVER delegated — see `lib/treatment/grid.ts`), and the
 * provider capabilities that bound which engines a shot may recommend.
 */
export type PlanInput = {
  brief: CreativeBrief;
  /** Beat-aligned clip grid. The planner fills creative fields per clip; it
   *  must not move the cut points. */
  grid: GridClip[];
  /** What the pipeline can actually render. Bounds engine recommendations. */
  capabilities?: ProviderCapabilities;
};

/** A named movement/section the director groups shots into. */
export type PlanSection = {
  name: string;
  /** Director's intent for the section, in filmmaker language. */
  intent: string;
};

/**
 * The Creative Director's proposal: a complete, ordered ShotSpec sequence plus
 * the human-readable rationale that frames it. `shots` is the machine contract;
 * everything else is the pitch a director would give in the room.
 */
export type CreativeDirectorPlan = {
  /** One-line summary of the visual approach. */
  logline: string;
  /** Director's rationale — why this sequence, in prose. */
  rationale: string;
  sections: PlanSection[];
  /** The proposed sequence. Ordered; timeline matches the grid exactly. */
  shots: ShotSpec[];
  /** Planner id that produced this (e.g. "mock"), for provenance. */
  planner: string;
  /** Model/engine label when a real provider was used; "" for deterministic. */
  model: string;
  /** ISO timestamp; empty when the caller wants to stamp it. */
  generatedAt: string;
};
