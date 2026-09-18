import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ADVANCED_DESTINATION_KEYS,
  DEFAULT_ENGINEERING_MODE,
  ENGINEERING_MODE_STORAGE_KEY,
  _internal,
  getEngineeringMode,
  isAdvancedDestination,
  isDestinationVisible,
  setEngineeringMode,
  toggleEngineeringMode,
  useEngineeringMode,
} from "./engineeringMode";

beforeEach(() => {
  localStorage.clear();
  _internal.reset();
});

afterEach(() => {
  localStorage.clear();
  _internal.reset();
});

describe("classification", () => {
  it("marks each known engineering destination as advanced", () => {
    for (const key of ADVANCED_DESTINATION_KEYS) {
      expect(isAdvancedDestination(key)).toBe(true);
    }
  });

  it("treats core creative-funnel destinations as not advanced", () => {
    // The primary rail — everything the sidebar shows without engineering mode.
    for (const key of ["treatment", "assets", "video", "review", "export"]) {
      expect(isAdvancedDestination(key)).toBe(false);
    }
  });

  it("hides advanced destinations in creative mode but shows them in engineering mode", () => {
    expect(isDestinationVisible("hero-frame", "creative")).toBe(false);
    expect(isDestinationVisible("hero-frame", "engineering")).toBe(true);
  });

  it("always shows creative destinations regardless of mode", () => {
    expect(isDestinationVisible("treatment", "creative")).toBe(true);
    expect(isDestinationVisible("treatment", "engineering")).toBe(true);
  });
});

describe("store", () => {
  it("defaults to creative", () => {
    expect(DEFAULT_ENGINEERING_MODE).toBe("creative");
    expect(getEngineeringMode()).toBe("creative");
  });

  it("reads a persisted engineering value from localStorage", () => {
    localStorage.setItem(ENGINEERING_MODE_STORAGE_KEY, "engineering");
    _internal.reset();
    expect(getEngineeringMode()).toBe("engineering");
  });

  it("falls back to creative for an unrecognised persisted value", () => {
    localStorage.setItem(ENGINEERING_MODE_STORAGE_KEY, "nonsense");
    _internal.reset();
    expect(getEngineeringMode()).toBe("creative");
  });

  it("persists on set", () => {
    setEngineeringMode("engineering");
    expect(getEngineeringMode()).toBe("engineering");
    expect(localStorage.getItem(ENGINEERING_MODE_STORAGE_KEY)).toBe("engineering");
  });

  it("toggles back and forth and returns the new mode", () => {
    expect(toggleEngineeringMode()).toBe("engineering");
    expect(getEngineeringMode()).toBe("engineering");
    expect(toggleEngineeringMode()).toBe("creative");
    expect(getEngineeringMode()).toBe("creative");
  });
});

describe("useEngineeringMode", () => {
  it("exposes the default mode", () => {
    const { result } = renderHook(() => useEngineeringMode());
    expect(result.current.mode).toBe("creative");
    expect(result.current.isEngineering).toBe(false);
  });

  it("re-renders subscribers when the mode changes", () => {
    const { result } = renderHook(() => useEngineeringMode());
    act(() => {
      result.current.toggleMode();
    });
    expect(result.current.mode).toBe("engineering");
    expect(result.current.isEngineering).toBe(true);
  });

  it("shares state across independent hook instances", () => {
    const a = renderHook(() => useEngineeringMode());
    const b = renderHook(() => useEngineeringMode());
    act(() => {
      a.result.current.setMode("engineering");
    });
    expect(b.result.current.mode).toBe("engineering");
  });
});
