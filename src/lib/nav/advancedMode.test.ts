import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { setAdvancedMode, useAdvancedMode } from "./advancedMode";

const STORAGE_KEY = "avt.nav.advancedMode";

describe("advancedMode nav flag", () => {
  beforeEach(() => {
    // Reset to a known-off state before each test.
    window.localStorage.clear();
    setAdvancedMode(false);
  });

  afterEach(() => {
    setAdvancedMode(false);
    window.localStorage.clear();
  });

  it("defaults to off and toggles on via the hook setter", () => {
    const { result } = renderHook(() => useAdvancedMode());
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
  });

  it("persists the flag to localStorage and clears it when turned off", () => {
    setAdvancedMode(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");

    setAdvancedMode(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("keeps every subscriber in sync from a single store", () => {
    const a = renderHook(() => useAdvancedMode());
    const b = renderHook(() => useAdvancedMode());

    act(() => setAdvancedMode(true));
    expect(a.result.current[0]).toBe(true);
    expect(b.result.current[0]).toBe(true);
  });

  it("reacts to cross-tab storage events", () => {
    const { result } = renderHook(() => useAdvancedMode());
    expect(result.current[0]).toBe(false);

    act(() => {
      window.localStorage.setItem(STORAGE_KEY, "true");
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: "true" }));
    });
    expect(result.current[0]).toBe(true);
  });
});
