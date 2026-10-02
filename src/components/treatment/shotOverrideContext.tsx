import { createContext, useContext, type ReactNode } from "react";
import type { ShotOverride } from "@/lib/treatment/overrides";
import type { RegeneratedShot, RegenerateMode } from "@/lib/treatment/regenerateFromLyrics";
import type { ShotSpec } from "@/lib/treatment/shotSpec";

/**
 * The override block on a storyboard card needs a project id, the stored overrides and
 * two mutations. ShotStoryboard — which sits between the page and the card — is owned by
 * another lane this week, so threading six new props through it would collide on every
 * merge. A context carries them past it instead.
 *
 * Absent provider = no override UI. That is deliberate: ShotCard is also rendered in
 * tests and in read-only surfaces where editing the treatment makes no sense, and those
 * must keep working untouched.
 */

export type ShotOverrideDraft = {
  direction: string;
  /** What the picture shows when the shot opens — the still. */
  frame: string;
  cameraMotionType: string;
  cameraMotionDescription: string;
  framing: string;
  /** A config/transition_presets.json name (transitions.ts), not the coarse DB family. */
  transitionInPreset: string;
  requiredElements: string[];
  notes: string;
};

export type ShotOverrideContextValue = {
  projectId: string;
  /** Stored overrides keyed by spec id. */
  overrides: Record<string, ShotOverride>;
  /** True while any override mutation is in flight. */
  saving: boolean;
  save: (specId: string, draft: ShotOverrideDraft) => Promise<void>;
  /** "Reset to generated" — delete the row. */
  reset: (specId: string) => Promise<void>;
  /**
   * Regenerate this box from the lyrics sung inside it. Resolves with the mapped fields;
   * the card drops them in UNSAVED so the director reads them before committing.
   * Rejects with NoLyricsInWindowError when the window is instrumental.
   */
  /** `mode` picks the reading of the line; absent, the card's role decides (see `modeForSpec`). */
  regenerate: (spec: ShotSpec, mode?: RegenerateMode) => Promise<RegeneratedShot>;
  /**
   * Null when the box can be regenerated; otherwise the reason it cannot, shown as the
   * button's tooltip. A reason rather than a bare false, because "the button is grey"
   * with no explanation is the most annoying state a tool can be in.
   */
  regenerateBlockedReason: (spec: ShotSpec) => string | null;
  /** True while a regeneration is in flight for this spec id. */
  regeneratingSpecId: string | null;
};

const ShotOverrideContext = createContext<ShotOverrideContextValue | null>(null);

export function ShotOverrideProvider({
  value,
  children,
}: {
  value: ShotOverrideContextValue;
  children: ReactNode;
}) {
  return <ShotOverrideContext.Provider value={value}>{children}</ShotOverrideContext.Provider>;
}

/** Null when no provider is mounted — the card then renders no override UI at all. */
export function useShotOverrideContext(): ShotOverrideContextValue | null {
  return useContext(ShotOverrideContext);
}
