# PROVIDER_CAPABILITY_REGISTRY.md — capability truth per provider / model / operation

> Status: **implemented, not yet wired into the proxies.** The registry ships with tests and
> an anti-drift guard against the live module; the delegation in §Integration is deliberately
> left for the primary agent to land (see §Conflict risk).
>
> Change class: **C** (Providers) per [`ARCHITECTURE_REVIEW.md`](ARCHITECTURE_REVIEW.md) —
> three sign-offs before merge.
>
> Written: 2026-09-23.

---

## 1. The problem this exists to remove

Capability truth lived in three places, keyed three different ways, none of which could
name a model:

| Where | Keyed by | Used by | Kind of truth |
|---|---|---|---|
| `provider_capabilities` table (migration `20260516200000`) | `provider` | compiler / PromptBuilder via `src/lib/providers/capabilities.ts` | creative guidance + a few hard limits |
| `supabase/functions/_shared/providerCapabilities.ts` | `"<provider>:<endpoint>"` | `grok-image-garment-proxy`, `grok-video-edit-proxy` | hard limits enforced before spend |
| `src/lib/providers/types.ts` `ProviderCapability` | provider class | Prompt Builder buttons | feature flags |

**The incident.** Commit `f99e3d6` put `xai:images/edits → 5` on `main`. Commit `378b641`
corrected it to `3` after a live 400. Both numbers were true — for *different models*:
`grok-imagine-image-quality` rejects more than 3; the docs list 5 for
`grok-imagine-image-2.0`. With a vendor-keyed schema there was nowhere to put that
distinction, so it was written into a prose `source` string and the deployed constant
disagreed with `main` for a day.

A provider limit is a property of a **model** and an **operation**, not of a vendor.

**Evidence class matters too.** "The docs say 5" and "the API returned 400 at 4" are not
the same claim, and the old schema had no way to say which one you were reading.

---

## 2. What shipped

`supabase/functions/_shared/capabilityRegistry.ts` — pure, dependency-free, Deno- and
Vitest-compatible.

### Address

```ts
getCapability({ provider: "xai", model: "grok-imagine-image-quality", operation: "images/edits" })
```

`model` accepts an exact id, a trailing-`*` family pattern (`"grok-imagine-image-*"`), or
`"*"` for provider-wide. Resolution picks exact > longest family prefix > `"*"`, and
merges **field by field**, so a model-specific record that pins one limit inherits
everything else from the provider-wide record.

### Expressible facts

Input modalities (text/image/video/audio); source-video editing; image-, video- and
keyframe-conditioning; max reference images, prompt chars, input and output duration;
supported and native resolutions, aspect ratios, FPS; audio output and source-audio
preservation; alpha; output and intermediate (ProRes/DNxHR) formats; bit depth; HDR;
async operation; pricing metadata.

A field that is **absent** means "this record says nothing" (inherit it). A field that is
**`null`** means "this record says it is unverified" (do not inherit). That distinction is
what makes field-by-field merge safe.

### Verification states

| State | Means |
|---|---|
| `LIVE_VERIFIED` | The provider's own response proved it. Cite the request or the error. |
| `DOCUMENTED` | The vendor's docs say so. Nobody has called it. |
| `INFERRED` | Deduced from an observation, or a code safety ceiling standing in for an unknown. |
| `UNKNOWN` | No record. Resolves to conservative defaults and fails closed. |
| `STALE` | **Derived, never declared** — a fact past its TTL for its class. |

TTLs: `LIVE_VERIFIED` 90d, `DOCUMENTED` 60d, `INFERRED` 30d. A fact with no readable
`verifiedAt` is **STALE**, because freshness has to be provable rather than assumed.

A stale fact keeps its value — it is still the best number available — but `effectiveStatus`
says it needs re-verification, and enforcement reports a compliant call against it as
`unverified` rather than silently fine.

### Per-field provenance

This is the part that actually prevents a repeat of the incident. Every resolved field
carries where it came from:

