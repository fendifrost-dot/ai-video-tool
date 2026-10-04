# A composable photographic-realism modifier · 4 October 2026

**Status: EXPERIMENTAL.** Nothing here has been run against a real AVT route. **$0** — no
paid generation, subscription or top-up was authorised for this addition.

The ask was whether a supplied package of photoreal portrait prompts should become a
"realism skill". It should not: a skill is instructions for an agent, not a feature of AVT,
and AVT already has the mechanism. What it should become is **one optional modifier that
composes with the templates that already exist** — which is what this is.

---

## 1 · What was inspected before anything was designed

### How a prompt actually reaches a provider

```
compilePrompt(CompileInput)        src/lib/prompts/compiler.ts
      │                            substitutes {{slots}}, merges negatives, picks references
      ▼  CompiledPrompt
provider.formatPrompt()            src/lib/providers/*.ts
      │                            per-provider phrasing (Runway prepends "cinematic", …)
      ▼  FormattedPrompt
applyCapability(formatted, cap)    src/lib/providers/capabilities.ts
      │                            clamps duration, warns on aspect ratio, and
      │                            DROPS THE WHOLE NEGATIVE BLOCK when
      │                            provider_capabilities.supports_negative_prompt is false
      ▼
   provider request
```

This decided the implementation. The modifier runs **inside `compilePrompt`, at the end**,
and stays provider-agnostic — so "only apply provider-supported instructions" is satisfied
by the gate that already exists. Re-implementing that check in the modifier would have
created a second, divergent answer to the same question.

A per-call hook was already there too: `PromptOverrides.extra_negative`.

### What identity authorities exist — and the one that does not

| who | authority | reaches the compiler as |
|---|---|---|
| the primary artist | `artists` (`identity_profile_json`, `continuity_rules`, `forbidden_inaccuracies`) + `character_features` (Character DNA, `is_locked`) + `artist_looks` | `lockedLookImagePath`, `lockedCharacterFeaturePaths`, `lockedReferenceAssetPath` |
| places, props, lighting states | `continuity_entities` | `spec.continuity`, by key |
| **an approved recurring character** | **none** | — |
| **a newly invented person** | **none** | — |

**`ENTITY_KINDS = ["location", "prop", "lighting"]`.** There is no character kind, and
`entityFromRow` returns `null` for any kind outside that list — so a `character` row
inserted today would be **silently dropped on read**. `shotSpec`'s "identity" section is the
*shot's* id/title/order, not a person's. There is no cast, supporting-character or extra
concept anywhere in the codebase.

So the modifier **defers** to what exists and **reports** what does not. It holds no record
of any person and is not an identity authority. The `recurring` mode returns a `gap`
requirement naming the missing record rather than pretending a reference resolved.

### The gap that justified building anything

All 15 live templates' negative prompts, audited for realism terms:

```
plastic · airbrush · CGI · smooth skin · waxy · beauty filter · retouch · uncanny · 3d render
→ 0 hits across 15 templates
```

Every existing negative guards **anatomy and identity** (`extra fingers`, `missing
tattoos`, `identity drift`). Nothing anywhere guards against plastic, airbrushed or CGI
skin. That is a real hole, and it is the only hole this fills.

**This establishes missing vocabulary. It does not establish improved output.** The
distinction is carried in the code, not just in this document — every result returns an
`unverified` requirement saying so.

---

## 2 · The design

### Identity is a required argument, not a default

`"preserve"` · `"recurring"` · `"invent"` — and the difference is the load-bearing part:

**`preserve` and `recurring` describe no feature at all.** They say *retain what the
reference has*. The supplied package asks for freckles, asymmetry and visible pores **on a
face**; telling a model to add those to a referenced person is an instruction to **change**
that person. Invented imperfection is still invention. A test enforces that neither mode
ever emits `asymmetr|freckle|pore|peach fuzz|blemish|imperfection`.

**`invent` is the only mode that may describe a human**, and even then only in
subject-neutral terms — "an ordinary human face with the small natural variation real faces
have". It asks for variation **without naming which variation**, so two invented extras do
not come out as the same person.

### Naturalism is separated from looks

