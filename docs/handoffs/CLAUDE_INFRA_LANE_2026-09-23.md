# CLAUDE_INFRA_LANE — provider capability registry + artifact locking

**Date:** 2026-09-23 · **Branch:** `claude/ai-video-tool-setup-trwpol` · **Base:** `main` @ `391b60f` (handoff rev 25)
**Lane:** parallel infrastructure. The primary agent owns YSL S08 mechanism testing, xAI/Runway Aleph capability investigation, current YSL production, and all paid experiments.
**Spend:** **$0.** No provider call, no Astra call, no redeploy, no SQL.

> This is a **separate** handoff on purpose. `docs/handoffs/CLAUDE_LATEST.md` is rewritten
> by the primary agent every round (rev 23 → 24 → 25 in three days); editing it from this
> lane would have produced a guaranteed conflict over a file with no code in it. Fold this
> into rev 26 when convenient.

---

## WHAT SHIPPED

### A · Provider capability registry — `supabase/functions/_shared/capabilityRegistry.ts`

Capability truth keyed **provider → model → operation**, replacing three incompatible
vendor-keyed sources (DB table, edge module, UI flag union) that could not express "this
model allows 3, that one allows 5".

- **Address resolution**: exact model id > longest trailing-`*` family pattern > `"*"`,
  merged **field by field**, so a model record that pins one limit inherits the rest.
- **Verification states**: `LIVE_VERIFIED` / `DOCUMENTED` / `INFERRED` / `UNKNOWN`, plus
  `STALE` **derived** from age (90/60/30-day TTLs). Documentation and a live 400 are never
  treated as the same evidence. An undated fact is STALE — freshness must be provable.
- **Per-field provenance**: every resolved field reports `status`, `effectiveStatus`,
  `verifiedAt`, `source`, `evidence`, which record it came from, and which layer. This is
  the direct answer to "main says 3, deployed says 5, nobody knows which model".
- **Overrides without redeploy**: `CAPABILITY_REGISTRY_JSON` edge secret. An override that
  does not declare its own status is recorded as `INFERRED` — it cannot inherit
  `LIVE_VERIFIED` from the fact it replaces — and the safety ceiling is applied after all
  merging.
- **Fail-closed enforcement**: `evaluateRequest()` returns `block` (known limit exceeded /
  feature declared `false`) vs `unverified` (unknown or stale — proceed, but recorded).
  Unknown addresses default to 1 reference image, so a multi-reference call blocks.
- **Expressible**: text/image/video/audio input, source-video editing, image/video/keyframe
  conditioning, max references, prompt chars, input+output duration, resolutions, native
  resolution, aspect ratios, FPS, audio output + source-audio preservation, alpha, output
  and intermediate (ProRes) formats, bit depth, HDR, async, pricing, provenance.

**Seeded facts — xAI only**, all traced to evidence already in this repo:

| Address | Fact | Class |
|---|---|---|
| `xai/*/images/edits` | 3 refs | LIVE_VERIFIED 2026-09-21 |
| `xai/grok-imagine-image-quality/images/edits` | 3 refs | LIVE_VERIFIED 2026-09-21 |
| `xai/grok-imagine-image-2.0/images/edits` | 5 refs | DOCUMENTED 2026-09-21 (never called) |
| `xai/*/videos/edits` | 8 refs = safety ceiling, not a provider fact | INFERRED 2026-09-21 |
| `xai/*/videos/edits` | 4096 prompt chars | LIVE_VERIFIED 2026-09-22 (unbilled 400) |

Runway/Veo/Pika/Higgsfield/OpenAI/Google are **deliberately absent** — seeding limits for
providers AVT has not called would be a memory-derived benchmark. A test enforces this.

**No rankings.** `capabilityBakeoff.ts` ships `eligibleCandidates()` (capability
feasibility, caller order preserved, no score) and `BakeoffResult` / `BakeoffRound` record
shapes. `BakeoffRound` has no `winner` field. No benchmark numbers were invented.

### B · Artifact locking — `src/lib/production/artifactLock.ts`

States `DRAFT / QA_PENDING / REPAIR_REQUIRED / PASS / LOCKED / SUPERSEDED`, reusing Astra's
verdicts and the existing `draft|approved|locked|archived` ladder rather than inventing a
vocabulary. `shots.locked_look_id` is the single-Look ancestor this generalizes.

- `lockArtifact()` refuses without a PASS verdict, without a reason, with missing
  stage-required QA gates, or **with no declared dependencies** (a lock that can never be
  invalidated is worse than no lock).
