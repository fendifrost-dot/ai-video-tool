/**
 * Provider capabilities (Lane D · Creative Director).
 *
 * Describes what the render/generation pipeline can actually do, so the planner
 * only ever recommends an engine a shot could be produced with. This is the
 * "capabilities" input to the boundary — an adapter concern, kept separate from
 * the planner so a real capabilities probe can replace {@link DEFAULT_CAPABILITIES}
 * without touching planning logic.
 *
 * No engine here implies any paid generation is performed — this is metadata the
 * planner reasons over. Actually rendering a shot is out of scope for Lane D.
 */

import type { RenderEngine, ShotKind } from "@/lib/treatment/shotSpec";

/** What a single engine is good for. */
export type EngineCapability = {
  engine: RenderEngine;
  /** Shot kinds this engine can author. */
  kinds: ShotKind[];
  /** True if the engine can produce moving footage (vs. stills only). */
  video: boolean;
  /** Soft ceiling on a single generated clip, in seconds (null = unbounded). */
  maxClipSeconds: number | null;
  /** One-line description shown in the UI. */
  note: string;
};

/** The set of engines available, in preference order (best-fit first). */
export type ProviderCapabilities = {
  engines: EngineCapability[];
  /** True if captured source footage is available to cut to (vs. generate). */
  hasSourceFootage: boolean;
};

/**
 * Conservative default capability set. Ordered by planning preference. These are
 * DESCRIPTIVE defaults for the mock planner and carry no cost implication; a
 * project can pass its own {@link ProviderCapabilities} to override.
 */
export const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  hasSourceFootage: true,
  engines: [
    {
      engine: "runway",
      kinds: ["broll", "generated"],
      video: true,
      maxClipSeconds: 10,
      note: "Video-native generation; strong for stylized b-roll.",
    },
    {
      engine: "veo",
      kinds: ["broll", "generated"],
      video: true,
      maxClipSeconds: 8,
      note: "Cinematic environments and camera moves.",
    },
    {
      engine: "grok",
      kinds: ["generated"],
      video: false,
      maxClipSeconds: null,
      note: "Product-accurate hero keyframes for propagation.",
    },
    {
      engine: "manual",
      kinds: ["performance", "broll", "generated"],
      video: true,
      maxClipSeconds: null,
      note: "Editorial / captured footage — no generation.",
    },
  ],
};

/**
 * Pick the best engine for a shot of the given `kind`, honouring the clip length
 * where the engine is bounded. Preference follows the order of `engines`.
 *
 * Returns `null` when nothing fits — the caller should then treat the shot as
 * captured/manual rather than inventing an engine.
 */
export function pickEngine(
  caps: ProviderCapabilities,
  kind: ShotKind,
  clipSeconds: number,
): RenderEngine | null {
  const fits = caps.engines.filter(
    (e) => e.kinds.includes(kind) && (e.maxClipSeconds == null || clipSeconds <= e.maxClipSeconds),
  );
  if (fits.length === 0) return null;
  // Prefer a non-manual generator for generated shots; manual is the fallback.
  const generative = fits.find((e) => e.engine !== "manual");
  return (generative ?? fits[0]).engine;
}

/** True when the capability set can render moving footage for `kind`. */
export function canRenderVideo(caps: ProviderCapabilities, kind: ShotKind): boolean {
  return caps.engines.some((e) => e.video && e.kinds.includes(kind));
}
