import { describe, expect, it } from "vitest";
import {
  INVALIDATION_POLICY,
  applyQaVerdict,
  buildFingerprintIndex,
  diffDependencies,
  lockArtifact,
  planArtifact,
  planRender,
  supersedeArtifact,
  type ArtifactRecord,
  type DependencyRef,
  type FingerprintIndex,
} from "./artifactLock";

const AT = "2026-09-23T00:00:00Z";

/** A performance shot: real footage, a Look, an xAI edit, then a deterministic wordmark pass. */
function shotArtifact(shot: string, over: Partial<ArtifactRecord> = {}): ArtifactRecord {
  const dependencies: DependencyRef[] = [
    { kind: "source_asset", id: `${shot}:frames`, fingerprint: `src-${shot}-v1` },
    { kind: "shot_spec", id: shot, fingerprint: `spec-${shot}-v1` },
    { kind: "look", id: "look-hook", fingerprint: "look-hook-v1" },
    {
      kind: "provider_model",
      id: "xai/grok-imagine-video/videos/edits",
      fingerprint: "xai-video-edits-v1",
    },
    { kind: "prompt_config", id: shot, fingerprint: `prompt-${shot}-v1` },
    { kind: "deterministic_process", id: "wordmark_track", fingerprint: "wordmark-v1" },
    { kind: "timeline_sync", id: "section-bars24-46", fingerprint: "sync-v1" },
    { kind: "treatment", id: "ysl-section", fingerprint: "treatment-v1" },
  ];
  return {
    artifactId: `${shot}-a1`,
    shotId: shot,
    projectId: "p1",
    state: "LOCKED",
    outputRef: `env7/${shot}_env.mp4`,
    dependencies,
    qa: { verdict: "PASS", gates: ["native_media_qa"], reviewRef: "astra_v8", at: AT },
    lockReason: "passed native-media QA in the v8 round",
    lockedAt: AT,
    ...over,
  };
}

/** The project's current fingerprints, with optional edits applied. */
function worldOf(
  artifacts: ArtifactRecord[],
  edits: Record<string, string> = {},
): FingerprintIndex {
  const index = buildFingerprintIndex(artifacts.flatMap((a) => a.dependencies));
  return { ...index, ...edits };
}

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

