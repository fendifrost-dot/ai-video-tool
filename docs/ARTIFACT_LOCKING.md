# ARTIFACT_LOCKING.md — artifact state, dependency invalidation, render planning

> Status: **implemented as a pure layer, not yet wired to a store.** No migration, no
> schema change, no deploy. See §6 for the DB table this would eventually want and why it
> is deliberately not in this change.
>
> Change class: **C** (Rendering / Timelines) per
> [`ARCHITECTURE_REVIEW.md`](ARCHITECTURE_REVIEW.md) — three sign-offs before merge.
>
> Written: 2026-09-23. Module: `src/lib/production/artifactLock.ts`.

---

## 1. The principle

**Passing outputs should not be casually regenerated.**

A shot that has passed QA represents real spend and real human judgement. Today the only
thing preserving it is that nobody re-ran the command. So when anything changes — a Look
edit, a new tracker version, a sync fix — the blunt response is to re-render the section,
which pays again for shots that were already right. The v6 round re-rolled all 8
performance slots; only some of them needed it.

The fix is not "render less". It is to make **"does this output still stand?"** a question
you can answer by comparing recorded inputs, rather than by memory or by re-rendering to
find out.

---

## 2. What was already there

This does not invent a vocabulary where AVT has one:

- `PASS` / `REPAIR_REQUIRED` / `HUMAN_REVIEW_REQUIRED` are Astra's own final verdicts
  (`src/lib/qa/astraVisualReview.ts`).
- `draft | approved | locked | archived` is the existing status ladder on `artist_looks`
  and the generations tables.
- `shots.locked_look_id` is the **direct ancestor of this idea** — a shot pinning one Look.
  Generalized here to "an artifact pins every input it was made from".
- `renders_vN.json` is the de-facto artifact record the YSL lane already writes: shot →
  output file. It has no inputs recorded, which is exactly the gap.

---

## 3. States

| State | Meaning |
|---|---|
| `DRAFT` | Produced, not yet submitted to QA. |
| `QA_PENDING` | Submitted; verdict outstanding. |
| `REPAIR_REQUIRED` | QA found a defect a repair pass should address. |
| `PASS` | Passed QA. Reusable, not pinned. |
| `LOCKED` | Passed the gates for its stage and is **pinned**. |
| `SUPERSEDED` | Replaced. Kept for provenance, never reused. |

**LOCKED** means: *this exact output has passed the required gates for its production
stage and is preserved unless a dependency it declares changes, or an authorized repair
supersedes it.*

`lockArtifact()` refuses to lock:

- without a `PASS` verdict — a lock asserts "this cleared its gates", and downstream code
  trusts it enough to skip a render;
- without a reason — no anonymous locks;
- when a stage's `requiredGates` are missing (e.g. `native_media_qa`);
- **with no declared dependencies** — a lock with no inputs can never be invalidated, so
  it would silently survive every change to the project. That is worse than no lock.

There is **no unlock-in-place**. A locked artifact leaves that state only via
`supersedeArtifact()`, which records `supersededBy` / `supersededAt`, so what was locked
and what replaced it both survive. Re-running QA on a locked artifact records the new
verdict but does **not** flip the state — unpinning is a supersession decision, not a side
effect of a review.

---

## 4. Dependencies and invalidation

An artifact declares what it was made from:

```ts
{ kind: "look", id: "look-hook", fingerprint: "look-hook-v1" }
```

The **kind** decides what a change means; the **id** scopes it. Scoping by id is why
"changing S08 does not unlock S06" needs no special case at all: S06's `source_asset`
dependency has a different id, so S08's new fingerprint is not in S06's dependency set.

`fingerprint` is opaque — equality is the only operation performed on it — so a content
hash, a version string, or a migration id all work.

### The policy table

| Dependency kind | Change ⇒ | Why |
|---|---|---|
| `source_asset` | `RERENDER` | Generative input moved. |
| `shot_spec` | `RERENDER` | " |
| `look` | `RERENDER` | " |
| `provider_model` | `RERENDER` | " |
| `prompt_config` | `RERENDER` | " |
| `deterministic_process` | **`REPAIR`** | The generative output is still valid; only a deterministic stage downstream moved. Re-run that stage on the existing render. |
| `timeline_sync` | **`REPAIR`** | Placement/trim changed, pixels did not. Re-cut, don't regenerate. |
| `treatment` | `REVIEW` | The standard the shot is judged against moved. The verdict is stale, not the artifact. |
| `qa_rubric` | `REVIEW` | " |

`REPAIR` vs `RERENDER` is where the money is. A new wordmark tracker version is a script
re-run, not eight paid shots.

### Required fields recorded per artifact

`artifactId`, `shotId`, `projectId`, `state`, `outputRef`, `dependencies[]` (covering
treatment version, ShotSpec hash, source asset + range, Look version, provider/model,
prompt/config hash, deterministic-process versions, timeline sync), `qa` (verdict, gates,
Astra `reviewRef`), `lockReason`, `lockedAt`, `supersededBy`, `supersededAt`, and a free
`meta` block for model version, seed, transfer mode and cost.

