/**
 * Artifact locking — "passing outputs should not be casually regenerated."
 *
 * WHY
 * ---
 * A shot that has passed QA represents real spend and real human judgement. Today the
 * only thing preserving it is that nobody re-ran the command. Meanwhile a change
 * anywhere in the project — a Look edit, a new tracker version, a sync fix — invites
 * the blunt response of re-rendering the section, which burns money and re-rolls shots
 * that were already right. (v6 re-rolled all 8 performance slots; only some needed it.)
 *
 * This module gives an artifact a STATE and a set of DEPENDENCY FINGERPRINTS, so the
 * question "does this output still stand?" is answered by comparing fingerprints
 * instead of by memory or by re-rendering to find out.
 *
 * WHAT IT REUSES
 * --------------
 * Nothing here invents a new vocabulary where AVT has one:
 *   • `PASS` / `REPAIR_REQUIRED` are Astra's own verdicts (`src/lib/qa/astraVisualReview.ts`).
 *   • `DRAFT` / `LOCKED` mirror the `draft|approved|locked|archived` status ladder already
 *     used by `artist_looks` and the generations tables.
 *   • `shots.locked_look_id` is the existing single-purpose ancestor of this idea — a shot
 *     pinning one Look. Generalized here to "an artifact pins every input it was made from".
 *
 * WHAT IT IS NOT
 * --------------
 * Not a workflow engine, and not a scheduler. These are pure functions over records.
 * The store is deliberately unspecified: they work on `renders_vN.json`-shaped data
 * today and on a DB table later, without either being a precondition for the other.
 */

/** Astra's final verdicts, re-declared as the QA input this module accepts. */
export const QA_VERDICTS = ["PASS", "REPAIR_REQUIRED", "HUMAN_REVIEW_REQUIRED"] as const;
export type QaVerdict = (typeof QA_VERDICTS)[number];

/**
 * Artifact lifecycle.
 *
 *   DRAFT           produced, not yet submitted to QA
 *   QA_PENDING      submitted, verdict outstanding
 *   REPAIR_REQUIRED QA found a defect that a repair pass should address
 *   PASS            QA passed; reusable, but not pinned
 *   LOCKED          passed the gates for its stage and is pinned: preserve unless a
 *                   dependency it declares changes, or an authorized repair supersedes it
 *   SUPERSEDED      replaced by a newer artifact; kept for provenance, never reused
 */
export const ARTIFACT_STATES = [
  "DRAFT",
  "QA_PENDING",
  "REPAIR_REQUIRED",
  "PASS",
  "LOCKED",
  "SUPERSEDED",
] as const;
export type ArtifactState = (typeof ARTIFACT_STATES)[number];

/**
 * What an artifact was made from.
 *
 * The KIND decides what a change to it means (see `INVALIDATION_POLICY`); the ID scopes
 * it so unrelated work cannot collide. Scoping by id is the whole reason "changing S08
 * does not unlock S06" falls out for free rather than needing a special case: S06's
 * `source_asset` dependency has a different id from S08's, so S08's new fingerprint is
 * not in S06's dependency set at all.
 */
export const DEPENDENCY_KINDS = [
  /** Original footage plus the frame/time range used. */
  "source_asset",
  /** The ShotSpec that drove the render. */
  "shot_spec",
  /** Treatment version — creative framing the shot is judged against. */
  "treatment",
  /** Look / wardrobe realisation, including the approved anchor. */
  "look",
  /** Provider + model + operation that generated the pixels. */
  "provider_model",
  /** Prompt text and generation config, hashed. */
  "prompt_config",
  /** A deterministic post-process and its version (wordmark track, composite, propagation). */
  "deterministic_process",
  /** Song/performance sync mapping that places the shot on the timeline. */
  "timeline_sync",
  /** The QA rubric / review brief the verdict was issued under. */
  "qa_rubric",
] as const;
export type DependencyKind = (typeof DEPENDENCY_KINDS)[number];

