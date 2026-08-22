import { describe, expect, it } from "vitest";
import { isAllowedDirectorOrigin } from "./origins";

describe("isAllowedDirectorOrigin", () => {
  it("allows the live app and local Vite", () => {
    expect(isAllowedDirectorOrigin("https://aivideotool.lovable.app")).toBe(true);
    expect(isAllowedDirectorOrigin("http://localhost:5173")).toBe(true);
  });

  it("rejects missing and unknown origins", () => {
    expect(isAllowedDirectorOrigin(null)).toBe(false);
    expect(isAllowedDirectorOrigin("https://evil.example")).toBe(false);
  });
});
