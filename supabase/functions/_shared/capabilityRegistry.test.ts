import { describe, expect, it } from "vitest";
import {
  BUILTIN_RECORDS,
  OVERRIDE_ENV_VAR,
  SAFETY_MAX_REFERENCE_IMAGES,
  addressFromLegacyKey,
  addressKey,
  evaluateRequest,
  getCapability,
  modelSpecificity,
  type CapabilityRecord,
} from "./capabilityRegistry.ts";

const env = (v?: string) => ({ get: (n: string) => (n === OVERRIDE_ENV_VAR ? v : undefined) });

/** Fixed clock so staleness assertions do not rot. */
const NOW = new Date("2026-09-23T00:00:00Z");
const at = (now: Date = NOW) => ({ now, env: env() });

describe("capabilityRegistry · address resolution", () => {
  it("distinguishes models on the same provider and operation", () => {
    // The incident this registry exists to prevent: one number per vendor.
    const quality = getCapability(
      { provider: "xai", model: "grok-imagine-image-quality", operation: "images/edits" },
      at(),
    );
    const v2 = getCapability(
      { provider: "xai", model: "grok-imagine-image-2.0", operation: "images/edits" },
      at(),
    );

    expect(quality.values.maxReferenceImages).toBe(3);
    expect(v2.values.maxReferenceImages).toBe(5);
    // Same provider, same operation, different truth — and each knows why.
    expect(quality.provenance.maxReferenceImages?.status).toBe("LIVE_VERIFIED");
    expect(v2.provenance.maxReferenceImages?.status).toBe("DOCUMENTED");
  });

  it("falls back to the provider-wide record when the model is unpinned", () => {
    const unpinned = getCapability({ provider: "xai", operation: "images/edits" }, at());
    expect(unpinned.values.maxReferenceImages).toBe(3);
    expect(unpinned.contributors).toContain("xai/*/images/edits");
  });

  it("inherits unset fields from the broader record, field by field", () => {
    // The model-specific record pins ONLY maxReferenceImages; everything else must
    // come from xai/*/images/edits rather than reverting to unknown.
    const r = getCapability(
      { provider: "xai", model: "grok-imagine-image-quality", operation: "images/edits" },
      at(),
    );
    expect(r.values.imageReferenceConditioning).toBe(true);
    expect(r.provenance.imageReferenceConditioning?.from).toBe("xai/*/images/edits");
    expect(r.provenance.maxReferenceImages?.from).toBe(
      "xai/grok-imagine-image-quality/images/edits",
    );
  });

  it("ranks exact id above a family pattern above provider-wide", () => {
    expect(modelSpecificity("grok-imagine-image-2.0", "grok-imagine-image-2.0")).toBe(3);
    expect(modelSpecificity("grok-imagine-*", "grok-imagine-image-2.0")).toBeGreaterThan(2);
    expect(modelSpecificity("grok-imagine-*", "grok-imagine-image-2.0")).toBeLessThan(3);
    expect(modelSpecificity("*", "anything")).toBe(1);
    expect(modelSpecificity("grok-*", "runway-gen4")).toBe(0);
    // Longer prefix = tighter family.
    expect(modelSpecificity("grok-imagine-image-*", "grok-imagine-image-2.0")).toBeGreaterThan(
      modelSpecificity("grok-*", "grok-imagine-image-2.0"),
    );
  });

  it("does not leak facts across operations or providers", () => {
    const otherOp = getCapability(
      { provider: "xai", model: "grok-imagine-image-quality", operation: "videos/edits" },
      at(),
    );
    // videos/edits has its own provider-wide record; the image model record must not apply.
    expect(otherOp.values.maxPromptChars).toBe(4096);
    expect(otherOp.contributors).toEqual(["xai/*/videos/edits"]);
    expect(otherOp.contributors).not.toContain("xai/grok-imagine-image-quality/images/edits");
  });
});