export type DependencyRef = {
  kind: DependencyKind;
  /** Scope within the kind: a shot id, look id, process name, asset id + range. */
  id: string;
  /** Opaque content hash or version string. Equality is the only operation performed on it. */
  fingerprint: string;
};

export type QaResult = {
  verdict: QaVerdict;
  /** Astra review id / file reference, or a local QA artifact path. */
  reviewRef?: string | null;
  /** Named gates that were evaluated, e.g. "native_media_qa", "wordmark_track_qa". */
  gates?: string[];
  at?: string | null;
};

export type ArtifactRecord = {
  artifactId: string;
  shotId: string;
  projectId: string;
  state: ArtifactState;

  /** Where the output lives. */
  outputRef?: string | null;

  /** Everything this artifact was made from. */
  dependencies: DependencyRef[];

  qa?: QaResult | null;

  // -- lock bookkeeping ----------------------------------------------------
  /** Why it is pinned — required for LOCKED so a lock is never anonymous. */
  lockReason?: string | null;
  lockedAt?: string | null;
  /** artifactId of the replacement, set on SUPERSEDED. */
  supersededBy?: string | null;
  supersededAt?: string | null;
  /** Why it was retired. Kept separate from lockReason, which says why it was pinned. */
  supersedeReason?: string | null;

  createdAt?: string | null;
  /** Free-form provenance: model version, seed, transfer mode, cost. */
  meta?: Record<string, unknown>;
};

/** Index of the CURRENT fingerprint for every dependency the project knows about. */
export type FingerprintIndex = Record<string, string>;

export function dependencyKey(ref: Pick<DependencyRef, "kind" | "id">): string {
  return `${ref.kind}:${ref.id}`;
}

export function buildFingerprintIndex(refs: DependencyRef[]): FingerprintIndex {
  const index: FingerprintIndex = {};
  for (const r of refs) index[dependencyKey(r)] = r.fingerprint;
  return index;
}

// ---------------------------------------------------------------------------
// Locking
// ---------------------------------------------------------------------------

export type LockDecision = { ok: true; artifact: ArtifactRecord } | { ok: false; reason: string };

/**
 * Lock an artifact.
 *
 * Refuses unless QA actually passed. A lock asserts "this cleared its gates", so locking
 * an un-reviewed artifact would make the state mean nothing — and the whole point of the
 * state is that downstream code trusts it enough to skip a re-render.
 *
 * `requiredGates` lets a production stage demand specific evidence (a native-media QA,
 * a tracker QA sheet) rather than any passing verdict at all.
 */
export function lockArtifact(
  artifact: ArtifactRecord,
  opts: { reason: string; at: string; requiredGates?: string[] },
): LockDecision {
  if (artifact.state === "SUPERSEDED") {
    return { ok: false, reason: "cannot lock a SUPERSEDED artifact" };
  }
  if (artifact.state === "LOCKED") {
    return { ok: true, artifact };
  }
  if (artifact.qa?.verdict !== "PASS") {
    return {
      ok: false,
      reason: `cannot lock without a PASS verdict (current: ${artifact.qa?.verdict ?? "no QA"})`,
    };
  }
  if (!opts.reason?.trim()) {
    return { ok: false, reason: "a lock must record why it was locked" };
  }
  const missing = (opts.requiredGates ?? []).filter((g) => !(artifact.qa?.gates ?? []).includes(g));
  if (missing.length > 0) {
    return { ok: false, reason: `missing required QA gate(s): ${missing.join(", ")}` };
  }
  if (artifact.dependencies.length === 0) {
    // A lock with no declared inputs can never be invalidated, which is worse than no
    // lock at all — it would silently survive every change to the project.
    return { ok: false, reason: "cannot lock an artifact that declares no dependencies" };
  }
  return {
    ok: true,
    artifact: { ...artifact, state: "LOCKED", lockReason: opts.reason, lockedAt: opts.at },
  };
}

