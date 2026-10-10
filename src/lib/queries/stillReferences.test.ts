import { describe, expect, it, vi } from "vitest";

// the module's hook reaches the browser's Supabase client; the functions under test are pure
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { baseCapOf, NO_STILL_REFERENCE_SUPPORT, readSupport, stillCostNote, stillRateUsd, stillTierFor } from "./stillReferences";

/** What the generator answers a dry run with once it lists its edit models. */
const PROBE = {
  ok: true,
  dryRun: true,
  referencesAccepted: true,
  // the usual model's limit: what an app published before the list existed reads, and all it reads
  maxReferences: 3,
  referenceModels: [
    { model: "model-a", maxReferences: 3, usdPerImage: { "1k": 0.07, "2k": 0.07 }, usdPerInputImage: 0, basis: "x" },
    { model: "model-b", maxReferences: 5, usdPerImage: { "1k": 0.06, "2k": 0.08 }, usdPerInputImage: 0.01, basis: "y" },
  ],
};

describe("what the app knows about the pictures a still can go with is what the generator says", () => {
  it("reads each listed model with its limit and its rate, in the order the generator tries them", () => {
    const s = readSupport(PROBE);
    expect(s).toMatchObject({ accepted: true, max: 5, model: null });
    expect(s.tiers.map((t) => [t.model, t.max, t.usdPerImage["2k"], t.usdPerInputImage])).toEqual([["model-a", 3, 0.07, 0], ["model-b", 5, 0.08, 0.01]]);
    expect(baseCapOf(s)).toBe(3);
  });

  it("a generator deployed before it listed its models is one tier: its limit, its model, the plain still's rate", () => {
    const s = readSupport({ referencesAccepted: true, maxReferences: 3, referenceModel: "model-a" });
    expect(s.tiers).toEqual([{ model: "model-a", max: 3, usdPerImage: { "2k": 0.07 }, usdPerInputImage: 0 }]);
    expect(baseCapOf(s)).toBe(3);
    expect(readSupport(null)).toEqual(NO_STILL_REFERENCE_SUPPORT);
    expect(readSupport({ referencesAccepted: false, maxReferences: 9, referenceModels: PROBE.referenceModels })).toMatchObject({ accepted: false, max: 3, tiers: [{ max: 3 }] });
  });

  it("the usual model is the first that takes any picture: one set to nothing by an override is passed over", () => {
    const s = readSupport({ ...PROBE, referenceModels: [{ ...PROBE.referenceModels[0], maxReferences: 0 }, PROBE.referenceModels[1]] });
    expect(baseCapOf(s)).toBe(5);
    expect(stillTierFor(s, 2)?.model).toBe("model-b");
  });

  it("a malformed entry in the list is left out, never trusted", () => {
    const s = readSupport({ ...PROBE, referenceModels: [{ model: 7, maxReferences: 9 }, { model: "model-a", maxReferences: "x" }, PROBE.referenceModels[1], { model: "model-c", maxReferences: 2, usdPerImage: { "2k": "free" }, usdPerInputImage: -1 }] });
    expect(s.tiers.map((t) => t.model)).toEqual(["model-b", "model-c"]);
    expect(s.tiers[1]).toMatchObject({ usdPerImage: { "2k": 0.07 }, usdPerInputImage: 0 });
  });

  it("a still is drawn on the first model that takes all its pictures, and priced with that model's own numbers", () => {
    const s = readSupport(PROBE);
    expect(stillTierFor(s, 0)?.model).toBe("model-a");
    expect(stillTierFor(s, 3)?.model).toBe("model-a");
    expect(stillTierFor(s, 4)?.model).toBe("model-b");
    expect(stillTierFor(s, 6)).toBeNull();
    expect(stillRateUsd(s.tiers[0], 3)).toBe(0.07);
    expect(stillRateUsd(s.tiers[1], 5)).toBe(0.13);
    expect(stillRateUsd(s.tiers[1], 4, "4K")).toBe(0.12);
  });

  it("the confirmation says when a still is drawn on a different model, and what is not yet known about it", () => {
    const s = readSupport(PROBE);
    expect(stillCostNote(s, 0)).toBe("");
    expect(stillCostNote(s, 3)).toBe(" (the edits route is assumed to cost the same as a plain still; unverified)");
    const five = stillCostNote(s, 5);
    expect(five).toContain("the list price of model-b");
    expect(five).toContain("5 pictures are more than model-a takes (3)");
    expect(five).toContain("a different model from your stills with up to 3 pictures");
    expect(five).toContain("not yet verified — check each piece against its photo");
    expect(stillCostNote(NO_STILL_REFERENCE_SUPPORT, 2)).toBe("");
  });
});
