# AVT Video-Swap Pipeline — Read-Only Audit (finalized, five-way classified)

**Date:** 2026-08-02 (finalized 2026-08-05) · **Auditor branch:** `worktree-audit-readonly` off `origin/main` @ `3e7bad5`
**Scope:** repo + T7 only. No code changed, no PR merged, no deploy touched.
**Method:** live call-graph trace + PR diff review (I read `cf8a8c1`/`3e7c061` for PR #16), three parallel evidence agents (security, durability, data-model), and independent verification of the highest-severity claims.

### Five-way classification (applied inline to every finding)
- **VERIFIED** — I (or an agent) read the exact code/migration; the claim is directly confirmed.
- **OBSERVED** — a factual state seen from tool output (git/gh, file presence/absence, test counts) or a stated limitation, not causally traced deeper.
- **HYPOTHESIS** — an inference about impact/exploitability/behavior that is *not* directly proven.
- **DECISION** — an intentional design choice recorded in the code/docs (attributes intent; not a judgment).
- **RECOMMENDATION** — prescriptive guidance, not a finding of fact.

Each finding also keeps an **EVIDENCE** (VERIFIED/INFERRED) + **CONFIDENCE** (high/med/low) note. "DoD-in-reverse" flags where the *written* confidence in code/docs runs ahead of the evidence.

---

## TL;DR verdicts

- **PR #15 (warp-worker)** — Proves the **temporal/compositing machinery**, NOT garment transfer. Standalone `argparse` CLI, zero wiring into `src/`/`supabase/`/CI → not invocable in prod. `[VERIFIED]` research scope + prod-safety; `[RECOMMENDATION]` hold as isolated prototype.
- **PR #16 (compat gate)** — FIX 1 (asset-authoritative) sound `[VERIFIED]`. **FIX 2 collapses three distinct concepts into one binary `incompatible` verdict and hard-gates HDR despite Fal accepting an HDR 720p clip** `[VERIFIED]`; `[RECOMMENDATION]` FIX 1 ready, FIX 2 not.
- **Live path** — UI defaults to **Lane A** whose propagation engine is `disabled` by default → it blocks. The headline lane ships **inert** `[VERIFIED mechanism]` / `[DECISION]` to block-not-fake.
- **Biggest risk is not in either PR** — a DEV-ONLY migration on `main` opens RLS to `anon` (`USING(true)`), never reverted (SEC-1) `[VERIFIED]`. Full P0 forensic in the companion file.

---

## 1. LIVE ARCHITECTURE TRACE

**UI trigger → call graph** — `[VERIFIED]` · EVIDENCE VERIFIED · CONFIDENCE high

```
HeroFrameStudioPage.tsx:795  <WardrobeVideoLaneRunner/>
  → src/components/video/WardrobeVideoLaneRunner.tsx  (default lane = "A", :87)
     A → runLaneARoundtrip()      src/lib/queries/wardrobeVideoFrames.ts:630
     B → runFrameSwapRoundtrip()  :489
     C → runLaneCRoundtrip()      :773
  → edge: wardrobe-video-frame-extract-proxy  (server seek+trim+decode on Fal via CC)
  → edge: wardrobe-video-swap-proxy | -propagate-proxy | -lucy-proxy
  → edge: wardrobe-video-reassemble-proxy
  → Control Center (fal-run / fal-queue-poll) holds FAL_KEY; AVT never does
  → storage project-clips / project-exports; state in project_assets.metadata_json
```

**Lane reality** — `[VERIFIED]` (`WardrobeVideoLaneRunner.tsx:44-74` + proxies) · high

| Lane | UI label | Engine reality |
|------|----------|----------------|
| **A (default)** | "Grok keyframes + temporal propagation (LOCKED)" | Keyframes via `grok-image-garment-proxy`; propagation selected by `WARDROBE_PROP_ENGINE`, **default `disabled`** → blocks (`wardrobe-video-propagate-proxy/index.ts:23,205`). Fal hosts no dense-flow endpoint. |
| **B** | "per-frame VTON (diagnostic)" | `FRAME_SWAP_FAL_MODEL`, fail-fast per-frame swap. Boils. |
| **C** | "Lucy v2v (benchmark)" | `LUCY_V2V_FAL_MODEL`, prompt-driven, **not pixel-preserving**. |

- **A1 — LOCKED headline lane inert by default.** `[VERIFIED mechanism]` + `[DECISION]` (block-not-fake) · EVIDENCE VERIFIED · high. `WARDROBE_PROP_ENGINE` defaults `disabled`; Lane A returns `propagateStatus !== "ready"`. Honest, but the advertised primary path ships non-functional. **DoD-in-reverse:** doc/UI "LOCKED production path" outruns runtime reality (no engine).
- **A2 — Env vars select contradictory transports.** `[VERIFIED]` (paths exist) + `[HYPOTHESIS]` (that `nearest-keyframe` silently ships low quality — untested) · med. `WARDROBE_PROP_ENGINE ∈ {fal-flow, fal-v2v, nearest-keyframe, disabled}` (`propagate:37`).
- **A3 — Lane B obsolete-but-callable.** `[VERIFIED]` (wired in UI dropdown) + `[DECISION]` (kept as diagnostic per LOCKED doc) · high.
- **A4 — Separate hero-frame image pipeline** (`sam_grok_restore`/`masked_inpaint`/`vton`/`guarded_grok`/`grok_image_edit` in `src/lib/queries/heroFrame.ts`) is distinct from the video lanes but shares the page. `[VERIFIED]` · high.
- **A5 — Deploy divergence unknowable from repo.** `[OBSERVED]` (limitation) · see Area 6.

---

## 2. OPEN PR REVIEW

### PR #15 — warp-worker prototype (`feat/warp-worker-prototype`, head `2cef6a9`)

- **Research validity — machinery, not transfer.** `[VERIFIED]` · EVIDENCE VERIFIED · high. Body + artifacts are candid ("Does NOT yet prove the gap is bridged"; QA baseline columns marked **PENDING**). Demonstrates DIS dense flow (fwd+bwd), occlusion+confidence, bidirectional propagation, region composite onto original footage, a second-pass cumulative-residual gate (honest finding: first-pass gate never fires at 60fps sub-pixel motion), persisted status, QA.
- **What it does NOT demonstrate.** `[VERIFIED]` · high. Inputs are **source-frame stand-ins + heuristic masks + CPU DIS**, not real Kolors/Grok/SAM. Identity drift ≈0.022 is vs the SOURCE, not a Kolors baseline (artifact says "at the Kolors baseline is UNPROVEN"). The CLAUDE.md **KILL-CRITERION** is therefore untested.
- **Production safety — not invocable in prod.** `[VERIFIED]` · high. `grep warp_worker/workers` across `src/`,`supabase/`,`docs/`,`.github/` → none. Python `argparse` CLI + `requirements.txt`; no server/edge/CI.
- **Verdict.** `[RECOMMENDATION]` Hold open as an isolated research branch; do not wire until real Kolors/Grok/SAM inputs pass the kill-criterion on a real 121-frame sequence. Per instructions I do not authorize/recommend merging it.

### PR #16 — compat gate + asset-authoritative metadata (`3e7c061`+`cf8a8c1`)

- **FIX 1 — asset-authoritative source resolution.** `[VERIFIED]` · high. Root cause correct (signed-URL probe returns empty width/height on large masters → `planPreflight` never ran → preflight block persisted null). New `readAssetSourceMedia()`+`resolveSourceProbe()` make the asset row authoritative field-by-field with provenance; `planPreflight` now always runs. Tests (a)/(b)/(c) lock it. No config/migration changes. **Merge-ready.**

- **FIX 2 — the three-way conflation.** `[VERIFIED]` · EVIDENCE VERIFIED · high. The gate is **binary**: `assessProcessingCompatibility()` pushes any tripped factor into one `reasons[]`; `planPreflight` does `needsProcessing = !compat.compatible; transport = needsProcessing ? "non_fal_transcode" : …` (vp2:355-424, 748-791). Transports are `passthrough | fal_scale | non_fal_transcode` — **none means "processable on Fal but at quality risk."**

  | Concept | Should mean | vp2 treatment |
  |---|---|---|
  | **(a) TRANSPORT incompatible** | cannot be processed at all (multi-GB 4K HEVC/10-bit master → undecodable) | ✅ correct `non_fal_transcode` target |
  | **(b) QUALITY-RISK normalization** | Fal *can* process it; color may render wrong | ❌ **no transport for this** — HDR forced into (a) |
  | **(c) CONFIRMED incompatible** | proven by a failed controlled test | ❌ not modeled; verdicts asserted from theory |

- **HDR-specific defect.** `[VERIFIED]` · high. `assessProcessingCompatibility` (vp2:388-393): **any** HDR source (any resolution/codec) → `incompatible → non_fal_transcode`, `falCanProcess:false`. This contradicts (i) the **controlled test** `[OBSERVED]` (task-provided: HDR 720p ACCEPTED by Fal) and (ii) vp2's **own** `maybeTonemapNote` (vp2:598-604) which still returns `tonemap:false` + warns "HDR passed through as-is; NOT tonemapped … acceptance ≠ correctness." One HDR plan therefore says both `non_fal_transcode/incompatible` **and** "passed through, not tonemapped." **Self-contradictory in one module.**
- **Evidence overreach.** `[VERIFIED]` (absence of isolated test) + **DoD-in-reverse**. The PR's "verified evidence" is a 4K HEVC/10-bit/HDR **bundle** (HEVC>1080p ∧ 10-bit ∧ oversize already trip the gate); HDR as an *independent* blocker is generalized with no isolated test.
- **Test masks it.** `[VERIFIED]` · high. `planPreflight — HDR passthrough + tonemap hook` (`videoPreflight.test.ts:219`) uses a **1080p HEVC HDR** source, asserts only `tonemap===false` + tags, **never asserts transport** → the `non_fal_transcode` result is unasserted and the test *name* describes behavior the code doesn't produce. No test for a sub-1080p HDR **H.264** clip (the accepted case).
- **Back-compat.** `[VERIFIED]` · high. Deprecated aliases retained; status string kept `"needs_transcode"`; `PREFLIGHT_VERSION vp1→vp2`, new `COMPATIBILITY_VERSION cg1`. No contract broken.
- **Verdict.** `[RECOMMENDATION]` FIX 1 merge-ready; FIX 2 needs a third verdict tier (quality-risk → process-on-Fal + flag) before merge.

---

## 3. SECURITY & OWNERSHIP  *(agent-gathered; SEC-1 independently re-verified — full forensic in companion file)*

**config.toml `verify_jwt=false`:** compose-look-callback, faceswap-callback, **train-style-lora-proxy**, train-style-lora-callback, grok-resolution-test. Others default true. Caveat `[DECISION]`: Lovable **anonymous auth** means "valid JWT" can be a throwaway anon user — JWT presence is not an authorization boundary.

| ID | Sev | Finding | Class | EVIDENCE·Conf |
|----|-----|---------|-------|---------------|
| **SEC-1** | **CRIT** | Anon-open RLS (`USING(true)`) on **artists, character_features, artist_looks, location_library, prop_library** + **look-composites** bucket via `20260523171003_*.sql`; no later re-lock (independently confirmed). | **VERIFIED**; impact-in-prod = **HYPOTHESIS** (dashboard) | VERIFIED · high |
| **SEC-2** | **CRIT** | `train-style-lora-proxy` fully unauthenticated yet UPDATEs `artists` via service role + launches paid Fal training with attacker `zip_url`/`artist_id`. | **VERIFIED** | VERIFIED · high |
| **SEC-3** | **CRIT** | `train-style-lora-callback` Fal branch requires no secret → fake "training done" with attacker LoRA URL → identity poisoning. | **VERIFIED** | VERIFIED · high |
| **SEC-4** | HIGH | IDOR: `sam3-segment-proxy` signs caller `scenePath`/`sceneBucket` via service role, no `${userId}/` guard → cross-tenant exfil. | **VERIFIED**; exploit = **HYPOTHESIS** (needs UUIDs; SEC-1 leaks them) | VERIFIED · high |
| **SEC-5** | HIGH | IDOR + xAI spend: `grok-image-garment-proxy` wardrobe read by `artist_id` only + signs arbitrary `scenePath`. (Strips token before logging.) | **VERIFIED**; exploit = **HYPOTHESIS** | VERIFIED · high/med |
| **SEC-6** | HIGH | `grok-resolution-test` accepts the public anon key as bearer; reads arbitrary `video_projects`, spends xAI. Code self-flags "DELETE THIS FUNCTION." | **VERIFIED** + **DECISION** (self-flagged) | VERIFIED · high |
| **SEC-7** | MED | Same missing-prefix IDOR in `faceswap-proxy`,`wardrobe-vton-proxy`,`jacket-inpaint-proxy`; `compose-look-proxy` ownership 403 **commented out**. | **VERIFIED** + **DECISION** (check disabled for anon-auth churn) | VERIFIED · med-high |

**Positive controls** `[VERIFIED]` · high: wardrobe-video-* proxies enforce master ownership (`asset.user_id!==userId→403`) + `startsWith(\`${userId}/\`)` path guards; `project_assets`/`provider_jobs` are correctly `user_id=auth.uid()` RLS-scoped; callbacks use constant-time X-Proxy-Secret; no secret values logged; FAL_KEY not on AVT `[DECISION]`; signed-URL TTLs 45–60 min.

---

## 4. DURABILITY  *(agent-gathered, mechanisms quoted)*

**Structural** `[VERIFIED]` + `[DECISION]` (interim): every dispatch runs in `EdgeRuntime.waitUntil(finish())` — fire-and-forget, not the durable queue the LOCKED arch requires (swap:340, propagate:514, extract:667, reassemble:299, lucy:358; propagate README admits "Durable queue: still waitUntil for now").

| ID | Sev | Gap | Class | Conf |
|----|-----|-----|-------|------|
| **DUR-1** | HIGH | `wardrobe-video-swap-proxy` fail-fast, no per-frame status, no resume (`while(!failure)`:278, `throw failure`:320). One bad frame kills job; re-invoke re-swaps from 0. | **VERIFIED** | high |
| **DUR-2** | HIGH | No stale-state reaper for any video status; a dead `waitUntil` leaves the row `"processing"` forever. Only reaper targets `artist_looks`, not `project_assets`. | **VERIFIED** | high |
| **DUR-3** | HIGH | No cancellation anywhere — no endpoint/abort-flag/UI. Once dispatched, unstoppable. | **VERIFIED** | high |
| **DUR-4** | MED-HIGH | No server-side duplicate-job guard; only client `disabled={running}`. Second tab / re-invoke clobbers `metadata_json`. | **VERIFIED**; concurrency-clobber = **HYPOTHESIS** (race) | med-high |
| **DUR-5** | MED | `provider_jobs` `(provider,external_job_id)` index is **non-unique**; idempotency is app-level only. | **VERIFIED** | high |

**Handled well** `[VERIFIED]` · high: frame-extract (deterministic `extractionId`, skip-if-exists, manifest-by-listing, `upsert`); propagate (per-frame resume, skip `done`, failure capture, `ready`/`incomplete` rollup, bounded retries — but `[HYPOTHESIS]` no backoff may thrash); `ingest-provider-job` idempotency; bounded 12-min polling. **Propagate is the pattern swap should copy** `[RECOMMENDATION]`.

---

## 5. DATA-MODEL CONSISTENCY  *(agent-gathered)*

| ID | Sev | Finding | Class | Conf |
|----|-----|---------|-------|------|
| **DM-1** | MED | Single `metadata_json` blob, unconditional read-modify-write across 6 lanes + `persistFalDiagnostic`; no lock/`jsonb_set`. `propagate_frames` re-serialized every frame flush (O(n²) writes). | **VERIFIED**; cross-lane clobber = **HYPOTHESIS** | high |
| **DM-2** | MED | Overlapping status: `*_status` free-form JSON strings (no enum) vs `needsProcessing` bool vs deprecated `transcodeRequired` vs typed `provider_jobs.status`; jacket-inpaint failure written in 3 places. | **VERIFIED** | high |
| **DM-3** | MED | Benchmark versioned by folder/id string only (`wardrobe-swap-v1`); heavy inputs off-git on T7, no content hash → media can change without a version bump. | **VERIFIED** | high |
| **DM-4** | MED | No artifact byte-checksums (only FNV of the config *string*); no seed / mask-version / pinned model version despite `VIDEO_SWAP_ARCHITECTURE.md:103` demanding them. **DoD-in-reverse.** | **VERIFIED** | high |
| **DM-5** | MED | Mutable assets silently invalidate experiments: `upsert` re-upload overwrites bytes; re-probe overwrites `metadata_json`; referrers keep id/path only, no hash. `version_number`/`parent_asset_id` exist but unused for immutability. | **VERIFIED** (mechanism) / **HYPOTHESIS** (silent-invalidation impact) | high/med |

---

## 6. DEPLOYMENT DRIFT

**From git/gh** `[OBSERVED]` · high:
- `origin/main` @ `3e7bad5` (=PR #14). Open PRs: **#16** (head `cf8a8c1`, 2 commits ahead, MERGEABLE/CLEAN), **#15** (head `2cef6a9`, MERGEABLE/CLEAN), **#3** (stale 2026-06-05, MERGEABLE — `[RECOMMENDATION]` triage/close).
- **No `.github/workflows/` — no CI.** "563 passing"/"32 pass" are local `vitest`, not merge-gated. PR #16 touches no config/migrations.
- `AVT_POST_DEPLOY_CHECKLIST.md` confirms manual Lovable flow (redeploy each edge fn, then Publish) — Publish ≠ edge redeploy.

**Requires dashboard access — `[HYPOTHESIS]`/unknown, not guessed:**
1. Whether deployed edge fns match `main` (esp. PR #16's `videoPreflight.ts`).
2. Live value of **`WARDROBE_PROP_ENGINE`** (+ `PROPAGATION_/FRAME_SWAP_/LUCY_V2V_FAL_MODEL`).
3. Whether **SEC-1 open-RLS is actually applied** on live DB `qoyxgnkvjukovkrvdaiq`; look-composites public in prod.
4. Which edge fns were last redeployed and when.
5. Whether `config.toml` `verify_jwt` overrides are the live settings.
6. Existence/values of live secrets.
7. Whether the published frontend matches latest `main`.

---

## Test taxonomy — what "≈570 passing" covers

Independent count: **529** `it()/test()` across **44** files on `main` `[OBSERVED]` (grep may undercount parametrized cases). PR #16 raises videoPreflight 20→**32** (~541 vitest); authors report **563** vitest; **PR #15 adds 27 Python `test_*`** (~590 total). `[VERIFIED]`

| Bucket | ~Count | What it is | Class |
|--------|--------|-----------|-------|
| **Unit** (pure, hermetic) | ~470 | all `_shared/*` + pure `src/lib` (compiler, logoComposite, urlValidator, placementEngine, mp4Demux via synthetic byte fixtures…). "http" strings are literal test data. | VERIFIED |
| **Integration** (mocked Supabase/fetch) | ~60 | providerJobs/api, queries/looks, dispatchScrubProxy, wardrobeVideoFrames, queries/artists, component render. All mocks. | VERIFIED |
| **Live-provider** (real Fal/CC/Grok/xAI) | **0** | none | VERIFIED |
| **Real-media-benchmark** (real T7 clip/frames) | **0** | benchmark is docs+T7 media, not an automated test | VERIFIED |
| **Deployed-smoke** (hits live app/edge) | **0** | `src/test/smoke.test.ts` = `expect(1+1).toBe(2)` | VERIFIED |

**NOT validated by any test** `[VERIFIED]` · high: real garment propagation quality; real SAM masks; real Grok corrections; a real 121-frame Kolors sequence; the KILL-CRITERION; cloud/edge deploy; runtime RLS/ownership; end-to-end resume-after-crash; cancellation; full-shot QA; the HDR-720p-accepted case. PR #15's Python tests exercise the temporal harness on stand-in inputs, not the transfer.

---

## Ranked risks `[RECOMMENDATION]`

1. **SEC-1 (CRIT):** anon-open RLS on identity/wardrobe tables + bucket, unreverted on `main` — full cross-tenant read/write with the public key **if applied in prod**.
2. **SEC-2 / SEC-3 (CRIT):** unauthenticated paid-training trigger + LoRA identity poisoning.
3. **SEC-4..6 (HIGH):** service-role IDOR + xAI-spend endpoints; delete `grok-resolution-test`.
4. **A1 (HIGH, product-integrity):** LOCKED default Lane A inert without an engine that doesn't exist on Fal.
5. **PR #16 FIX 2 (HIGH, correctness):** three-way conflation; HDR/10-bit hard-gated despite Fal acceptance.
6. **DUR-1..3 (HIGH):** swap fail-fast + no reaper + no cancellation on fire-and-forget runtime.
7. **DUR-4 / DM-1 (MED-HIGH):** duplicate dispatch clobbers the shared `metadata_json` blob.
8. **DM-3..5 (MED):** no hashing/seed/mask-version, mutable-asset invalidation, unversioned benchmark media.

Companion files: `RLS_FORENSIC_P0_2026-08-05.md`, `REMEDIATION_PLANS_2026-08-05.md`.
