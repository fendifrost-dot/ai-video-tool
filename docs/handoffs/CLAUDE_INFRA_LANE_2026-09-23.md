# CLAUDE_INFRA_LANE — artifact locking, bake-off records, provider-boundary work

**Date:** 2026-09-23 · **Lane:** parallel infrastructure (agent 2) · **Spend:** **$0** — no provider call, no Astra call, no SQL.

> Kept separate from `CLAUDE_LATEST.md` on purpose: agent 1 rewrites that file every round
> (rev 23 → 26 in three days). Fold anything useful into the next rev.

---

## Shipped and merged

| PR | Repo | Commit | What |
|---|---|---|---|
| **CC #17** | fendi-control-center | `cfeb26e` | `video-providers-runway-video-edit` — Runway `/v1/video_to_video` behind Control Center |
| **AVT #161** | ai-video-tool | `8fd57f2` | AVT routes Runway through Control Center; reference safety ceiling scoped per model |
| **AVT #159** | ai-video-tool | *this branch* | artifact locking, dependency invalidation, render planning, bake-off records |

---

## 1 · Provider boundary (CC #17 + AVT #161)

AVT PR #160 shipped `runway-video-edit-proxy` calling Runway directly with an AVT-side
`RUNWAY_API_KEY` — a second provider-credential boundary. What it worked around was a
Control Center *capability* gap, not a missing key: `video-providers-runway-generate` covered
`text_to_video`/`image_to_video` only. **Nothing ever executed on the direct path** — that lane
was blocked on the key it never received.

Final path:

```
browser → runway-video-edit-proxy → proxy-provider-call → CC video-providers-runway-video-edit → Runway
```

`RUNWAY_API_KEY` is in Control Center only. AVT keeps ownership, Look resolution, reference and
keyframe preparation, cost authorization, the dry run, QA and artifact persistence. Control
Center owns the credential, the upstream call, retries, audit and the break-glass
(`RUNWAY_VIDEO_EDIT_DISABLED`). Polling reuses CC's existing `video-providers-job-status` /
`-job-result` — no polling logic was duplicated.