/**
 * Replace a locked/passing artifact with a new one.
 *
 * Supersession is the ONLY way a LOCKED artifact stops being authoritative — there is no
 * unlock-in-place, so the record of what was locked, and what replaced it, always survives.
 */
export type SupersessionResult =
  | { ok: true; previous: ArtifactRecord; replacement: ArtifactRecord }
  | { ok: false; reason: string };

export function supersedeArtifact(
  previous: ArtifactRecord,
  replacement: ArtifactRecord,
  opts: { at: string; reason?: string },
): SupersessionResult {
  // Lineage guards. Each of these would corrupt the record in a way that is hard to see
  // afterwards and impossible to undo, so they are refusals rather than warnings.

  // Self-supersession: an artifact pointing at itself is an unresolvable cycle, and it would
  // read as "replaced" while nothing replaced it.
  if (previous.artifactId === replacement.artifactId) {
    return { ok: false, reason: "an artifact cannot supersede itself" };
  }
  // Cross-project: supersession is a statement about one project's history. Crossing projects
  // would let a change in one project retire another project's approved output.
  if (previous.projectId !== replacement.projectId) {
    return {
      ok: false,
      reason: `cross-project supersession refused: ${previous.projectId} → ${replacement.projectId}`,
    };
  }
  // Cross-shot: the replacement must depict the same shot. Otherwise the timeline silently
  // acquires the wrong footage under the old shot's lineage — the failure would show up as a
  // wrong cut, long after the swap.
  if (previous.shotId !== replacement.shotId) {
    return {
      ok: false,
      reason: `cross-shot supersession refused: ${previous.shotId} → ${replacement.shotId}`,
    };
  }
  if (previous.state === "SUPERSEDED") {
    return {
      ok: false,
      reason: `already superseded by ${previous.supersededBy ?? "an earlier replacement"}`,
    };
  }

  return {
    ok: true,
    previous: {
      ...previous,
      state: "SUPERSEDED",
      supersededBy: replacement.artifactId,
      supersededAt: opts.at,
      // Provenance: the original lock reason is preserved. `supersedeReason` records why it was
      // replaced, so "why was this locked" and "why was it retired" stay separate questions.
      lockReason: previous.lockReason ?? null,
      supersedeReason: opts.reason ?? null,
    },
    replacement,
  };
}

// ---------------------------------------------------------------------------
// Dependency invalidation
// ---------------------------------------------------------------------------

/**
 * Plan actions, ordered weakest → strongest. `planRank` makes "take the most severe
 * consequence across all changed dependencies" a one-line reduction.
 */
export const PLAN_ACTIONS = ["REUSE_LOCKED", "REUSE_PASS", "REVIEW", "REPAIR", "RERENDER"] as const;
export type PlanAction = (typeof PLAN_ACTIONS)[number];

/**
 * Both reuse actions mean "do not regenerate", but they are not the same claim and the plan
 * must not blur them: REUSE_LOCKED is an output someone pinned against a stage's gates;
 * REUSE_PASS only passed QA and nobody committed to it. Reporting a PASS reuse as "LOCKED"
 * would overstate how much review the output has actually had.
 */
export function isReuse(action: PlanAction): boolean {
  return action === "REUSE_LOCKED" || action === "REUSE_PASS";
}

export function planRank(action: PlanAction): number {
  return PLAN_ACTIONS.indexOf(action);
}

function strongest(a: PlanAction, b: PlanAction): PlanAction {
  return planRank(a) >= planRank(b) ? a : b;
}

/**
 * What a change to each dependency kind costs.
 *
 * This table is the core judgement of the module, and the reason the answer is
 * "repair the smallest affected subgraph" rather than "re-render everything":
 *
 *   RERENDER — the generative inputs changed, so the pixels are no longer the output of
 *              the stated inputs. Nothing short of generating again can fix it.
 *   REPAIR   — the generative output is still valid; a deterministic stage downstream of
 *              it is not. Re-run that stage on the existing render. This is the wordmark
 *              case: a new tracker version does not require paying for the shot again.
 *   REVIEW   — the pixels are untouched but the standard they are judged against moved.
 *              A human/Astra verdict is what is stale, not the artifact.
 */