```ts
r.provenance.maxPromptChars
// { status: "LIVE_VERIFIED", effectiveStatus: "LIVE_VERIFIED", verifiedAt: "2026-09-22",
//   source: "provider rejects a longer prompt, unbilled",
//   evidence: "provider 400: 'Prompt length exceeds the maximum allowed length of 4096'",
//   from: "xai/*/videos/edits", layer: "builtin" }
```

Evidence belongs to a **fact**, not to a record: `xai/*/videos/edits` holds a
`LIVE_VERIFIED` prompt limit next to an `INFERRED` reference ceiling. Records therefore
support a `fieldProvenance` block overriding the record-level one per field. (The old
module had to narrate both classes in one prose `source` string.)

> This was found by a test, not by inspection — the first draft used a record-level status
> and could not express the xAI video address at all.

### Overrides without a redeploy

`CAPABILITY_REGISTRY_JSON` (edge secret) holds an array of records, read at request time.
Precedence is **layer first, then specificity**: an override outranks a built-in even a
more specific one, because an override exists to correct a wrong built-in and could not do
that otherwise. The cost is bounded three ways:

1. an override that does not **declare** its own status is recorded as `INFERRED` — it can
   never inherit `LIVE_VERIFIED` from the fact it replaces;
2. `layer: "override"` is visible in the provenance of every field it supplied;
3. `SAFETY_MAX_REFERENCE_IMAGES = 8` is applied **after** all merging, above every data source.

Malformed override JSON is ignored, leaving the built-in facts intact.

### Fail-closed enforcement

`evaluateRequest(resolved, request)` returns violations at two severities:

- **`block`** — a known limit exceeded, or a feature declared `false`. Do not call.
- **`unverified`** — the constraint is unknown or stale. The call may proceed, and the gap
  is recorded rather than swallowed.

Reference count is the one limit that blocks on `UNKNOWN`: the conservative default is 1,
so asking for more against an unregistered address is a real over-request, not a gap.

We cannot invent a number for an unknown limit. The honest move is to record that we are
calling without proof — not to treat silence as permission.

### Seeded facts

Only **xAI** ships as a hard constraint, because only xAI has been exercised:

| Address | Fact | Class |
|---|---|---|
| `xai/*/images/edits` | 3 reference images | `LIVE_VERIFIED` 2026-09-21 |
| `xai/grok-imagine-image-quality/images/edits` | 3 | `LIVE_VERIFIED` 2026-09-21 |
| `xai/grok-imagine-image-2.0/images/edits` | 5 | `DOCUMENTED` 2026-09-21 — never called |
| `xai/*/videos/edits` | 8 references (safety ceiling, not a provider fact) | `INFERRED` 2026-09-21 |
| `xai/*/videos/edits` | 4096 prompt chars | `LIVE_VERIFIED` 2026-09-22 (unbilled 400) |

Runway, Veo, Pika, Higgsfield, OpenAI and Google are **deliberately absent**. Seeding
limits for providers AVT has not called would be a memory-derived benchmark, which
`CLAUDE.md` forbids. Absent resolves to `UNKNOWN` and fails closed — which is honest. A
test asserts the seed contains no provider beyond xAI, so this stays a decision rather
than an oversight.

The `provider_capabilities` DB table keeps its creative guidance for those vendors. It is
**not** a hard-constraint source and nothing in this registry reads it.

---

## 3. Provider selection — what this is *not*

The registry answers *can it?* and *within what limits?*. It does not rank.

`capabilityBakeoff.ts` provides the only selection help that is honest today:

- `eligibleCandidates()` filters candidates to those whose declared capabilities can
  satisfy a shot's hard requirements. A candidate is **ineligible** only when a capability
  fact positively rules it out. A candidate whose facts are merely unknown is **eligible
  but `provisional`** — absence of evidence is not evidence of incapability, and silently
  dropping unproven providers is how a registry becomes a ranking by omission.
- Returned order is the caller's input order and carries no preference.