- No unlock-in-place: `supersedeArtifact()` is the only exit, recording `supersededBy` /
  `supersededAt`. Re-running QA on a LOCKED artifact records the verdict without flipping
  the state.
- **Dependency-aware invalidation** over 9 dependency kinds. `deterministic_process` and
  `timeline_sync` → **REPAIR**; `treatment` / `qa_rubric` → **REVIEW**; generative inputs →
  **RERENDER**. Scoping each dependency by id is why "changing S08 does not unlock S06"
  needs no special case.
- `planRender()` → `REUSE_LOCKED / REVIEW / REPAIR / RERENDER` per artifact, taking the
  strongest consequence across changed dependencies, with a full rationale, a
  `requiresUnlock` list, and unresolved dependencies failing closed. It decides; it never
  renders or mutates.

---

## TEST RESULTS

Reported by category per [`TEST_TAXONOMY.md`](../TEST_TAXONOMY.md). All 58 new tests are
**Unit** — none installs a `vi.mock` / `vi.stubGlobal` boundary double or renders a
component.

**Full suite: 1360 passed, 1 skipped, across 135 files — 1360 unit + mocked-integration as
previously categorized, 0 provider-live, 0 real-media-benchmark, 0 deployment-smoke.**

Delta vs base `391b60f`: **1302 → 1360 passed (+58)**, 131 → 135 files (+4). No pre-existing
test changed.

| New file | Tests |
|---|---:|
| `supabase/functions/_shared/capabilityRegistry.test.ts` | 25 |
| `supabase/functions/_shared/capabilityRegistry.compat.test.ts` | 4 |
| `supabase/functions/_shared/capabilityBakeoff.test.ts` | 4 |
| `src/lib/production/artifactLock.test.ts` | 25 |

`npx tsc --noEmit` clean. `npx eslint` clean on all new files.

**The three zeros still stand.** Nothing here has been exercised against a live provider,
real media, or a deployed environment. This proves the resolution and planning logic is
correct; it proves nothing about xAI's actual limits beyond the evidence already recorded.

Coverage of the specifically-requested cases: model/operation-specific resolution ✓,
unknown-capability behavior ✓, stale-capability behavior ✓, provider/model distinction ✓,
lock creation ✓, locked-artifact reuse ✓, dependency invalidation ✓, unrelated-shot
preservation ✓, supersession ✓, fail-closed on safety-critical constraints ✓.

One design flaw was found **by a test rather than by inspection**: the first draft carried
a record-level verification status, which cannot express `xai/*/videos/edits` (a
LIVE_VERIFIED prompt limit sitting next to an INFERRED reference ceiling). Fixed with
per-field provenance.

---

## FILES / SCHEMAS CHANGED

**All new. Zero existing files modified** (`git status` shows 8 untracked paths and nothing else).

```
supabase/functions/_shared/capabilityRegistry.ts
supabase/functions/_shared/capabilityRegistry.test.ts
supabase/functions/_shared/capabilityRegistry.compat.test.ts
supabase/functions/_shared/capabilityBakeoff.ts
supabase/functions/_shared/capabilityBakeoff.test.ts
src/lib/production/artifactLock.ts
src/lib/production/artifactLock.test.ts
src/lib/production/index.ts
docs/PROVIDER_CAPABILITY_REGISTRY.md
docs/ARTIFACT_LOCKING.md
docs/handoffs/CLAUDE_INFRA_LANE_2026-09-23.md
```

Not touched: `providerCapabilities.ts`, any `grok-*-proxy`, `provider_capabilities` table,
`src/lib/providers/*`, `shots`, `timeline_items`, `CLAUDE_LATEST.md`, any YSL result artifact.

---

## ANY MIGRATION

**None.** No file added to `supabase/migrations/`, no SQL to run in Lovable, no edge
redeploy, no new secret required for current behavior.

A proposed additive `shot_artifacts` table is written out in
[`ARTIFACT_LOCKING.md` §6](../ARTIFACT_LOCKING.md) **for review, not application** — the
pure layer works on `renders_vN.json`-shaped records today, and dropping a migration file
into the repo while the primary agent is mid-production is a risk with no current payoff.
When it is applied it needs the RLS integration test that Class C requires.

`CAPABILITY_REGISTRY_JSON` is optional and unset; absent it, built-in facts apply.

---

## CONFLICT RISK

**Low — no shared file was edited.**