export const INVALIDATION_POLICY: Record<DependencyKind, PlanAction> = {
  source_asset: "RERENDER",
  shot_spec: "RERENDER",
  look: "RERENDER",
  provider_model: "RERENDER",
  prompt_config: "RERENDER",
  deterministic_process: "REPAIR",
  timeline_sync: "REPAIR",
  treatment: "REVIEW",
  qa_rubric: "REVIEW",
};

/** Baseline action implied by the artifact's own state, before dependencies are considered. */
export const STATE_BASELINE: Record<ArtifactState, PlanAction> = {
  LOCKED: "REUSE_LOCKED",
  // Reusable, but say so honestly: PASS was never pinned to a stage's gates.
  PASS: "REUSE_PASS",
  QA_PENDING: "REVIEW",
  DRAFT: "REVIEW",
  REPAIR_REQUIRED: "REPAIR",
  // A superseded artifact is not a candidate for reuse; if something still points at it,
  // the replacement has to be produced.
  SUPERSEDED: "RERENDER",
};

export type DependencyChange = {
  dependency: DependencyRef;
  /** Current fingerprint, or null when the project no longer knows this dependency. */
  currentFingerprint: string | null;
  /** "changed" = fingerprints differ · "unresolved" = not present in the index. */
  kind: "changed" | "unresolved";
  effect: PlanAction;
};

export type RenderPlanEntry = {
  artifactId: string;
  shotId: string;
  action: PlanAction;
  /** True when the action would discard or replace a LOCKED artifact. */
  requiresUnlock: boolean;
  changes: DependencyChange[];
  /** One line per reason, in the order they were decided. */
  rationale: string[];
};

export type PlanOptions = {
  /**
   * How to treat a dependency the current index does not mention.
   *   "review" (default) — we cannot PROVE it is unchanged, so ask for a look.
   *   "rerender"         — treat unprovable as changed. For stages where a silent
   *                        mismatch is more expensive than a re-render.
   */
  unresolved?: "review" | "rerender";
};

/**
 * Compare one artifact's recorded dependencies against the project's current fingerprints.
 *
 * Only dependencies the artifact itself declares are examined, which is what keeps the
 * blast radius honest: a fingerprint index containing a changed S08 produces no changes
 * for S06's artifact, because S06 never declared S08.
 */
export function diffDependencies(
  artifact: ArtifactRecord,
  current: FingerprintIndex,
  options: PlanOptions = {},
): DependencyChange[] {
  const unresolvedEffect: PlanAction = options.unresolved === "rerender" ? "RERENDER" : "REVIEW";
  const changes: DependencyChange[] = [];
  for (const dep of artifact.dependencies) {
    const key = dependencyKey(dep);
    const now = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : null;
    if (now === null) {
      changes.push({
        dependency: dep,
        currentFingerprint: null,
        kind: "unresolved",
        effect: unresolvedEffect,
      });
    } else if (now !== dep.fingerprint) {
      changes.push({
        dependency: dep,
        currentFingerprint: now,
        kind: "changed",
        effect: INVALIDATION_POLICY[dep.kind],
      });
    }
  }
  return changes;
}

