import { describe, expect, it } from "vitest";
import { normalSection, sectionFromSearch, sectionOf } from "./section";

const cut = Array.from({ length: 43 }, (_, i) => ({ index: i + 1, key: `c${i}` }));

describe("a section of the cut in Review", () => {
  it("is read from the link, either way round, and is nothing when the link names none", () => {
    expect(sectionFromSearch("?from=14&to=23")).toEqual({ from: 14, to: 23 });
    expect(sectionFromSearch("?to=14&from=23")).toEqual({ from: 14, to: 23 });
    expect(sectionFromSearch("?from=14")).toEqual({ from: 14, to: Number.MAX_SAFE_INTEGER });
    expect(sectionFromSearch("")).toBeNull();
    expect(sectionFromSearch("?from=x&to=3")).toBeNull();
    expect(sectionFromSearch("?from=0&to=3")).toBeNull();
  });

  it("stays inside the cut and in order; the whole cut is no section", () => {
    expect(normalSection({ from: 23, to: 14 }, 43)).toEqual({ from: 14, to: 23 });
    expect(normalSection({ from: 14, to: 99 }, 43)).toEqual({ from: 14, to: 43 });
    expect(normalSection({ from: 1, to: 43 }, 43)).toBeNull();
    expect(normalSection({ from: 3, to: 3 }, 43)).toEqual({ from: 3, to: 3 });
    expect(normalSection({ from: 1, to: 2 }, 0)).toBeNull();
  });

  it("is the shots between its two numbers, and the whole cut when it names none of them", () => {
    expect(sectionOf(cut, { from: 14, to: 23 }).map((s) => s.index)).toEqual([14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);
    expect(sectionOf(cut, null)).toHaveLength(43);
    expect(sectionOf(cut, { from: 50, to: 60 })).toHaveLength(43);
    expect(sectionOf(cut, { from: 40, to: Number.MAX_SAFE_INTEGER }).map((s) => s.index)).toEqual([40, 41, 42, 43]);
  });
});