describe("lockArtifact", () => {
  it("locks a PASS artifact and records why", () => {
    const a = shotArtifact("S06", { state: "PASS", lockReason: null, lockedAt: null });
    const r = lockArtifact(a, { reason: "v8 native-media QA clean", at: AT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.artifact.state).toBe("LOCKED");
    expect(r.artifact.lockReason).toBe("v8 native-media QA clean");
    expect(r.artifact.lockedAt).toBe(AT);
  });

  it("refuses to lock without a PASS verdict", () => {
    for (const qa of [
      null,
      { verdict: "REPAIR_REQUIRED" as const },
      { verdict: "HUMAN_REVIEW_REQUIRED" as const },
    ]) {
      const r = lockArtifact(shotArtifact("S06", { state: "DRAFT", qa }), { reason: "x", at: AT });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toContain("PASS");
    }
  });

  it("refuses a lock with no reason, and a lock with no declared dependencies", () => {
    const passing = shotArtifact("S06", { state: "PASS" });
    expect(lockArtifact(passing, { reason: "   ", at: AT }).ok).toBe(false);

    // A lock with no inputs could never be invalidated — worse than not locking at all.
    const orphan = lockArtifact({ ...passing, dependencies: [] }, { reason: "looks fine", at: AT });
    expect(orphan.ok).toBe(false);
    if (orphan.ok) return;
    expect(orphan.reason).toContain("no dependencies");
  });

  it("enforces stage-required QA gates", () => {
    const a = shotArtifact("S06", {
      state: "PASS",
      qa: { verdict: "PASS", gates: ["native_media_qa"] },
    });
    expect(lockArtifact(a, { reason: "r", at: AT, requiredGates: ["native_media_qa"] }).ok).toBe(
      true,
    );
    const missing = lockArtifact(a, {
      reason: "r",
      at: AT,
      requiredGates: ["native_media_qa", "wordmark_track_qa"],
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.reason).toContain("wordmark_track_qa");
  });

  it("is idempotent, and refuses to re-lock a superseded artifact", () => {
    const locked = shotArtifact("S06");
    expect(lockArtifact(locked, { reason: "again", at: AT })).toEqual({
      ok: true,
      artifact: locked,
    });
    const dead = shotArtifact("S06", { state: "SUPERSEDED" });
    expect(lockArtifact(dead, { reason: "r", at: AT }).ok).toBe(false);
  });
});

describe("supersedeArtifact", () => {
  /** Narrow the result union, failing loudly if a case that should succeed did not. */
  function expectOk(r: ReturnType<typeof supersedeArtifact>) {
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);
    if (!r.ok) throw new Error(r.reason);
    return r;
  }

  it("retires the old artifact and points it at the replacement", () => {
    const old = shotArtifact("S09");
    const next = shotArtifact("S09", { artifactId: "S09-a2", state: "DRAFT" });
    const { previous, replacement } = expectOk(
      supersedeArtifact(old, next, { at: AT, reason: "S09 crossed-arm repair" }),
    );
    expect(previous.state).toBe("SUPERSEDED");
    expect(previous.supersededBy).toBe("S09-a2");
    expect(previous.supersededAt).toBe(AT);
    expect(replacement.artifactId).toBe("S09-a2");
    expect(previous.outputRef).toBe(old.outputRef);
  });

  it("keeps why-it-was-locked and why-it-was-retired as separate facts", () => {
    const old = shotArtifact("S09", { lockReason: "passed native-media QA in v8" });
    const { previous } = expectOk(
      supersedeArtifact(old, shotArtifact("S09", { artifactId: "S09-a2" }), {
        at: AT,
        reason: "band repair",
      }),
    );
    // Overwriting lockReason with the supersede reason would destroy the record of what the
    // lock ever certified.
    expect(previous.lockReason).toBe("passed native-media QA in v8");
    expect(previous.supersedeReason).toBe("band repair");
  });

  it("refuses self-supersession", () => {
    const a = shotArtifact("S09");
    const r = supersedeArtifact(a, a, { at: AT });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("cannot supersede itself");
  });

  it("refuses cross-project supersession", () => {
    // A change in one project must not be able to retire another project's approved output.
    const r = supersedeArtifact(
      shotArtifact("S09"),
      shotArtifact("S09", { artifactId: "S09-a2", projectId: "p2" }),
      { at: AT },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("cross-project");
  });

  it("refuses cross-shot supersession", () => {
    // Otherwise the timeline silently acquires the wrong footage under S09's lineage, and the
    // failure only shows up later as a wrong cut.
    const r = supersedeArtifact(
      shotArtifact("S09"),
      shotArtifact("S11", { artifactId: "S11-a2" }),
      { at: AT },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("cross-shot");
  });

  it("refuses to supersede an already-superseded artifact", () => {
    const { previous } = expectOk(
      supersedeArtifact(shotArtifact("S09"), shotArtifact("S09", { artifactId: "S09-a2" }), {
        at: AT,
      }),
    );
    const again = supersedeArtifact(previous, shotArtifact("S09", { artifactId: "S09-a3" }), {
      at: AT,
    });
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toContain("already superseded");
  });

  it("never reuses a superseded artifact, even with nothing changed", () => {
    const { previous } = expectOk(
      supersedeArtifact(shotArtifact("S09"), shotArtifact("S09", { artifactId: "S09-a2" }), {
        at: AT,
      }),
    );
    expect(planArtifact(previous, worldOf([previous])).action).toBe("RERENDER");
  });
});

describe("applyQaVerdict", () => {
  it("moves an un-pinned artifact to the state the verdict implies", () => {
    const draft = shotArtifact("S06", { state: "DRAFT", qa: null });
    expect(applyQaVerdict(draft, { verdict: "PASS" }).state).toBe("PASS");
    expect(applyQaVerdict(draft, { verdict: "REPAIR_REQUIRED" }).state).toBe("REPAIR_REQUIRED");
    expect(applyQaVerdict(draft, { verdict: "HUMAN_REVIEW_REQUIRED" }).state).toBe("QA_PENDING");
  });

  it("does not silently unlock a LOCKED artifact on a new verdict", () => {
    const locked = shotArtifact("S06");
    const after = applyQaVerdict(locked, { verdict: "REPAIR_REQUIRED" });
    expect(after.state).toBe("LOCKED"); // unpinning is a supersession decision
    expect(after.qa?.verdict).toBe("REPAIR_REQUIRED"); // but the finding is recorded
  });
});

// ---------------------------------------------------------------------------
// Dependency invalidation — the five scenarios from the brief
// ---------------------------------------------------------------------------

describe("dependency invalidation", () => {
  const shots = ["S06", "S08", "S09", "S11", "S12"].map((s) => shotArtifact(s));

  it("reuses every locked artifact when nothing changed", () => {
    const plan = planRender(shots, worldOf(shots));
    expect(plan.affected).toHaveLength(0);
    expect(plan.preserved).toHaveLength(5);
    expect(plan.entries.every((e) => e.action === "REUSE_LOCKED")).toBe(true);
  });

  it("changing S08 does NOT unlock S06", () => {
    const world = worldOf(shots, {
      "source_asset:S08:frames": "src-S08-v2",
      "prompt_config:S08": "prompt-S08-v2",
    });
    const plan = planRender(shots, world);

    expect(plan.byAction.RERENDER.map((e) => e.shotId)).toEqual(["S08"]);
    // Everything else is untouched — the point of the exercise.
    expect(plan.preserved.map((e) => e.shotId)).toEqual(["S06", "S09", "S11", "S12"]);
    expect(plan.affected).toHaveLength(1);
  });

  it("changing the canonical hook Look identifies every shot that depends on it", () => {
    const brollOnOtherLook = shotArtifact("S14", {
      dependencies: [
        { kind: "source_asset", id: "S14:frames", fingerprint: "src-S14-v1" },
        { kind: "look", id: "look-prehook", fingerprint: "look-prehook-v1" },
      ],
    });
    const all = [...shots, brollOnOtherLook];
    const plan = planRender(all, worldOf(all, { "look:look-hook": "look-hook-v2" }));

    // All five hook shots, and only those — S14 is on a different Look.
    expect(plan.byAction.RERENDER.map((e) => e.shotId)).toEqual([
      "S06",
      "S08",
      "S09",
      "S11",
      "S12",
    ]);
    expect(plan.preserved.map((e) => e.shotId)).toEqual(["S14"]);
  });

  it("changing only B-roll S14 does NOT touch the wardrobe shots", () => {
    const s14 = shotArtifact("S14", {
      dependencies: [{ kind: "source_asset", id: "S14:frames", fingerprint: "src-S14-v1" }],
    });
    const all = [...shots, s14];
    const plan = planRender(all, worldOf(all, { "source_asset:S14:frames": "src-S14-v2" }));

    expect(plan.affected.map((e) => e.shotId)).toEqual(["S14"]);
    expect(plan.preserved).toHaveLength(5);
  });

  it("a new deterministic wordmark version REPAIRS rather than re-renders", () => {
    const plan = planRender(
      shots,
      worldOf(shots, { "deterministic_process:wordmark_track": "wordmark-v2" }),
    );

    // The generative output is still valid — only the deterministic stage moved. This is
    // the difference between re-running a script and paying for eight shots again.
    expect(plan.byAction.REPAIR.map((e) => e.shotId)).toEqual(["S06", "S08", "S09", "S11", "S12"]);
    expect(plan.byAction.RERENDER).toHaveLength(0);
    expect(plan.entries[0].rationale.join(" ")).toContain("wordmark-v1 → wordmark-v2");
  });

  it("a song/performance sync change REPAIRS the items that depend on that mapping", () => {
    const otherSection = shotArtifact("S20", {
      dependencies: [
        { kind: "source_asset", id: "S20:frames", fingerprint: "src-S20-v1" },
        { kind: "timeline_sync", id: "section-bars47-60", fingerprint: "sync-other-v1" },
      ],
    });
    const all = [...shots, otherSection];
    const plan = planRender(all, worldOf(all, { "timeline_sync:section-bars24-46": "sync-v2" }));

    expect(plan.byAction.REPAIR.map((e) => e.shotId)).toEqual(["S06", "S08", "S09", "S11", "S12"]);
    expect(plan.preserved.map((e) => e.shotId)).toEqual(["S20"]);
  });

  it("a treatment change asks for REVIEW, not for pixels", () => {
    const plan = planRender(shots, worldOf(shots, { "treatment:ysl-section": "treatment-v2" }));
    expect(plan.byAction.REVIEW).toHaveLength(5);
    expect(plan.byAction.RERENDER).toHaveLength(0);
    expect(plan.byAction.REPAIR).toHaveLength(0);
  });

  it("REVIEW of a LOCKED artifact does not require supersession", () => {
    // Re-reading a locked output against a moved standard produces a verdict, not a new
    // render. The lock survives the reading. Treating REVIEW as an unlock made every
    // treatment or QA-rubric edit look like a re-render round.
    for (const kind of ["treatment:ysl-section", "qa_rubric:na"] as const) {
      const plan = planRender(shots, worldOf(shots, { [kind]: "moved" }));
      if (kind === "treatment:ysl-section") {
        expect(plan.byAction.REVIEW).toHaveLength(5);
        expect(plan.requiresUnlock).toHaveLength(0);
        expect(plan.entries[0].rationale.join(" ")).toContain("the lock stands");
      }
    }
  });

  it("REPAIR and RERENDER of a LOCKED artifact still require supersession", () => {
    const repair = planRender(
      shots,
      worldOf(shots, { "deterministic_process:wordmark_track": "wordmark-v2" }),
    );
    expect(repair.byAction.REPAIR).toHaveLength(5);
    expect(repair.requiresUnlock).toHaveLength(5);

    const rerender = planRender(shots, worldOf(shots, { "look:look-hook": "look-hook-v2" }));
    expect(rerender.requiresUnlock).toHaveLength(5);
  });

  it("reports PASS reuse and LOCKED reuse as different claims", () => {
    // Both mean "do not regenerate", but only one had someone commit to it against a gate.
    const mixed = [
      shotArtifact("S06"),
      shotArtifact("S08", { state: "PASS", lockReason: null, lockedAt: null }),
    ];
    const plan = planRender(mixed, worldOf(mixed));
    expect(plan.byAction.REUSE_LOCKED.map((e) => e.shotId)).toEqual(["S06"]);
    expect(plan.byAction.REUSE_PASS.map((e) => e.shotId)).toEqual(["S08"]);
    // Both still count as preserved, and neither is "affected".
    expect(plan.preserved).toHaveLength(2);
    expect(plan.affected).toHaveLength(0);
    expect(plan.byAction.REUSE_PASS[0].rationale.join(" ")).toContain("not pinned");
  });

  it("takes the most severe consequence when several dependencies move at once", () => {
    const plan = planRender(
      shots,
      worldOf(shots, {
        "treatment:ysl-section": "treatment-v2", // REVIEW
        "deterministic_process:wordmark_track": "wordmark-v2", // REPAIR
        "look:look-hook": "look-hook-v2", // RERENDER
      }),
    );
    expect(plan.entries.every((e) => e.action === "RERENDER")).toBe(true);
    // All three reasons survive in the rationale — the plan explains itself, rather than
    // reporting only the one that won. (The 4th line is the LOCKED authorization note.)
    expect(plan.entries[0].changes).toHaveLength(3);
    const why = plan.entries[0].rationale.join(" | ");
    expect(why).toContain("treatment:ysl-section");
    expect(why).toContain("deterministic_process:wordmark_track");
    expect(why).toContain("look:look-hook");
    expect(why).toContain("needs supersession authorization");
  });

  it("flags when an action would discard a LOCKED artifact", () => {
    const plan = planRender(shots, worldOf(shots, { "look:look-hook": "look-hook-v2" }));
    expect(plan.requiresUnlock).toHaveLength(5);
    expect(plan.entries[0].rationale.join(" ")).toContain("needs supersession authorization");

    // An un-pinned PASS artifact needs no authorization to replace.
    const loose = [shotArtifact("S06", { state: "PASS", lockReason: null })];
    expect(
      planRender(loose, worldOf(loose, { "look:look-hook": "look-hook-v2" })).requiresUnlock,
    ).toHaveLength(0);
  });
});

describe("unresolved dependencies fail closed", () => {
  it("asks for REVIEW when a dependency is absent from the index", () => {
    const a = shotArtifact("S06");
    const world = worldOf([a]);
    delete world["look:look-hook"];

    const entry = planArtifact(a, world);
    // We cannot prove it is unchanged, so it does not get to count as unchanged.
    expect(entry.action).toBe("REVIEW");
    expect(entry.changes[0].kind).toBe("unresolved");
    expect(entry.rationale.join(" ")).toContain("cannot prove it is unchanged");
  });

  it("escalates unresolved to RERENDER under strict planning", () => {
    const a = shotArtifact("S06");
    const world = worldOf([a]);
    delete world["look:look-hook"];
    expect(planArtifact(a, world, { unresolved: "rerender" }).action).toBe("RERENDER");
  });

  it("does not mistake an empty-string fingerprint for a missing one", () => {
    const a = shotArtifact("S06");
    const entry = planArtifact(a, worldOf([a], { "look:look-hook": "" }));
    expect(entry.changes[0].kind).toBe("changed");
    expect(entry.action).toBe("RERENDER");
  });
});

describe("state baselines", () => {
  it("drives the action from state when nothing changed", () => {
    const world = worldOf([shotArtifact("S06")]);
    const at = (state: ArtifactRecord["state"]) =>
      planArtifact(shotArtifact("S06", { state }), world).action;
    expect(at("LOCKED")).toBe("REUSE_LOCKED");
    expect(at("PASS")).toBe("REUSE_PASS"); // reusable, but never pinned — do not overstate it
    expect(at("QA_PENDING")).toBe("REVIEW");
    expect(at("DRAFT")).toBe("REVIEW");
    expect(at("REPAIR_REQUIRED")).toBe("REPAIR");
    expect(at("SUPERSEDED")).toBe("RERENDER");
  });

  it("never downgrades a state baseline because dependencies are clean", () => {
    const a = shotArtifact("S06", { state: "REPAIR_REQUIRED" });
    // A clean dependency set does not turn a known defect into a reuse.
    expect(planArtifact(a, worldOf([a])).action).toBe("REPAIR");
  });
});

describe("policy table", () => {
  it("classifies every dependency kind", () => {
    // A new kind without a policy would silently resolve to undefined and plan nothing.
    for (const kind of Object.keys(INVALIDATION_POLICY)) {
      expect(INVALIDATION_POLICY[kind as keyof typeof INVALIDATION_POLICY]).toBeTruthy();
    }
    expect(Object.keys(INVALIDATION_POLICY)).toHaveLength(9);
  });

  it("reports only the dependencies that actually moved", () => {
    const a = shotArtifact("S06");
    expect(diffDependencies(a, worldOf([a]))).toEqual([]);
    const one = diffDependencies(a, worldOf([a], { "look:look-hook": "look-hook-v2" }));
    expect(one).toHaveLength(1);
    expect(one[0].dependency.kind).toBe("look");
    expect(one[0].currentFingerprint).toBe("look-hook-v2");
  });
});