/** Decide what to do with a single artifact. */
export function planArtifact(
  artifact: ArtifactRecord,
  current: FingerprintIndex,
  options: PlanOptions = {},
): RenderPlanEntry {
  const changes = diffDependencies(artifact, current, options);
  const baseline = STATE_BASELINE[artifact.state];
  const rationale: string[] = [];

  let action = baseline;
  if (changes.length === 0) {
    rationale.push(
      artifact.state === "LOCKED"
        ? `LOCKED and no declared dependency changed — reuse (${artifact.lockReason ?? "no reason recorded"})`
        : artifact.state === "PASS"
          ? "PASS and no declared dependency changed — reusable, but not pinned to a stage's gates"
          : `state ${artifact.state} with no dependency change — ${baseline}`,
    );
  } else {
    for (const c of changes) {
      action = strongest(action, c.effect);
      rationale.push(
        c.kind === "unresolved"
          ? `${dependencyKey(c.dependency)} is not in the current fingerprint index — cannot prove it is unchanged → ${c.effect}`
          : `${dependencyKey(c.dependency)} changed (${c.dependency.fingerprint} → ${c.currentFingerprint}) → ${c.effect}`,
      );
    }
  }

  // Only actions that would REPLACE the pixels need a supersession decision. REVIEW does not:
  // re-reading a locked output against a moved standard produces a verdict, not a new render,
  // and the lock survives the reading. Treating REVIEW as an unlock made every treatment or
  // rubric edit look like a re-render round, which is exactly the over-reaction this module
  // exists to stop.
  const replacesPixels = action === "REPAIR" || action === "RERENDER";
  const requiresUnlock = artifact.state === "LOCKED" && replacesPixels;
  if (requiresUnlock) {
    rationale.push(
      `artifact is LOCKED — ${action} replaces it, so it needs supersession authorization`,
    );
  } else if (artifact.state === "LOCKED" && action === "REVIEW") {
    rationale.push("artifact is LOCKED — REVIEW re-reads it without replacing it; the lock stands");
  }

  return {
    artifactId: artifact.artifactId,
    shotId: artifact.shotId,
    action,
    requiresUnlock,
    changes,
    rationale,
  };
}

export type RenderPlan = {
  entries: RenderPlanEntry[];
  /** Artifacts to act on — everything that is not a straight reuse. */
  affected: RenderPlanEntry[];
  /** Artifacts preserved untouched. The number worth quoting before a re-render round. */
  preserved: RenderPlanEntry[];
  byAction: Record<PlanAction, RenderPlanEntry[]>;
  /** Entries that would supersede a LOCKED artifact. Review these before executing. */
  requiresUnlock: RenderPlanEntry[];
};

/**
 * Plan a whole set of artifacts against the project's current fingerprints.
 *
 * The output is a decision list, not an execution: nothing here renders, spends, or
 * mutates. Executing it stays a separate, authorized step.
 */
export function planRender(
  artifacts: ArtifactRecord[],
  current: FingerprintIndex,
  options: PlanOptions = {},
): RenderPlan {
  const entries = artifacts.map((a) => planArtifact(a, current, options));
  const byAction = PLAN_ACTIONS.reduce(
    (acc, a) => {
      acc[a] = entries.filter((e) => e.action === a);
      return acc;
    },
    {} as Record<PlanAction, RenderPlanEntry[]>,
  );

  return {
    entries,
    affected: entries.filter((e) => !isReuse(e.action)),
    preserved: entries.filter((e) => isReuse(e.action)),
    byAction,
    requiresUnlock: entries.filter((e) => e.requiresUnlock),
  };
}

/**
 * Apply a QA verdict, moving the artifact to the state the verdict implies.
 *
 * A verdict on a LOCKED artifact does not silently unlock it: re-reviewing something
 * that is pinned should surface as a supersession decision, not as a state flip.
 */
export function applyQaVerdict(artifact: ArtifactRecord, qa: QaResult): ArtifactRecord {
  const next: ArtifactState =
    qa.verdict === "PASS"
      ? "PASS"
      : qa.verdict === "REPAIR_REQUIRED"
        ? "REPAIR_REQUIRED"
        : "QA_PENDING";
  if (artifact.state === "LOCKED" || artifact.state === "SUPERSEDED") {
    return { ...artifact, qa };
  }
  return { ...artifact, qa, state: next };
}
