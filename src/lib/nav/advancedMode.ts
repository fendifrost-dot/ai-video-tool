import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Advanced / Engineering navigation mode.
//
// Lane A owns the *creative-vs-Advanced* split of the project rail: the primary
// funnel (Build Treatment → Produce Video → Review → Export) is always visible;
// engineering destinations (Shot List detail, Hero Frame, Prompt Lab, Cover
// Flight, Timeline editor, Continuity) are hidden until Advanced mode is on.
//
// This is a self-contained, localStorage-backed flag (same persistence pattern
// as `projectRail`). It is intentionally provider-free — a module-level store +
// `useSyncExternalStore` keeps every sidebar instance (desktop + mobile) in sync
// without threading a Context through the layout route.
//
// COORDINATION NOTE (Lane G): if/when Lane G lands a canonical app-wide mode
// flag, this hook is the single integration point — repoint `getSnapshot` /
// `setAdvancedMode` at Lane G's store and every consumer follows. Keep the
// `useAdvancedMode()` signature stable so callers do not churn.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "avt.nav.advancedMode";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

let current = read();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Cross-tab sync: react to localStorage writes from other tabs/windows.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    current = read();
    emit();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function getSnapshot(): boolean {
  return current;
}

function getServerSnapshot(): boolean {
  return false;
}

export function setAdvancedMode(next: boolean): void {
  if (next === current) return;
  current = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Ignore write failures (private mode / storage disabled); in-memory
      // state still updates so the current session reflects the toggle.
    }
  }
  emit();
}

/**
 * Read + toggle the Advanced/Engineering nav mode.
 * Returns a tuple `[enabled, setEnabled]` mirroring `useState`.
 */
export function useAdvancedMode(): readonly [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [enabled, setAdvancedMode] as const;
}