describe("capabilityRegistry · unknown addresses fail closed", () => {
  it("returns known=false and the conservative reference default", () => {
    const r = getCapability(
      { provider: "nobody", model: "nothing", operation: "videos/generations" },
      at(),
    );
    expect(r.known).toBe(false);
    expect(r.effectiveStatus).toBe("UNKNOWN");
    expect(r.values.maxReferenceImages).toBe(1);
    expect(r.values.maxPromptChars).toBeNull();
    expect(r.provenance.maxReferenceImages?.status).toBe("UNKNOWN");
  });

  it("blocks a multi-reference call against an unknown address", () => {
    const r = getCapability({ provider: "nobody", operation: "videos/edits" }, at());
    const e = evaluateRequest(r, { referenceImages: 4 });
    expect(e.allowed).toBe(false);
    expect(e.violations[0].severity).toBe("block");
    expect(e.violations[0].message).toContain("not in the registry");
  });

  it("allows a single-reference call but records the unproven limits", () => {
    const r = getCapability({ provider: "nobody", operation: "videos/edits" }, at());
    const e = evaluateRequest(r, { referenceImages: 1, promptChars: 500 });
    expect(e.allowed).toBe(true);
    // Not silently fine — the prompt limit is unproven and says so.
    expect(e.violations.map((x) => x.severity)).toEqual(["unverified"]);
    expect(e.violations[0].field).toBe("maxPromptChars");
  });

  it("treats a requested feature with unverified support as unverified, and a false one as blocking", () => {
    const unverified = getCapability({ provider: "xai", operation: "videos/edits" }, at());
    // keyframeConditioning is explicitly null: the /videos/edits contract documents no pin.
    expect(evaluateRequest(unverified, { usesKeyframeConditioning: true }).allowed).toBe(true);
    expect(
      evaluateRequest(unverified, { usesKeyframeConditioning: true }).violations[0].severity,
    ).toBe("unverified");

    const denied = getCapability(
      { provider: "acme", model: "m", operation: "videos/edits" },
      {
        now: NOW,
        records: [
          {
            provider: "acme",
            model: "m",
            operation: "videos/edits",
            keyframeConditioning: false,
            status: "LIVE_VERIFIED",
            verifiedAt: "2026-09-20",
            source: "test",
          },
        ],
      },
    );
    const e = evaluateRequest(denied, { usesKeyframeConditioning: true });
    expect(e.allowed).toBe(false);
    expect(e.violations[0].severity).toBe("block");
  });
});

describe("capabilityRegistry · staleness", () => {
  const record = (verifiedAt: string): CapabilityRecord[] => [
    {
      provider: "acme",
      model: "m",
      operation: "videos/edits",
      maxPromptChars: 1000,
      status: "LIVE_VERIFIED",
      verifiedAt,
      source: "test",
    },
  ];

  it("keeps a fresh LIVE_VERIFIED fact", () => {
    const r = getCapability(
      { provider: "acme", model: "m", operation: "videos/edits" },
      { now: NOW, records: record("2026-09-01") },
    );
    expect(r.provenance.maxPromptChars?.effectiveStatus).toBe("LIVE_VERIFIED");
    expect(r.effectiveStatus).toBe("LIVE_VERIFIED");
  });

  it("derives STALE past the TTL without discarding the value", () => {
    // 2026-09-23 minus 2026-01-01 is well past the 90-day LIVE_VERIFIED TTL.
    const r = getCapability(
      { provider: "acme", model: "m", operation: "videos/edits" },
      { now: NOW, records: record("2026-01-01") },
    );
    expect(r.provenance.maxPromptChars?.status).toBe("LIVE_VERIFIED"); // declared class is preserved
    expect(r.provenance.maxPromptChars?.effectiveStatus).toBe("STALE"); // but it is not trusted as fresh
    expect(r.values.maxPromptChars).toBe(1000); // still the best number we have
  });

  it("still blocks over a stale limit, and flags a compliant call as unverified", () => {
    const r = getCapability(
      { provider: "acme", model: "m", operation: "videos/edits" },
      { now: NOW, records: record("2026-01-01") },
    );
    expect(evaluateRequest(r, { promptChars: 2000 }).allowed).toBe(false);

    const ok = evaluateRequest(r, { promptChars: 500 });
    expect(ok.allowed).toBe(true);
    expect(ok.violations[0].severity).toBe("unverified");
    expect(ok.violations[0].message).toContain("STALE");
  });

  it("treats an undated fact as stale — freshness must be provable", () => {
    const r = getCapability(
      { provider: "acme", model: "m", operation: "videos/edits" },
      {
        now: NOW,
        records: [
          {
            provider: "acme",
            model: "m",
            operation: "videos/edits",
            maxPromptChars: 10,
            status: "DOCUMENTED",
            verifiedAt: null,
            source: "test",
          },
        ],
      },
    );
    expect(r.provenance.maxPromptChars?.effectiveStatus).toBe("STALE");
  });
});

