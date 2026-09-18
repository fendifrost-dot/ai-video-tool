/**
 * Engineering-mode UX gating (Lane G — Treatment UX Sprint).
 *
 * Product principle: hide complexity, do not remove capability.
 * The default experience ("creative") keeps engineering-stage destinations —
 * chest/sleeve/SAM/keyframe/temporal/evaluator surfaces — out of the primary
 * nav. Flipping to "engineering" reveals the full set. Nothing is deleted;
 * visibility is gated.
 *
 * This module is a self-contained external store (via `useSyncExternalStore`)
 * so consumers can call {@link useEngineeringMode} anywhere WITHOUT a React
 * provider. Lane A can import the hook directly to filter the sidebar; the
 * toggle and any consumers stay in sync automatically.
 */
import { useSyncExternalStore } from "react";

export type EngineeringMode = "creative" | "engineering";

export const ENGINEERING_MODE_STORAGE_KEY = "avt.ux.engineeringMode";
export const DEFAULT_ENGINEERING_MODE: EngineeringMode = "creative";

/**
 * Destination keys (matching `ProjectSidebar` item `key`s) that expose
 * engineering-stage surfaces. Hidden from the primary nav in creative mode,
 * revealed in engineering mode.
 *
 * MUST stay in sync with `ProjectSidebar.advancedItems` — the sidebar is the
 * rendered source of truth for the rail split, and `ProjectSidebar.test.tsx`
 * cross-checks this list against `advancedItems` so the two cannot drift.
 * (The primary funnel — treatment/assets/video/review/export — is everything
 * NOT listed here.)
 *
 * - `shots`         — shot list (production planning surface)
 * - `cover-flight`  — technical camera-path compiler
 * - `hero-frame`    — keyframe / SAM / mask / propagation studio
 * - `prompt`        — Prompt Lab (prompt engineering)
 * - `timeline`      — music-video editor / timeline
 * - `continuity`    — temporal continuity locking
 */
export const ADVANCED_DESTINATION_KEYS = [
  "shots",
  "cover-flight",
  "hero-frame",
  "prompt",
  "timeline",
  "continuity",
] as const;

export type AdvancedDestinationKey = (typeof ADVANCED_DESTINATION_KEYS)[number];

const ADVANCED_SET = new Set<string>(ADVANCED_DESTINATION_KEYS);

/** True when `key` names an engineering-stage destination. */
export function isAdvancedDestination(key: string): boolean {
  return ADVANCED_SET.has(key);
}

/** Whether a destination should be visible in the given mode. */
export function isDestinationVisible(key: string, mode: EngineeringMode): boolean {
  return mode === "engineering" || !isAdvancedDestination(key);
}

// --- external store ---------------------------------------------------------

const listeners = new Set<() => void>();
let current: EngineeringMode | null = null;

function normalize(value: string | null): EngineeringMode {
  return value === "engineering" ? "engineering" : "creative";
}

/** Read the current mode (lazy-initialised from localStorage, then cached). */
export function getEngineeringMode(): EngineeringMode {
  if (current !== null) return current;
  if (typeof window === "undefined") {
    current = DEFAULT_ENGINEERING_MODE;
    return current;
  }
  try {
    current = normalize(window.localStorage.getItem(ENGINEERING_MODE_STORAGE_KEY));
  } catch {
    current = DEFAULT_ENGINEERING_MODE;
  }
  return current;
}

/** Set the mode, persist it, and notify subscribers. No-op if unchanged. */
export function setEngineeringMode(next: EngineeringMode): void {
  if (next === getEngineeringMode()) return;
  current = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(ENGINEERING_MODE_STORAGE_KEY, next);
    } catch {
      /* storage unavailable (private mode / quota) — keep in-memory value */
    }
  }
  listeners.forEach((listener) => listener());
}

/** Flip between creative and engineering; returns the new mode. */
export function toggleEngineeringMode(): EngineeringMode {
  const next: EngineeringMode =
    getEngineeringMode() === "creative" ? "engineering" : "creative";
  setEngineeringMode(next);
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type EngineeringModeApi = {
  mode: EngineeringMode;
  isEngineering: boolean;
  setMode: (next: EngineeringMode) => void;
  toggleMode: () => EngineeringMode;
};

/**
 * React hook exposing the current engineering mode plus setters. Reactive and
 * shared across every consumer — no provider required.
 */
export function useEngineeringMode(): EngineeringModeApi {
  const mode = useSyncExternalStore(
    subscribe,
    getEngineeringMode,
    () => DEFAULT_ENGINEERING_MODE,
  );
  return {
    mode,
    isEngineering: mode === "engineering",
    setMode: setEngineeringMode,
    toggleMode: toggleEngineeringMode,
  };
}

/** Test-only: reset the in-memory cache and subscribers. */
export const _internal = {
  reset() {
    current = null;
    listeners.clear();
  },
};
