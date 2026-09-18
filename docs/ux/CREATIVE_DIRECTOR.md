# Creative Director (Lane D · Treatment UX)

The Creative Director is the planning surface that turns everything a filmmaker
brings to the table into a complete, machine-executable **Shot Spec sequence** —
spoken in filmmaker language, not engine parameters.

```
 source footage ┐
 song + timing  │
 wardrobe refs  ├──►  Creative Director  ──►  ShotSpec[]  ──►  treatment / shot list / production
 creative brief │        (planner)            (contract)
 capabilities   ┘
```

It is **planning only** — it runs **no generations** and incurs **no cost**. The
default planner is deterministic and offline; a real provider-backed planner can
be added later behind the same adapter without any consumer change.

## Boundary

| In | Type | Source |
|----|------|--------|
| Creative brief | `CreativeBrief` | project fields + chosen concept/mood/style |
| Song / timing | `GridClip[]` | `lib/treatment/grid.ts` — the beat-aligned cut points |
| Wardrobe refs | `WardrobeLook[]` | project looks (generic name + description + refs) |
| Source footage | `SourceFootage[]` | captured takes available to cut to |
| Capabilities | `ProviderCapabilities` | what the pipeline can actually render |

| Out | Type |
|-----|------|
| Ordered sequence | `ShotSpec[]` (validated via `parseShotSpec`) |
| Rationale + sections + logline | `CreativeDirectorPlan` |

## Hard rules

1. **Timing is never invented.** The grid owns every cut point; the planner only
   fills creative fields per clip. (Same discipline as the Treatment Builder — the
   LLM/planner never does timing math.)
2. **Nothing brand-specific is baked in.** A "look" is a free name + description +
   references. Wardrobe rotates whatever the brief supplies (falling back to no
   wardrobe). There is no YSL — or any brand — in the defaults.
3. **No paid generations.** The default `mock` planner is deterministic and free.
   `capabilities.ts` only *describes* engines so the planner recommends a fitting
   one; it never renders.
4. **Output is the generalized `ShotSpec` contract** (`lib/treatment/shotSpec.ts`),
   so a plan drops straight into treatment → shot list → production.

## Files

| Path | Role |
|------|------|
| `src/lib/creativeDirector/types.ts` | Boundary shapes — brief, looks, footage, plan |
| `src/lib/creativeDirector/capabilities.ts` | Provider capability description + engine selection |
| `src/lib/creativeDirector/planner.ts` | `CreativeDirectorPlanner` adapter + registry + `MockCreativeDirectorPlanner` |
| `src/lib/creativeDirector/index.ts` | Public barrel |
| `src/components/creativeDirector/CreativeDirectorPanel.tsx` | Drop-in planning panel |

## Deterministic mapping (mock planner)

The offline planner derives filmmaker grammar from the grid clip's **energy** and
**section**, so the same brief + grid always yields the same plan:

| Energy | Framing | Camera motion | Pacing note |
|--------|---------|---------------|-------------|
| low | wide | slow dolly | "let it breathe" |
| mid | medium | steadicam glide | "steady, confident" |
| high | medium close-up | handheld | "driving, kinetic" |
| drop | close-up | whip-pan + punch-in fx | "hit the accent" |

- **Sourcing:** hook/chorus/drop sections → performance; low-energy connective
  passages → b-roll / generated texture. Performance beats prefer **captured
  footage** when available, else they plan generation within capabilities.
- **Wardrobe:** looks rotate by section index, in the order supplied.
- **Priority:** drops and hook shots are `hero`.
- **Engine:** chosen by `pickEngine(capabilities, kind, clipSeconds)` — never an
  engine that can't render the kind or fit the clip length.

## Adapter interface

```ts
interface CreativeDirectorPlanner {
  readonly id: string;
  readonly label: string;
  readonly isFree: boolean;              // true → no paid model calls
  planSequence(input: PlanInput): Promise<CreativeDirectorPlan>;
}
```

Register a planner with `registerPlanner()`, resolve with `getPlanner(id)`. The
`mock` planner is registered on module load and is the `DEFAULT_PLANNER_ID`. A
future LLM-backed planner (e.g. Claude via the existing `proxy-provider-call`
edge function) can implement the same interface and register itself — the panel
and consumers pick it up by id with no other change.

## UI panel

`<CreativeDirectorPanel brief grid capabilities? onApply? plannerId? />` is a
self-contained `<Card>`-level panel. It does **not** own the treatment page — the
Treatment Builder mounts it, and Lane B can import it anywhere.

- **Engineering-mode aware** (`lib/ux/engineeringMode.ts`): creative mode shows a
  director's language (purpose, frame & camera, wardrobe); engineering mode adds a
  **Source / engine** column (sourcing + recommended render engine).
- `onApply(plan)` hands back the `CreativeDirectorPlan`; the Treatment Builder maps
  its shots to rows via `shotSpecToShotRow` and appends them to the shot list.

## Tests

- `planner.test.ts` — one valid ShotSpec per clip, timeline alignment,
  determinism, filmmaker-language fields, wardrobe rotation with no hardcoded
  brand, capability-bounded engines, captured-vs-generated sourcing, section
  derivation, empty-grid safety, registry wiring.
- `capabilities.test.ts` — engine selection honours kind, clip-length caps,
  preference order, and the manual fallback.