describe("capabilityRegistry · overrides", () => {
  it("applies an override and downgrades undeclared provenance to INFERRED", () => {
    const raw = JSON.stringify([
      { provider: "xai", model: "*", operation: "images/edits", maxReferenceImages: 5 },
    ]);
    const r = getCapability(
      { provider: "xai", operation: "images/edits" },
      { now: NOW, env: env(raw) },
    );
    expect(r.values.maxReferenceImages).toBe(5);
    // The built-in was LIVE_VERIFIED; an operator assertion must not inherit that.
    expect(r.provenance.maxReferenceImages?.status).toBe("INFERRED");
    expect(r.provenance.maxReferenceImages?.layer).toBe("override");
  });

  it("lets a provider-wide override beat a model-specific built-in, visibly", () => {
    const raw = JSON.stringify([
      { provider: "xai", model: "*", operation: "images/edits", maxReferenceImages: 2 },
    ]);
    const r = getCapability(
      { provider: "xai", model: "grok-imagine-image-quality", operation: "images/edits" },
      { now: NOW, env: env(raw) },
    );
    // Layer beats specificity — that is how a wrong built-in gets corrected without a
    // redeploy — but the provenance shows it came from an override, not from evidence.
    expect(r.values.maxReferenceImages).toBe(2);
    expect(r.provenance.maxReferenceImages?.layer).toBe("override");
  });

  it("clamps any override to the safety ceiling", () => {
    const raw = JSON.stringify([
      { provider: "xai", model: "*", operation: "videos/edits", maxReferenceImages: 64 },
    ]);
    const r = getCapability(
      { provider: "xai", operation: "videos/edits" },
      { now: NOW, env: env(raw) },
    );
    expect(r.values.maxReferenceImages).toBe(SAFETY_MAX_REFERENCE_IMAGES);
    expect(r.provenance.maxReferenceImages?.source).toContain("safety ceiling");
  });

  it("survives malformed override JSON by keeping the built-in facts", () => {
    for (const bad of ["not json", "{}", '{"xai":1}', "[]", "[null, 3]"]) {
      const r = getCapability(
        { provider: "xai", operation: "images/edits" },
        { now: NOW, env: env(bad) },
      );
      expect(r.values.maxReferenceImages).toBe(3);
    }
  });

  it("honours a declared LIVE_VERIFIED override — verification can arrive out of band", () => {
    const raw = JSON.stringify([
      {
        provider: "xai",
        model: "*",
        operation: "videos/edits",
        maxReferenceImages: 6,
        status: "LIVE_VERIFIED",
        verifiedAt: "2026-09-22",
        source: "live 400 at 7",
      },
    ]);
    const r = getCapability(
      { provider: "xai", operation: "videos/edits" },
      { now: NOW, env: env(raw) },
    );
    expect(r.values.maxReferenceImages).toBe(6);
    expect(r.provenance.maxReferenceImages?.status).toBe("LIVE_VERIFIED");
  });
});

describe("capabilityRegistry · enforcement", () => {
  it("blocks the verified xai prompt limit before the call", () => {
    const r = getCapability({ provider: "xai", operation: "videos/edits" }, at());
    expect(evaluateRequest(r, { promptChars: 4096 }).allowed).toBe(true);
    const over = evaluateRequest(r, { promptChars: 4097 });
    expect(over.allowed).toBe(false);
    expect(over.violations[0].field).toBe("maxPromptChars");
    expect(over.violations[0].limit).toBe(4096);
  });

  it("blocks a 4-reference images/edits call that the provider would reject", () => {
    const r = getCapability(
      { provider: "xai", model: "grok-imagine-image-quality", operation: "images/edits" },
      at(),
    );
    expect(evaluateRequest(r, { referenceImages: 3 }).allowed).toBe(true);
    expect(evaluateRequest(r, { referenceImages: 4 }).allowed).toBe(false);
  });

  it("carries a different evidence class per field on one address", () => {
    // One address, two evidence classes: the 4096-char limit was proven by a live 400,
    // the reference ceiling never was. A record-level status alone cannot say this.
    const r = getCapability({ provider: "xai", operation: "videos/edits" }, at());
    expect(r.provenance.maxPromptChars?.status).toBe("LIVE_VERIFIED");
    expect(r.provenance.maxPromptChars?.verifiedAt).toBe("2026-09-22");
    expect(r.provenance.maxPromptChars?.evidence).toContain("4096");
    expect(r.provenance.maxReferenceImages?.status).toBe("INFERRED");
    expect(r.provenance.maxReferenceImages?.verifiedAt).toBe("2026-09-21");
    // Both came from the same record.
    expect(r.provenance.maxPromptChars?.from).toBe(r.provenance.maxReferenceImages?.from);
  });

  it("reports the weakest evidence class for the whole resolution", () => {
    // xai/*/videos/edits is INFERRED overall even though maxPromptChars is LIVE_VERIFIED,
    // because the reference ceiling on the same address is not a provider fact.
    const r = getCapability({ provider: "xai", operation: "videos/edits" }, at());
    expect(r.provenance.maxPromptChars?.status).toBe("LIVE_VERIFIED");
    expect(r.effectiveStatus).toBe("INFERRED");
  });
});

describe("capabilityRegistry · seed integrity", () => {
  it("gives every built-in record provenance", () => {
    for (const r of BUILTIN_RECORDS) {
      expect(r.source, addressKey(r)).toBeTruthy();
      if (r.status !== "UNKNOWN") expect(r.verifiedAt, addressKey(r)).toBeTruthy();
    }
  });

  it("ships no unexercised provider as a hard constraint", () => {
    // Guessing Runway/Veo limits would be a memory-derived benchmark. Absent = UNKNOWN
    // = fails closed, which is the honest default until someone verifies them.
    expect([...new Set(BUILTIN_RECORDS.map((r) => r.provider))]).toEqual(["xai"]);
  });

  it("maps a legacy provider:endpoint key onto the provider-wide address", () => {
    expect(addressFromLegacyKey("xai:videos/edits")).toEqual({
      provider: "xai",
      model: "*",
      operation: "videos/edits",
    });
    expect(addressFromLegacyKey("nonsense")).toEqual({
      provider: "nonsense",
      model: "*",
      operation: "*",
    });
  });
});
