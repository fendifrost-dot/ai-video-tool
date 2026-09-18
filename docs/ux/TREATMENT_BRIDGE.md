# Treatment → Product OS bridge (Lane F)

`src/lib/pipeline/treatmentBridge.ts` translates **approved** Shot Specifications
([`src/lib/treatment/shotSpec.ts`](../../src/lib/treatment/shotSpec.ts)) into
Product OS job-graph inputs, and — on request — live `PipelineRun`s.

It is a thin **translation layer** that mirrors the `catalog.ts` pattern
(`bindCatalog` → `CreatePipelineRunInput` → `createBoundPipelineRun`). The
orchestrator stays clip-agnostic; a shot binds to the graph purely by
`ArtifactKind` + reproducibility metadata.

## Granularity

One **Shot** = one clip = one `PipelineRun`. A treatment (many approved shots)
therefore maps to many run inputs — the "job graph".

## Eligibility

Only shots whose `status` is production-eligible are dispatched. The default set
is exactly `["approved"]` (`PRODUCTION_ELIGIBLE_STATUSES`); pass
`opts.eligibleStatuses` to widen it for previz / dry-run flows. Ineligible shots
are returned in `skipped`, never silently dropped.

## What a shot becomes

| Shot source | Seed artifact | Stage that imports it |
|-------------|---------------|-----------------------|
| `captured` / `stock` with an asset | `source_master` | `ingest` |
| `generated` with an existing asset | `generation_clip` (import-only) | `generation` |
| generation required, no asset | *(no seed)* — flagged `awaitingGeneration` | pauses at `generation` |

The shot's `generation` + `reconstruction` blocks are folded into a
`reproducibility` payload (model / version / prompt / seed / transfer mode /
mask version / reference-asset hash / preserve regions) and attached to each
seed's `lanePayload`, alongside a compact creative summary so intent stays
legible on the run. Product OS records this opaquely as provenance.

## Hard boundaries

- **Calls** Product OS (`createPipelineRun`, which wires
  `createProductOsAdapters`). Never rewrites Architecture C
  chest/sleeve/temporal/reconstruction engines.
- **Never** runs paid generation. A shot needing generation is dispatched and
  flagged `awaitingGeneration`; the import-only generation stage pauses until
  another lane supplies the clip.
- **Never** auto-sets RED/YELLOW review gates (`masterCompositeAuthorized`,
  `exportApproved`, unqualified `stillRepairApproved`). Only product-safe
  auto-reviews from [`autoReviews.ts`](../../src/lib/pipeline/autoReviews.ts)
  fire automatically; human decisions arrive via `opts.reviews`.

## API

```ts
import {
  treatmentToRunInputs,            // pure: shots → run inputs + skipped + warnings
  createPipelineRunsFromTreatment, // calls Product OS: shots → PipelineRun[]
  shotSpecToRunInput,              // one shot → one CreatePipelineRunInput
  createPipelineRunFromShotSpec,   // one shot → one PipelineRun
  isProductionEligible,
  shotReproducibility,
  shotSpecToSeedArtifacts,
} from "@/lib/pipeline";
```