`BakeoffResult` / `BakeoffRound` define the record shape a future harness writes:
canonical test shot + ShotSpec hash + candidate → metrics, each with `method` and
`direction`, plus `costUsd` and a `reproduction` block. `metrics` is open on purpose —
identity preservation, canonical-Look adherence, temporal stability, treatment conformance
and cost per useful second are the dimensions that matter, but none has an agreed
measurement yet and freezing the taxonomy before the evidence exists would be backwards.

`BakeoffRound` has **no `winner` field**. Picking one is a reviewer's decision recorded with
its rationale, not a property of the round.

**No scores are invented here.** Per
[`REPRODUCIBLE_BENCHMARK_SYSTEM.md`](REPRODUCIBLE_BENCHMARK_SYSTEM.md), a number that did
not come from a run does not go in.

### Pre-existing ranking, untouched

`recommendProviderForShotType()` (`src/lib/providers/capabilities.ts`) picks a provider by
walking a hard-coded `preferredOrder` against the DB table's `recommended_shot_types`. That
*is* a hard-coded ranking, it predates this work, and it is live in the PromptBuilder UI.
It is **not modified here** — replacing it is a Class-C product decision that needs the
benchmark evidence above. Flagged, not fixed.

---

## 4. Integration — the delegation left for the primary agent

`providerCapabilities.ts` is live in two proxies and was edited twice in the two days
before this work (`378b641`, `54ebb67`). Per the concurrency rules this lane does **not**
edit it. The intended end state is that it becomes a thin shim:

```ts
// providerCapabilities.ts — proposed, NOT applied
import { addressFromLegacyKey, getCapability } from "./capabilityRegistry.ts";

export function getProviderCapability(key: string, env = Deno.env): ProviderCapability {
  const r = getCapability(addressFromLegacyKey(key), { env });
  return {
    maxReferenceImages: r.values.maxReferenceImages ?? 1,
    firstFrameConditioning: key.startsWith("xai:images/")
      ? r.values.imageReferenceConditioning ?? null
      : r.values.keyframeConditioning ?? null,
    maxPromptChars: r.values.maxPromptChars ?? null,
    source: r.provenance.maxReferenceImages?.source ?? "registry",
  };
}
```

Then the proxies gain a model dimension at their call sites:

```ts
// grok-image-garment-proxy — proposed
const cap = getCapability({ provider: "xai", model: requestedModel, operation: "images/edits" }, { env: Deno.env });
const check = evaluateRequest(cap, { referenceImages: refs.length, promptChars: composedPrompt.length });
if (!check.allowed) return fail(check.violations);
```

That is where the value lands: the proxy stops asking "what does xAI allow?" and starts
asking "what does *this model on this operation* allow?".

### Until then: the anti-drift guard

`capabilityRegistry.compat.test.ts` asserts the registry and the legacy module agree on
every overlapping fact and on the safety ceiling. The moment they disagree the suite goes
red and names the field.

This is load-bearing, not ceremonial: it is the only thing that makes an interim
duplication safe, and it is exactly the check whose absence produced the 3-vs-5 incident.
Delete it together with the duplication when the delegation lands.

---

## 5. Adding a capability fact

1. Establish it. A live call beats docs; record the request id or the error string.
2. Add or extend a record at the tightest address the evidence supports. Evidence from one
   model does not license a `"*"` record.
3. Set `status` / `verifiedAt` / `source` / `evidence` honestly. Use `fieldProvenance` when
   one address carries facts of different classes.
4. If it overlaps a legacy key, update the legacy module in the **same** change — the
   conformance test will fail otherwise, which is the point.
5. Urgent production fix with no time for a deploy: `CAPABILITY_REGISTRY_JSON`, then land
   the record properly.

## 6. Conflict risk

| File | Owner | This lane |
|---|---|---|
| `_shared/providerCapabilities.ts` | primary (YSL) | **untouched** |
| `grok-*-proxy/index.ts` | primary (YSL) | **untouched** |
| `provider_capabilities` table + `src/lib/providers/*` | product/UI | **untouched** |
| `_shared/capabilityRegistry*.ts`, `_shared/capabilityBakeoff*.ts` | this lane | new files |

No migration, no deploy, no secret required for the current behavior — nothing in the
running system reads the registry yet.
