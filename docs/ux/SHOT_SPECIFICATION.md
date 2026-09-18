# Shot Specification

_Grok-initiated · Treatment UX · Lane C · 2026-09-18_

The **Shot Specification** (`ShotSpec`) is the single contract for describing one
shot. It is deliberately **dual-purpose**:

- **Human-readable** — every creative field renders directly onto a treatment
  card (purpose, wardrobe, environment, framing, camera, lighting, performance
  direction, references, previs).
- **Machine-executable** — every production field feeds the render / generation
  pipeline and the QA gates (source media, generation requirements,
  reconstruction requirements, QA requirements, status/provenance).

Source of truth: [`src/lib/treatment/shotSpec.ts`](../../src/lib/treatment/shotSpec.ts)
(Zod schema + TypeScript types + row mappers). Tests / fixtures:
[`shotSpec.test.ts`](../../src/lib/treatment/shotSpec.test.ts).

## Design rules

1. **No project-specific fields.** There is nothing YSL-, brand-, or
   artist-specific in the schema. A "look" is a free-form `name` + `description`
   - `references[]`. A project's creative brief lives on the **project**, not in
     this contract (per the sprint master doc).
2. **Enum parity with the DB.** Every enum that also exists on the `shots` table
   (`shot_type`, `shot_status`, `shot_priority`, `shot_transition_type`,
   `provider_name`) uses the identical literal set, so the row mappers never
   silently coerce those values. The literals are duplicated (not imported) from
   the generated `src/integrations/supabase/types.ts`.
3. **Optional by default.** Only `id`, `purpose`, and `timeline` are required.
   A spec can begin life as a rough treatment beat and accrete production detail
   over time. Parsing applies safe defaults rather than dropping data.
4. **Validation, not just types.** `ShotSpecSchema` is the runtime gate; the
   TypeScript types are derived via `z.infer`.

## Concept → field map

Every required concept from the Lane C brief maps to a field:

| Concept                         | Field                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| timeline range                  | `timeline: { start, end }` (final-edit seconds)                                            |
| source media / range            | `source: { kind, mediaId, uri, range }`                                                    |
| shot purpose                    | `purpose` (required)                                                                       |
| performance / broll / generated | `kind`                                                                                     |
| editorial role                  | `shotType` (DB `shot_type` parity)                                                         |
| wardrobe / look                 | `wardrobe: { name, description, lookId, references }`                                      |
| environment                     | `environment: { description, location, timeOfDay, references }`                            |
| framing                         | `framing`                                                                                  |
| camera angle                    | `cameraAngle`                                                                              |
| lens                            | `lens: { focalLengthMm, aperture, description }`                                           |
| camera motion                   | `cameraMotion: { type, description }`                                                      |
| lighting                        | `lighting: { style, description, references }`                                             |
| performance direction           | `performanceDirection`                                                                     |
| FX                              | `fx: [{ type, description, intensity }]`                                                   |
| transition                      | `transitionIn` / `transitionOut: { type, durationSeconds }`                                |
| references                      | `references: [{ kind, uri, assetId, note }]`                                               |
| previs                          | `previs: { status, uri, notes }`                                                           |
| generation requirements         | `generation: { required, engine, model, prompt, negativePrompt, seed, parameters, notes }` |
| reconstruction requirements     | `reconstruction: { required, mode, maskVersion, referenceAssetHash, preserve, notes }`     |
| QA requirements                 | `qa: [{ check, mustPass, notes }]`                                                         |
| status / provenance             | `status`, `provenance: { source, createdAt, updatedAt, author, model, notes }`             |

`kind` (how pixels are sourced) is intentionally separate from `shotType` (the
editorial role) — neither fully implies the other (e.g. a `generated` shot can
still be editorially `performance`).

The `reconstruction` block is where reproducibility metadata for the locked
video-swap architecture lives (`maskVersion`, `referenceAssetHash`, `preserve`
regions such as `face` / `logo`). See
[`docs/VIDEO_SWAP_ARCHITECTURE.md`](../VIDEO_SWAP_ARCHITECTURE.md).

## API

```ts
import {
  ShotSpecSchema,
  parseShotSpec,
  safeParseShotSpec,
  serializeShotSpec,
  deserializeShotSpec,
  shotSpecToShotRow,
  shotRowToShotSpec,
} from "@/lib/treatment/shotSpec";

const spec = parseShotSpec(json); // throws on invalid
const maybe = safeParseShotSpec(json); // null on invalid
const text = serializeShotSpec(spec); // canonical JSON (defaults applied)
const back = deserializeShotSpec(text); // JSON string → ShotSpec
```

`serialize → deserialize` is stable and idempotent (verified by the round-trip
tests).

## Row mapping (`shots` table)

`shotSpecToShotRow` / `shotRowToShotSpec` bridge the contract to the existing,
much narrower `shots` table. This is a **documented, lossy** bridge — fields with
no column round-trip through the `treatment_json` Shot Spec, not the row.

### Clean 1:1 columns

`scene_description` ↔ `purpose` · `shot_type` ↔ `shotType` · `priority` ·
`status` (with `draft → planned`) · `timestamp_start/end` ↔ `timeline` ·
`duration_seconds` (derived) · `trim_in/out_seconds` ↔ `source.range` ·
`wardrobe` · `environment` · `lighting` · `recommended_tool` ↔
`generation.engine` · `locked_look_id` ↔ `wardrobe.lookId` ·
`transition_in/out_type` + `transition_duration`.

### Row mapping gaps (lossy on `shotSpecToShotRow`)

These spec fields have **no column** and are handled as noted (mirrored in
`ROW_UNMAPPED_FIELDS`):

- `framing`, `cameraAngle`, `lens` → folded as tagged text into
  `camera_direction` (e.g. `dolly · framing:wide · angle:low`). Not structurally
  recoverable by `shotRowToShotSpec`.
- `fx`, `references`, `previs`, `generation` (beyond `engine`),
  `reconstruction`, `qa` → **dropped** on export; they live only in the Shot Spec
  JSON. Persist the full spec in `treatment_json` to keep them.
- per-block `references[]` on wardrobe/environment/lighting → dropped.
- `source.mediaId` / `source.uri` → dropped (only `range` maps, to `trim_*`).
- `provenance` → only `created_at`/`updated_at` survive; `source`/`author`/
  `model` are dropped.

### Import direction (`shotRowToShotSpec`)

Best-effort. Absent columns become schema defaults; `kind` is inferred from
`shot_type` (`performance → performance`, `b_roll → broll`, else `generated`);
`generation.required` is inferred from a non-`manual` `recommended_tool`;
`provenance.source` is set to `import`. A row with no `scene_description` gets a
placeholder `purpose` so the result still validates.

**Recommendation:** treat the **Shot Spec JSON as canonical** and the `shots`
row as a projection for pipeline stages that only understand the legacy columns.
Do not rely on the row as a lossless store.
