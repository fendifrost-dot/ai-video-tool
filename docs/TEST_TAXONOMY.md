# TEST_TAXONOMY.md — how AVT's tests are classified and reported

> **Standing rule (do not break):** AVT's test count is **ALWAYS reported BY
> CATEGORY**, never as a single "N passing" headline. A bare "570 tests passing"
> implies production validation the suite does not provide — because **0** of those
> tests touch a live provider, real media, or a deployed environment. Report the
> five numbers, or report none.

Last verified: **2026-08-05** (categorized by hand from the actual suite;
numbers reproducible via the commands below).

---

## The five categories

| Category | Definition | Runs against | Count |
|----------|------------|--------------|------:|
| **Unit** | Pure functions / modules; no test double for an I/O boundary (in-memory fixtures only). | Nothing external | **539** |
| **Integration (mocked)** | Exercises a seam across modules **with a test double** for an external boundary — Supabase client, storage, or `fetch` — or renders a component wiring several real modules. **No live network.** | Mocks / stubs | **31** |
| **Provider-Live** | Actually calls Fal / Grok / xAI (or a sandbox thereof) and asserts on the real response contract. | Live provider APIs | **0** |
| **Real-Media-Benchmark** | Runs the real pipeline on real T7 benchmark media and asserts on output fidelity (identity, garment, stripe/logo, flicker). | Real footage + real compute | **0** |
| **Deployment-Smoke** | Hits a deployed edge function / published frontend and asserts it is live and correctly wired (incl. RLS: an `anon` client is *denied*). | Deployed environment | **0** |
| | | **TOTAL** | **570** |

**Headline, stated correctly:**
> **570 automated tests: 539 unit, 31 mocked-integration, 0 provider-live,
> 0 real-media-benchmark, 0 deployment-smoke.**

The three zeros are the whole point. The suite proves our **pure logic** is correct.
It proves **nothing** about whether a provider call succeeds, whether a real garment
swap holds fidelity, or whether the deployed schema enforces RLS. Do not let a large
unit number stand in for validation it cannot provide.

---

## Why the split is drawn where it is

**Unit vs Integration (mocked)** is drawn at a single reproducible line: a test is
**Integration (mocked)** if and only if it installs a test double (`vi.mock` /
`vi.stubGlobal`) for an external boundary — the Supabase client, storage, or global
`fetch` — or renders a React component that wires multiple real modules together.
Everything else is **Unit**.

Under that rule, exactly **three files** are Integration (mocked):

| File | Cases | Why it's integration |
|------|------:|----------------------|
| `src/lib/providerJobs/api.test.ts` | 18 | `vi.mock`s the Supabase client + storage and `vi.stubGlobal`s `fetch` |
| `src/lib/video/dispatchScrubProxy.test.ts` | 11 | `vi.mock`s the Supabase client (`functions.invoke`) |
| `src/components/library/MultiAngleGallery.test.tsx` | 2 | React component render; mocks storage / image-normalize / UI / `sonner` |
| **Total** | **31** | |

The remaining **41** files (**539** cases) are Unit — pure helpers and validators.
Notably, several *security-relevant* and *provider-contract* tests are Unit, not
Integration, because they exercise **pure** functions with no I/O double:
- `src/lib/edgeFunctions/urlValidator.test.ts` (55) — the SSRF guard is a synchronous
  validator; the tests never open a socket.
- `supabase/functions/_shared/*.test.ts` (10 files) — these test **pure request-body
  builders and classifiers** (`buildFrameSwapBody`, `classifyFalFailure`,
  `decideCompatibility`, `buildComposeTracks`, …). They assert the *shape* of the
  contract we would send Fal/Grok; they do **not** call the provider. That is exactly
  why **Provider-Live = 0**.

> This boundary supersedes the earlier pre-API audit's rough estimate
> (~472 unit / ~61 mocked-integration on a ~533-case suite). The suite has since
> grown to **570**, and this document draws the unit/integration line at the single
> testable criterion above rather than by eyeballing. The **0 / 0 / 0** for the live
> categories is unchanged and is the load-bearing fact.

---

## Reproduce the counts

Run from the repo root. **Exclude sibling git worktrees** — Vitest's default glob
otherwise scans `.claude/worktrees/*` full-repo copies and multiplies the numbers
(e.g. reports 132 files / 1672 tests instead of 44 / 570).

```bash
# Total + per-category base (44 files, 570 cases)
npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'

# Which files are Integration (mocked): the only ones installing an I/O double
rg -l 'vi\.mock\(|vi\.stubGlobal\(' src supabase --glob '*.test.ts*' | grep -v worktrees
```

Everything Vitest reports that is **not** in that `rg` list is Unit.

**Not counted here:** the Python suite under `workers/` (22 tests, gate / keyframe
plan / status / brand geometry + a synthetic smoke) lives only on the
`feat/warp-worker-prototype` branch (PR #15) and belongs to a **research prototype**,
not the product. It is excluded from the product headline on purpose — see the
warp-worker reclassification in PR #15 and `RISK_REGISTER.md`.

---

## No CI gates these today (Track-B item)

There is **no CI workflow** running this suite on push/PR. `npm test` (`vitest run`)
is a local/manual gate only. Consequences:
- A red suite does not block a merge.
- The **0** live/real-media/deploy categories are not just empty — nothing would
  notice if they *stayed* empty while the product shipped.
- **Adding a CI workflow that runs the categorized suite (and, once they exist, the
  RLS integration tests) and blocks merge is a standing Track-B task.** Until then,
  every report of test health must repeat the by-category split and the "no CI"
  caveat.
