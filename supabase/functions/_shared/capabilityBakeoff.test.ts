import { describe, expect, it } from "vitest";
import { capabilityKeyFor, eligibleCandidates, type Candidate } from "./capabilityBakeoff.ts";

const env = (v?: string) => ({
  get: (n: string) => (n === "PROVIDER_CAPABILITIES_JSON" ? v : undefined),
});
const noEnv = env();

const candidates: Candidate[] = [
  {
    provider: "xai",
    operation: "images/edits",
    model: "grok-imagine-image-quality",
    label: "xAI quality",
  },
  { provider: "xai", operation: "images/edits", model: "grok-imagine-image-2.0", label: "xAI 2.0" },
  { provider: "someone-else", operation: "images/edits", model: "unproven-1", label: "unproven" },
];

describe("eligibleCandidates", () => {
  it("reads capability truth from providerCapabilities, per model", () => {
    // 4 references: the quality model is verified at 3, so it is out; 2.0 documents 5.
    const r = eligibleCandidates(candidates, { referenceImages: 4 }, noEnv);
    expect(r.map((x) => x.eligible)).toEqual([false, true, false]);
    expect(r[0].capability.maxReferenceImages).toBe(3);
    expect(r[1].capability.maxReferenceImages).toBe(5);
    expect(r[0].capabilityKey).toBe("xai:images/edits");
  });

  it("excludes only what a capability fact rules out", () => {
    const r = eligibleCandidates(candidates, { referenceImages: 4 }, noEnv);
    expect(r[0].notes[0]).toContain("excluded");
    // The unknown provider is excluded here because its conservative default is 1 — a real
    // over-request, not an omission.
    expect(r[2].notes[0]).toContain("excluded");
    expect(r[2].notes[0]).toContain("not in the capability table");
  });

  it("keeps an unproven candidate eligible-but-provisional rather than dropping it", () => {
    // Absence of evidence is not evidence of incapability. Silently dropping unproven providers
    // is how capability data becomes a ranking by omission.
    const r = eligibleCandidates(candidates, { referenceImages: 1 }, noEnv);
    const unproven = r[2];
    expect(unproven.eligible).toBe(true);
    expect(unproven.provisional).toBe(true);
    expect(unproven.notes.join(" ")).toContain("eligibility is untested");
  });

  it("marks a verified-and-satisfied candidate as non-provisional", () => {
    const [only] = eligibleCandidates(
      [{ provider: "xai", operation: "videos/edits" }],
      { referenceImages: 2, promptChars: 100 },
      noEnv,
    );
    expect(only.eligible).toBe(true);
    expect(only.provisional).toBe(false);
    expect(only.notes).toEqual([]);
  });

  it("excludes on a verified prompt limit and flags an unverified one", () => {
    const over = eligibleCandidates(
      [{ provider: "xai", operation: "videos/edits" }],
      { promptChars: 4097 },
      noEnv,
    );
    expect(over[0].eligible).toBe(false);
    expect(over[0].notes[0]).toContain("4096");

    // images/edits has no verified prompt limit — proceed, but say so.
    const unknownLimit = eligibleCandidates(
      [{ provider: "xai", operation: "images/edits" }],
      { promptChars: 4097 },
      noEnv,
    );
    expect(unknownLimit[0].eligible).toBe(true);
    expect(unknownLimit[0].provisional).toBe(true);
    expect(unknownLimit[0].notes.join(" ")).toContain("no verified prompt limit");
  });

  it("excludes a model recorded as not supporting first-frame conditioning", () => {
    // grok-imagine-video-1.5 guides a GENERATED video; it cannot pin a first frame.
    const r = eligibleCandidates(
      [{ provider: "xai", operation: "videos/generations", model: "grok-imagine-video-1.5" }],
      { needsFirstFrameConditioning: true },
      noEnv,
    );
    expect(r[0].eligible).toBe(false);
    expect(r[0].notes[0]).toContain("first-frame conditioning");
  });

  it("respects the model-scoped safety ceiling", () => {
    // Seedance documents 30; an override cannot buy that allowance for another model.
    const seed = eligibleCandidates(
      [{ provider: "runway", operation: "video_to_video", model: "seedance2_5" }],
      { referenceImages: 30 },
      noEnv,
    );
    expect(seed[0].eligible).toBe(true);

    const xai = eligibleCandidates(
      [{ provider: "xai", operation: "videos/edits" }],
      { referenceImages: 30 },
      env('{"xai:videos/edits":{"maxReferenceImages":30}}'),
    );
    expect(xai[0].eligible).toBe(false);
  });

  it("preserves caller order and expresses no preference", () => {
    const r = eligibleCandidates(candidates, { referenceImages: 1 }, noEnv);
    expect(r.map((x) => x.candidate.label)).toEqual(["xAI quality", "xAI 2.0", "unproven"]);
    // No score, rank or winner field exists to sort on.
    expect(Object.keys(r[0]).sort()).toEqual(
      ["candidate", "capability", "capabilityKey", "eligible", "notes", "provisional"].sort(),
    );
  });

  it("builds the capability key from provider and operation", () => {
    expect(capabilityKeyFor({ provider: "runway", operation: "video_to_video" })).toBe(
      "runway:video_to_video",
    );
  });
});