| Shared file | Primary-agent activity | This lane |
|---|---|---|
| `_shared/providerCapabilities.ts` | edited `378b641` (09-21), `54ebb67` (09-22) | **not edited** — delegation documented instead |
| `grok-video-edit-proxy/index.ts` | edited `48df1d8` (09-22) | **not edited** |
| `grok-image-garment-proxy/index.ts` | edited `a43a16b` | **not edited** |
| `docs/handoffs/CLAUDE_LATEST.md` | rewritten every round | **not edited** — separate handoff |
| `scripts/edit/*`, `scripts/qa/*`, YSL results | actively written | **not touched** |

The one real coupling is that the registry and `providerCapabilities.ts` currently hold the
same xAI facts. That duplication is guarded by `capabilityRegistry.compat.test.ts`, which
fails and names the field the moment they disagree — including if the primary agent
verifies a new xAI limit and updates only the legacy module. **That is the intended
behavior**: it is a prompt to update both, not a broken test.

---

## WHAT PRIMARY AGENT SHOULD ADOPT

Nothing is required. In rough order of payoff:

1. **When you verify a new xAI limit, update both files.** The conformance test will tell
   you if you miss one. Put the fact at the tightest address the evidence supports — a 400
   from `grok-imagine-image-quality` does not license a `"*"` record.

2. **Record `dependencies[]` alongside `renders_vN.json`.** This is the single highest-value
   step and it needs no adoption of anything else: Look version, ShotSpec hash,
   provider/model, prompt hash, tracker version, sync id. Without recorded inputs, "which
   shots does this change actually affect?" has no answer except *all of them* — which is
   what made the v6 round re-roll all 8 slots. `docs/ARTIFACT_LOCKING.md` §7.

3. **Lock what passed.** `lockArtifact(a, { reason, at, requiredGates: ["native_media_qa"] })`
   on each shot that clears QA, then `planRender()` before the next round and act on
   `affected` only. The wordmark case is the immediate win: a new tracker version plans as
   5 × `REPAIR`, **0 × `RERENDER`**.

4. **The proxy delegation** (`docs/PROVIDER_CAPABILITY_REGISTRY.md` §4) — written out as a
   diff-ready snippet, left unapplied because both files are yours. It is what gives the
   proxies a model dimension: `getCapability({ provider, model, operation })` +
   `evaluateRequest()` fail-closed before spend. Land it when the YSL lane is quiet.

5. **For the Runway Aleph investigation**: add records as you verify, rather than a constants
   file. `DOCUMENTED` for what Runway's docs claim, `LIVE_VERIFIED` only for what a call
   proved. The registry is deliberately empty of Runway facts so nothing there contradicts
   what you find.

---

## WHAT REMAINS DESIGN-ONLY

- **The proxy delegation** — snippet written, not applied (both files are the primary
  agent's). Until then the duplication is guarded by the conformance test.
- **`shot_artifacts` DDL** — proposed in `ARTIFACT_LOCKING.md` §6, not added to
  `supabase/migrations/`. Needs RLS + its integration test before application.
- **Benchmark harness** — only the record shape (`BakeoffResult`, `BakeoffRound`) and the
  eligibility filter exist. No runner, no metrics, no scores. Per
  `REPRODUCIBLE_BENCHMARK_SYSTEM.md`, numbers come from a run or they do not go in.
- **Evidence-based provider selection** — `recommendProviderForShotType()` in
  `src/lib/providers/capabilities.ts` still ranks via a hard-coded `preferredOrder` against
  the DB table. It is live in the PromptBuilder UI and **was not modified**; replacing it is
  a Class-C product decision that needs benchmark evidence that does not exist yet.
  **Flagged, not fixed.**
- **DB-table reconciliation** — `provider_capabilities` overlaps the registry on
  `max_duration_seconds`, `supported_aspect_ratios`, `supports_reference_image`. Proposal:
  the table keeps creative guidance, the registry owns hard constraints, and those three
  columns eventually source from the registry. Not implemented.

---

## REVIEW GATE

Class **C** per [`ARCHITECTURE_REVIEW.md`](../ARCHITECTURE_REVIEW.md) — touches **Providers**
(trust boundary + spend), **Rendering/Timelines** (artifact graph), and **Benchmarks**
(bake-off contract). **Three sign-offs required before merge: architecture + product +
security.** The PR is a draft and must not be self-merged.

No `RISK_REGISTER.md` entry: no risk is opened, moved, or closed — nothing in the running
system reads either module yet. If the proxy delegation lands, that change carries the
risk-register review, since it moves a live spend guard.
