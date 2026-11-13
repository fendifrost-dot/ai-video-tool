// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assetsToFetch, evictionPlan, mayClearScratch } from "../../supabase/functions/_shared/workerCache.ts";

const now = 1_000_000_000_000;

describe("cache", () => {
  it("fetches only the assets the job names", () => {
    expect(assetsToFetch(["a", "b", "a"], new Set(["b"]))).toEqual(["a"]);
  });

  it("evicts disposable LRU and TTL copies and keeps protected ones", () => {
    const plan = evictionPlan({
      now,
      capBytes: 100,
      ttlMs: 1000,
      entries: [
        { key: "old", bytes: 40, class: "disposable", verified: true, lastUsed: now - 5000 },
        { key: "big", bytes: 80, class: "disposable", verified: true, lastUsed: now - 10 },
        { key: "fresh", bytes: 10, class: "disposable", verified: true, lastUsed: now },
        { key: "take", bytes: 90, class: "disposable", verified: true, locked: true, lastUsed: now - 99999, kind: "camera" },
        { key: "pending", bytes: 50, class: "disposable", verified: false, lastUsed: now - 99999 },
      ],
    });
    const dropped = plan.evict.map((entry) => entry.key).sort();
    expect(dropped).toContain("old");
    expect(dropped).not.toContain("take");
    expect(dropped).not.toContain("pending");
    expect(plan.deletes_remote).toBe(false);
    expect(plan.kept.map((entry) => entry.key)).toEqual(expect.arrayContaining(["take", "pending"]));
  });

  it("clears scratch only after upload, hash match, and completion", () => {
    expect(mayClearScratch({ uploaded: true, sha256Match: true, jobComplete: true })).toBe(true);
    expect(mayClearScratch({ uploaded: true, sha256Match: false, jobComplete: true })).toBe(false);
    expect(mayClearScratch({ uploaded: true, sha256Match: true, jobComplete: false })).toBe(false);
  });
});
