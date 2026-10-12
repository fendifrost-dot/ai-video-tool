# Review bundle: Gemini (Nano Banana) stills, storage SEC-4, character continuity (11–12 Oct 2026)

This folder is for an outside reviewer (e.g. ChatGPT). It collects everything done across two passes, so the work can be checked without the chat history.
Evidence labels used throughout: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

## Read in this order

1. [`../../handoffs/GEMINI_RELIABILITY_2026-10-12.md`](../../handoffs/GEMINI_RELIABILITY_2026-10-12.md), the second pass. It covers root causes with evidence, what changed, storage, live runs, the continuity verdicts, spend and remaining steps.
2. [`../../handoffs/GEMINI_VALIDATION_2026-10-12.md`](../../handoffs/GEMINI_VALIDATION_2026-10-12.md), the first pass: the $3 validation, which found the crashes and SEC-4.
3. [`../../evidence/SEC4_STORAGE_2026-10-12.md`](../../evidence/SEC4_STORAGE_2026-10-12.md), with [`SEC4_STORAGE_ROLLBACK.sql`](../../evidence/SEC4_STORAGE_ROLLBACK.sql) and the migration [`supabase/migrations/20261012210000_sec4_scope_reference_buckets.sql`](../../../supabase/migrations/20261012210000_sec4_scope_reference_buckets.sql).
4. [`PROMPTS_AND_JOBS.md`](PROMPTS_AND_JOBS.md): every Gemini job (20) with its exact prompt, ordered references, outcome and token usage. Raw data: [`data/gemini_jobs.json`](data/gemini_jobs.json).
5. [`IMAGE_MANIFEST.md`](IMAGE_MANIFEST.md): every image with its asset id, size, SHA-256 and verdict.
6. [`REVIEWS.md`](REVIEWS.md): the six independent reviews and what was done about each finding.

## Code (all merged and deployed)

| Repo | PR | What |
|---|---|---|
| fendi-control-center | [#55](https://github.com/fendifrost-dot/fendi-control-center/pull/55) | Streamed request body and incremental answer reader (the memory-crash fix) |
| fendi-control-center | [#56](https://github.com/fendifrost-dot/fendi-control-center/pull/56) | Reference cap sized to Google's 20 MB request limit |
| fendi-control-center | [#57](https://github.com/fendifrost-dot/fendi-control-center/pull/57) | `maxOutputTokens` 8,192 (`MAX_TOKENS` with no image) |
| ai-video-tool | [#235](https://github.com/fendifrost-dot/ai-video-tool/pull/235) | Recoverable failures in `world-still-proxy`; SEC-4 migration; research tools made service-role only |
| ai-video-tool | [#236](https://github.com/fendifrost-dot/ai-video-tool/pull/236) | AVT mirrors CC's cost bound exactly; MCP catalog regenerated |

Earlier PRs from the first pass: CC #46 and #48–#53; AVT #231–#234.

Key files:
- **CC:** `supabase/functions/image-providers-gemini-generate/{answerStream.ts,contract.ts,run.ts}` and their `*.test.ts`.
- **AVT:** `supabase/functions/world-still-proxy/{gemini.ts,index.ts,gemini.test.ts}`.

## Reproducible measurements

[`scripts/bench/`](scripts/bench/) is the Deno memory benchmark.
- Run `server.ts` (a local fake Google) and `rbench.ts` (real `fetch`) through `rrun.sh`; it reports the median of 5 runs.
- It expects copies of the CC function files in `main/` (old) and `new/` (fixed) next to the scripts.
- Results are in the handoff §1a.

[`scripts/storage_probe/`](scripts/storage_probe/) is the real storage API probe, run with disposable anonymous test identities against a 1×1 PNG.
- Outputs: [`data/storage_probe_before.json`](data/storage_probe_before.json) (before the migration), [`after`](data/storage_probe_after.json) and [`cleanup`](data/storage_probe_cleanup.json).
- The cleanup run shows the CDN-cache residual described in the SEC-4 evidence.
- The state file holding test-session tokens is deliberately not included.

## Images

The original portrait and every generated image show a real person. They are **not committed** here, because this repository is public.
- They are shared privately; ask the repo owner for access.
- Match the files you receive against the SHA-256 values in [`IMAGE_MANIFEST.md`](IMAGE_MANIFEST.md).
- In AVT they live in the private `project-references` / `prop-refs` buckets under the asset ids listed in the manifest.

## Questions worth a second opinion

1. **Memory crashes.** Is the streamed-answer design sound? Is the evidence (a Deno benchmark plus 6 live runs with 0 crashes) enough?
2. **`MAX_TOKENS`.** Is the interim-image hypothesis the right explanation, and is 8,192 a proportionate fix? It is not yet proven.
3. **SEC-4.** Are the owner-only policies plus the legacy grants table correct? Is anything still open on these two buckets?
4. **Continuity.** Why does identity drift younger and narrower even with the original portrait as `<IMAGE_0>` on every call? Is the recommended reference strategy (original plus cropped, faceless guides only) the right next step?
