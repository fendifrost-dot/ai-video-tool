/**
 * Real-media lock placeholders. All five Sprint 2 gates stay UNCLAIMED.
 * Inventing PASS here is a Lane R policy violation, not an owning-lane win.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_REAL_MEDIA_LOCK_IDS,
  assertRealMediaLockTable,
  unclaimedLockCount,
  type RealMediaLockTable,
} from "./real-media-locks";

const table = JSON.parse(
  readFileSync("tests/regression/real-media-locks.json", "utf8"),
) as RealMediaLockTable;

describe("Lane R real-media locks (UNCLAIMED placeholders)", () => {
  it("keeps paidCalls=false / no per-frame Grok / no live SAM-3 fetch", () => {
    expect(table.paidCalls).toBe(false);
    expect(table.grokPerFrame).toBe(false);
    expect(table.sam3LiveFetch).toBe(false);
    expect(table.inventPassForbidden).toBe(true);
  });

  it("lists the five Sprint 2 real-media gates with owning lanes", () => {
    expect(table.locks.map((lock) => lock.id)).toEqual([...REQUIRED_REAL_MEDIA_LOCK_IDS]);
    expect(table.locks.map((lock) => lock.owningLane)).toEqual(["C2", "D2", "H", "D2", "E2"]);
    expect(table.locks.map((lock) => lock.owningIssue)).toEqual([107, 108, 111, 108, 105]);
  });

  it("marks every lock UNCLAIMED with null verdict (do not invent PASS)", () => {
    const errors = assertRealMediaLockTable(table);
    expect(errors).toEqual([]);
    expect(unclaimedLockCount(table)).toBe(REQUIRED_REAL_MEDIA_LOCK_IDS.length);
    for (const lock of table.locks) {
      expect(lock.status).toBe("UNCLAIMED");
      expect(lock.verdict).toBeNull();
      expect(lock.evidence).toBeNull();
    }
  });

  it("does not treat fixture click-smoke / 5-frame E2E as real-media substitutes", () => {
    expect(table.notSubstitutes.join(" ")).toMatch(/5-frame/);
    expect(table.notSubstitutes.join(" ")).toMatch(/#96/);
    expect(table.notSubstitutes.join(" ")).toMatch(/#100/);
    expect(table.canonical.masterClipId).toBe("76fe7438-671d-4428-a7f6-17a45e98c16f");
  });

  it("keeps Real-Media-Benchmark at 0 while every lock is UNCLAIMED", () => {
    expect(table.taxonomyCategory).toBe("Real-Media-Benchmark");
    expect(unclaimedLockCount(table)).toBe(table.locks.length);
  });

  it("rejects an invented PASS on an UNCLAIMED row", () => {
    const forged: RealMediaLockTable = structuredClone(table);
    forged.locks[0]!.verdict = "PASS";
    expect(assertRealMediaLockTable(forged).join(" ")).toMatch(
      /UNCLAIMED must keep verdict null \(do not invent PASS\)/,
    );
  });
});