---

## 5. Render planning

```ts
planRender(artifacts, currentFingerprintIndex) // → { entries, affected, preserved, byAction, requiresUnlock }
```

Per artifact: take the baseline implied by its state, then take the **strongest**
consequence across every changed dependency.

```
REUSE_LOCKED  <  REVIEW  <  REPAIR  <  RERENDER
```

State baselines: `LOCKED`/`PASS` → `REUSE_LOCKED`; `DRAFT`/`QA_PENDING` → `REVIEW`;
`REPAIR_REQUIRED` → `REPAIR`; `SUPERSEDED` → `RERENDER`. A clean dependency set never
downgrades a baseline — a known defect does not become a reuse because nothing moved.

Every entry carries a `rationale`, listing **all** the reasons, not only the one that won,
so a plan explains itself. `requiresUnlock` flags any action that would supersede a LOCKED
artifact, so those get authorized rather than executed silently.

**Unresolved dependencies fail closed.** A dependency absent from the current fingerprint
index cannot be *proven* unchanged, so it does not get to count as unchanged: default
`REVIEW`, or `RERENDER` under `{ unresolved: "rerender" }`. An empty-string fingerprint is
a change, not a missing entry.

`planRender` decides; it never renders, spends, or mutates. Executing a plan stays a
separate, authorized step. This is not a workflow engine — these are pure functions over
records, and the store is deliberately unspecified.

### The brief's scenarios, as tests

| Scenario | Result |
|---|---|
| Nothing changed | 5/5 `REUSE_LOCKED` |
| S08 changes | S08 `RERENDER`; S06/S09/S11/S12 preserved |
| Canonical hook Look changes | all 5 hook shots `RERENDER`; a B-roll shot on another Look preserved |
| B-roll S14 changes | S14 only; all wardrobe shots preserved |
| Wordmark algorithm version changes | 5 × `REPAIR`, **0 × `RERENDER`** |
| Song/performance sync changes | the section's shots `REPAIR`; another section preserved |
| Treatment changes | 5 × `REVIEW`, no pixels touched |

---

## 6. Storage — why there is no migration here

The pure layer works today on `renders_vN.json`-shaped data. A DB table would be the right
home eventually, but it is **not** in this change, for three reasons:

1. AVT's schema is Lovable-managed; SQL runs in Lovable's SQL editor, and this lane cannot
   apply or verify a migration.
2. Dropping a file into `supabase/migrations/` risks it being applied while the primary
   agent is mid-production.
3. Nothing needs it yet — no behavior in this PR reads or writes a table.

The additive shape it would want, for review, not application:

```sql
-- PROPOSED, NOT APPLIED. Additive; no existing table or column is modified.
create table if not exists shot_artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  shot_id uuid not null references shots(id) on delete cascade,
  project_id uuid not null references video_projects(id) on delete cascade,
  state text not null default 'DRAFT'
    check (state in ('DRAFT','QA_PENDING','REPAIR_REQUIRED','PASS','LOCKED','SUPERSEDED')),
  output_ref text,
  dependencies jsonb not null default '[]'::jsonb,  -- DependencyRef[]
  qa jsonb,                                          -- verdict, gates, reviewRef
  lock_reason text,
  locked_at timestamptz,
  superseded_by uuid references shot_artifacts(artifact_id),
  superseded_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- a lock must be attributable and invalidatable
  constraint locked_has_reason check (state <> 'LOCKED' or lock_reason is not null),
  constraint locked_has_deps   check (state <> 'LOCKED' or jsonb_array_length(dependencies) > 0)
);
create index if not exists shot_artifacts_shot_idx on shot_artifacts(shot_id);
create index if not exists shot_artifacts_project_state_idx on shot_artifacts(project_id, state);
-- RLS mirrors `shots`: owner-scoped. Needs the RLS integration test ARCHITECTURE_REVIEW.md
-- requires for Class C before it is applied.
```

`shots.locked_look_id` stays as-is; it is the single-Look special case this generalizes and
nothing here replaces it.

---

## 7. Adoption — smallest useful first step

Recording dependencies is what unlocks everything else, and it is cheap:

1. When the YSL lane writes `renders_vN.json`, also write the artifact's `dependencies[]`
   (Look version, ShotSpec hash, provider/model, prompt hash, tracker version, sync id).
2. `lockArtifact()` each shot that passes native-media QA, with `requiredGates`.
3. Before the next round, run `planRender()` and act on `affected` only.

Step 1 alone is worth doing even if nothing else is adopted: without recorded inputs,
"which shots does this change actually affect?" has no answer but *all of them*.

## 8. Conflict risk

New files only (`src/lib/production/*`). Nothing existing is imported, modified, or
re-exported; no production path calls this yet.