| | |
|---|---|
| **naturalism** (always) | light falloff and shadow-edge hardness · optical focus falloff · grain rather than denoise · real surface texture · subsurface translucency · highlight roll-off |
| **looks** (opt-in by name) | `portra` · `macro` · `shallowDepth` · `windowLight` |

The package runs these together. They are not the same thing: **a surreal environment under
hard magenta light can be photographically naturalistic.** Conflating them is what makes a
"realism preset" quietly flatten a music video. Asking for naturalism implies no look.

### What was excluded from the generic modifier, deliberately

Complexion · eye colour · facial proportions · freckles · beauty marks · gender · camera
body · focal length · aperture. All of it describes the package's two specific people.
A test asserts none of it appears in any mode with any combination of looks.

No camera body or aperture appears because **it is not physics to a generative model** —
there is no sensor and nothing is exposed. The package contradicts itself about which lens
anyway (a 90mm G Macro and an 85mm GM, three sentences apart). Lens *behaviour* is
described instead, which is the part a model can render.

---

## 3 · Conflict: the approved treatment wins, and the disagreement is recorded

Deliberate fashion styling, makeup, artificial light and surreal staging are **creative
requirements, not realism failures**. This is the same authority-vs-evidence split merged in
#169: the treatment is **approved**, realism is **advisory**, and advisory never silently
overrules approved.

When a fragment would contradict wording already in the prompt (or in `treatmentText` the
caller supplies), it is **withheld** and reported with the phrase that outranked it.

**The negatives are derived from the fragments that survived.** Withholding "skin as it is,
without cosmetic retouching" also withholds `retouched, magazine retouching, glamour
retouch` from the negative block. Without that coupling, a realism preset would ban the
makeup the treatment just asked for — which is a bug, not realism.

Matching is **word-boundary**, not substring: `beauty` hits "beauty lighting" but not
"beautiful", and `night` hits "shot at night" but not "nightclub" or "knight".

Worked examples, generated by running the module: **[`EXAMPLES.md`](./EXAMPLES.md)**.

| case | outcome |
|---|---|
| A · preserve the artist, video route | all naturalism, no feature described, temporal clause, `caller` requirement that a reference must actually reach the provider |
| B · invent a background extra | naturalism **+** the two invent-only fragments |
| C · approved recurring character | identical wording to A, **plus a `gap` requirement** naming the missing cast record |
| D · glossy editorial makeup | "without cosmetic retouching" **withheld** (`makeup`), and its negatives withheld with it — **but surface texture is kept**, because a fashion shot still has texture |
| E · neon stage light, `windowLight` + `portra` requested anyway | both looks **withheld** (`strobe`, `neon`); the treatment outranks a requested look |
| F · surreal floating cathedral | **nothing withheld** — surreal staging is not a realism conflict |

D and F together are the point: the modifier backs off exactly where a human decided
something, and nowhere else.

---

## 4 · Video: temporal consistency is requested, never claimed

`temporal: true` emits a clause asking for a held face, wardrobe and lighting with no drift,
boiling or flicker. It also returns:

> `[unverified]` the temporal clause is a **REQUEST**. No provider guarantees it, and prompt
> wording is not evidence that a delivered clip holds together.
> *Settled by:* measuring the delivered clip frame to frame, as `scripts/qa/composite_verify.py`
> does for a composite.

Prompt wording is not proof that the requirement is met. The modifier never implies it is.

---

## 5 · What changed, and what did not

**Changed** — `src/lib/prompts/realism.ts` (new, pure), `types.ts` (optional `realism` on
`CompileInput`, `realism` on `CompiledPrompt`), `compiler.ts` (runs it last when asked).

**Did not change** — no template row was edited, no negative was globally appended, no enum
was migrated, no UI surface was added, and no provider code was touched. Omitting `realism`
leaves the compiler's output exactly as it was; a test asserts the body and negatives are
untouched and the template's own negatives still arrive.

**No enum migration.** `prompt_template_category` has no image category, but the modifier
composes with existing templates rather than needing a row of its own, so nothing required
one. If a still-image route is added later, that is when the enum question becomes real.

## 6 · What would settle the open question

One A/B on a real AVT route — same seed, same settings, with and without the modifier,
judged on whether skin reads as plastic. That needs a generation budget, which this tranche
did not have. Until it runs, the modifier is `status: "experimental"` and says so on every
result it returns.