**Cost has two owners and two names**: `avtAuthorizedMaxCents` (AVT's authorization) vs
`ccProviderEstimateCents` (CC's independent estimate). CC refuses before calling if its estimate
exceeds the authorization. A missing authorization or duration is a refusal, not a default.

**Dry run stays $0** and returns AVT's plan even when Control Center is unreachable.

### Safety ceiling — fixed

A single global `SAFETY_MAX_REFERENCE_IMAGES = 30` made Seedance 2.5's **documented** 30 the
bound for every address, including xAI video edits whose limit has never been verified above 5.
The ceiling bounds an *unverified* number, so it now resolves where capability resolves —
provider + operation + model. Default back to **8**; `SAFETY_CEILINGS` carries the one scoped
exception `runway:video_to_video:seedance2_5 = 30`. No value any live lane resolves changed.

---

## 2 · Capability truth — one registry, not two (PR #159 reconciliation)

The first draft of this lane shipped its own provider→model→operation registry. **It has been
removed**, not reconciled. PR #160 landed `providerCapabilities.ts` keyed
`provider:operation[:model]` on `main`, and that is now the canonical source. Keeping a second
one would have recreated exactly the condition that caused the original "main says 3, deployed
says 5" incident.

What survived the removal, rebuilt on the canonical module:

- **`capabilityBakeoff.ts`** — `eligibleCandidates()` reads `getProviderCapability()`. It filters
  by capability **feasibility only**: a candidate is ineligible only when a capability fact
  positively rules it out; one whose facts are merely unknown stays *eligible-but-provisional*,
  because silently dropping unproven providers is how capability data becomes a ranking by
  omission. Caller order is preserved and carries no preference.
- **`BakeoffResult` / `BakeoffRound`** — the record shape a future harness writes: canonical test
  shot + ShotSpec hash + candidate → metrics, each with its `method` and `direction`, plus cost
  and a `reproduction` block. `BakeoffRound` has **no `winner` field**; picking one is a
  reviewer's decision recorded with its rationale, not a property of the round.

**No benchmark numbers were invented.** `metrics` is open because identity preservation,
canonical-Look adherence, temporal stability, treatment conformance and cost per useful second
have no agreed measurement yet, and freezing the taxonomy first would be backwards.

Still flagged, still not fixed: `recommendProviderForShotType()` in
`src/lib/providers/capabilities.ts` ranks via a hard-coded `preferredOrder`. It predates this
work, is live in the PromptBuilder UI, and replacing it needs benchmark evidence that does not
exist.

---

## 3 · Artifact locking

**Passing outputs should not be casually regenerated.** An artifact carries a state and the
dependency fingerprints it was made from, so "does this still stand?" is answered by comparing
recorded inputs instead of by re-rendering to find out. (v6 re-rolled all 8 performance slots;
only some needed it.)

States: `DRAFT / QA_PENDING / REPAIR_REQUIRED / PASS / LOCKED / SUPERSEDED` — reusing Astra's
verdicts and the existing `draft|approved|locked|archived` ladder. `shots.locked_look_id` is the
single-Look ancestor this generalizes.

Invalidation is per dependency **kind**, scoped by **id** — which is why "changing S08 does not
unlock S06" needs no special case:

| Change | Plans as |
|---|---|
| deterministic process (wordmark tracker version) | **REPAIR** — a script re-run, not 8 paid shots |
| timeline sync | **REPAIR** — placement moved, pixels didn't |
| treatment / QA rubric | **REVIEW** — the standard moved, not the artifact |
| source asset / ShotSpec / Look / provider-model / prompt | **RERENDER** |

### Semantics corrected this round

- **REVIEW of a LOCKED artifact does not require supersession.** Re-reading a locked output
  against a moved standard produces a verdict, not a new render; the lock survives. Only
  `REPAIR`/`RERENDER` set `requiresUnlock`. Previously every treatment or rubric edit looked like
  a re-render round.
- **PASS reuse and LOCKED reuse are reported as different claims** (`REUSE_PASS` vs
  `REUSE_LOCKED`). Both are preserved and neither is affected, but calling a PASS reuse "LOCKED"
  overstates the review it has had.
- **Supersession refuses four lineage corruptions**: self-supersession, cross-project,
  cross-shot, and re-superseding an already-superseded artifact.
- **Provenance is two facts**: `lockReason` (why pinned) survives untouched; `supersedeReason`
  records why retired.

`planRender()` decides; it never renders, spends or mutates.

---

## Tests

Reported by category per [`TEST_TAXONOMY.md`](../TEST_TAXONOMY.md). All new tests are **Unit** —
none installs a `vi.mock` / `vi.stubGlobal` boundary double.

| Suite | Result |
|---|---|
| Control Center `test:deno` | **134 passed / 0 failed** (+18 new) |
| Control Center `vitest` | 19 passed |
| AVT full suite | **see PR #159 body for the current count** — 0 provider-live, 0 real-media-benchmark, 0 deployment-smoke |

**The three zeros still stand.** Nothing here has touched a live provider, real media, or a
deployed environment.

---

## What Fendi / agent 1 must do

1. **Deploy Control Center `video-providers-runway-video-edit`** (merged, not deployed).
2. **Then redeploy AVT `proxy-provider-call` + `runway-video-edit-proxy`.** No SQL, no migration,
   **no new secret in either project**.
3. **Do NOT add `RUNWAY_API_KEY` to AVT.** The stale instructions saying otherwise have been
   corrected in the capability-check doc and in `CLAUDE_LATEST.md`'s Fendi row.
4. Optional, highest-value adoption: **record `dependencies[]` alongside `renders_vN.json`**
   (Look version, ShotSpec hash, provider/model, prompt hash, tracker version, sync id). Without
   recorded inputs, "which shots does this change affect?" has no answer except *all of them*.

Agent 1 owns the paid S08 Aleph/Omni experiment. This lane made no paid call and none is
authorized from here.

## Known, pre-existing, not fixed

- **CC CI `web` is red on `main`** — `prefer-const` at `src/integrations/supabase/previewAuthStorage.ts:38`.
  Not a one-word fix (`timer` is closed over by `finish()`), and outside the authorized CC
  exception. `deno-edge` passes.
- **`runway-video-edit-proxy/index.ts`** already had 99 prettier findings on `main`; its dense
  style was left rather than reformatted wholesale. New files are lint-clean.
- **`deno check`** reports 4 supabase-js generic errors in that same file on `main` and on the
  branch alike — untouched signing code.

## Storage

Still **design-only**. No migration in either repo. The proposed additive `shot_artifacts` DDL is
in [`ARTIFACT_LOCKING.md` §6](../ARTIFACT_LOCKING.md) for review; it needs the RLS integration
test Class C requires before it is applied. The pure layer works on `renders_vN.json`-shaped
records today.
