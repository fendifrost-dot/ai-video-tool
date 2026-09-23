import { describe, expect, it } from "vitest";
import { eligibleCandidates, type Candidate } from "./capabilityBakeoff.ts";
import type { CapabilityRecord } from "./capabilityRegistry.ts";

const NOW = new Date("2026-09-23T00:00:00Z");

const candidates: Candidate[] = [
  {
    provider: "xai",
    model: "grok-imagine-image-quality",
    operation: "images/edits",
    label: "xAI quality",
  },
  { provider: "xai", model: "grok-imagine-image-2.0", operation: "images/edits", label: "xAI 2.0" },
  { provider: "someone-else", model: "unproven-1", operation: "images/edits", label: "unproven" },
];

describe("eligibleCandidates", () => {
  it("excludes only candidates a capability fact rules out", () => {
    // 4 references: the quality model is verified at 3, so it is out; 2.0 documents 5.
    const r = eligibleCandidates(candidates, { referenceImages: 4 }, { now: NOW });
    expect(r.map((x) => x.eligible)).toEqual([false, true, false]);
    expect(r[0].notes[0]).toContain("excluded");
    // The unknown provider is excluded here because its conservative default is 1 — a
    // real over-request, not an omission.
    expect(r[2].notes[0]).toContain("excluded");
  });

  it("keeps an unproven candidate eligible-but-provisional rather than dropping it", () => {
    // Absence of evidence is not evidence of incapability. Silently dropping unproven
    // providers is how a capability registry becomes a ranking by omission.
    const r = eligibleCandidates(
      candidates,
      { referenceImages: 1, promptChars: 200 },
      { now: NOW },
    );
    const unproven = r[2];
    expect(unproven.eligible).toBe(true);
    expect(unproven.provisional).toBe(true);
    expect(unproven.notes.join(" ")).toContain("not in the registry");
  });

  it("marks a verified-and-satisfied candidate as non-provisional", () => {
    const records: CapabilityRecord[] = [
      {
        provider: "acme",
        model: "m",
        operation: "images/edits",
        maxReferenceImages: 4,
        maxPromptChars: 1000,
        status: "LIVE_VERIFIED",
        verifiedAt: "2026-09-20",
        source: "test",
      },
    ];
    const [only] = eligibleCandidates(
      [{ provider: "acme", model: "m", operation: "images/edits" }],
      { referenceImages: 2, promptChars: 100 },
      { now: NOW, records },
    );
    expect(only.eligible).toBe(true);
    expect(only.provisional).toBe(false);
    expect(only.notes).toEqual([]);
  });

  it("preserves caller order and expresses no preference", () => {
    const r = eligibleCandidates(candidates, { referenceImages: 1 }, { now: NOW });
    expect(r.map((x) => x.candidate.label)).toEqual(["xAI quality", "xAI 2.0", "unproven"]);
    // No score, rank, or winner field exists to sort on.
    expect(Object.keys(r[0])).toEqual([
      "candidate",
      "eligible",
      "provisional",
      "evaluation",
      "notes",
    ]);
  });
});
