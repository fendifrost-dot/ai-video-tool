# Gemini reliability, storage isolation and character continuity: 12 Oct 2026, third round (consolidated handoff)

Labels: **VERIFIED** (proven; evidence cited) / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.
Earlier rounds: [`GEMINI_RELIABILITY_2026-10-12.md`](GEMINI_RELIABILITY_2026-10-12.md), [`GEMINI_VALIDATION_2026-10-12.md`](GEMINI_VALIDATION_2026-10-12.md).
Review bundle: [`../review/gemini_2026-10-12/`](../review/gemini_2026-10-12/).

This round took the independent review's findings on AVT `3ccf59b` / CC `eb8397f` as claims, reproduced or refuted each,
fixed what reproduced, had the fixes reviewed independently, merged, redeployed through Lovable and verified live.

## 1. Fixed vs unresolved

| Area | State | Evidence |
|---|---|---|
| Service-role proxies signing caller-supplied paths without ownership (sam3 + 14 equivalents) | **FIXED, LIVE** (AVT #240 `42eb608`, deployed 23:35 UTC) | §4 live probe |
| Row-derived artist paths tied only to `body.artistId` (5 routes) | **FIXED, LIVE** (same PR, review round `32dbe97`) | code; `callerOwnsArtist` |
| SEC-4 migration preflight checking one policy only | **FIXED** (full policy set in preflight) + `docs/evidence/SEC4_STORAGE_VERIFY.sql` (full after-state) | ran live 12 Oct: passes |
| Paid result durability: intent before call, staged outcomes, recovery without regeneration | **FIXED, LIVE** (`world-still-proxy`) | mocked failure tests; live intent marker checked in §4 |
| CC `finishLog` ignoring DB-update errors | **FIXED, LIVE** (CC #59 `88bfb65`, deployed) | `auditFinalized` in the response |
| Streaming parser: invalid escapes / control chars in discarded strings; `\u` escapes in image base64; `__proto__`; depth; quadratic escape scan; invalid UTF-8 in discarded strings | **FIXED, LIVE** | 96 CC tests incl. a 2 MB escape-run timing test |
| `decodeImage` accepting a 12-byte fake JPEG | **FIXED, LIVE**: 512-byte floor (`image_too_small`), magic vs MIME, trailer reported | tests |
| Cost claim ($0.270336) | **RE-LABELLED, LIVE**: conditional estimate, not a ceiling (`costIsUpperBound:false`, `costBoundConditional:true`) in CC code, AVT basis string, and this doc | dry run §4 |
| Memory benchmark reproducibility | **FIXED**: `scripts/bench/gemini-memory/run.sh <rev> <refs> <mode>` from pinned git revisions | §4 |
| `asset-derivative` (new) | coded, deployed; first live calls refused the row (enum) → fix in AVT #241 (pending merge + redeploy) | §4 |
| MAX_TOKENS root cause (interim image) | **UNRESOLVED / HYPOTHESIS**: one run only, never reproduced; the 8,192 cap is a mitigation, not a proof | as before |
| Google invoice reconciliation | **UNRESOLVED**: no API to read the invoice; all paid rows carry `billed: "unknown"` | — |
| `compose-look-proxy` row-derived prop/product paths; `_shared/logoComposite.ts`; ten buckets still open (`single_tenant_storage` + `*_open_test`, incl. `product-assets`); provider-side fetch of caller-supplied URLs; table-level SEC-4; SEC-5 | **UNRESOLVED, explicit residuals** | reviewer INFO 8; live policy listing |
| `wardrobe-vton-proxy` two pre-existing TS type errors on `main` | **UNRESOLVED** (bundler tolerates them; `deno check` does not) | — |
| 22 other `finishLog` callers discarding the boolean | **UNRESOLVED** (compatible) | reviewer INFO |

## 2. Review findings: confirmed, refuted, narrowed

| Finding (review of 3ccf59b / eb8397f) | Verdict | Note |
|---|---|---|
| sam3 signs caller-supplied bucket/path with service role, no ownership | **CONFIRMED** | plus 14 equivalents found by audit |
| Migration guard checks one policy's name/role/cmd | **CONFIRMED** | preflight + verify SQL |
| Invalid escapes / literal newlines in discarded >64 KiB strings accepted | **CONFIRMED** (failing test first) | |
| Valid `\u` escapes inside image base64 rejected | **CONFIRMED** | now every legal escape resolved |
| `__proto__` key mutates prototype | **CONFIRMED** | own property now |
| `decodeImage` accepts 12-byte fake JPEG | **CONFIRMED** | |
| Success accepts image with non-STOP finish reason | **CONFIRMED as behaviour; DECISION kept**: a structurally valid image is returned and flagged `finishReasonUnusual` rather than discarded (discarding would lose a paid image) | |
| "No CC audit row means Google never called" | **NARROWED**: usually CC refused before calling; an audit-write failure is also possible → `billed: unknown` | |
| $0.270336 is a guaranteed ceiling | **REFUTED as stated**: it is a list-rate estimate conditional on billed output ≤ 8,192 tokens and input ≤ 16,384, neither verified against an invoice | |
| MAX_TOKENS caused by an interim image | **NEITHER** (unproven, one occurrence) | |
| First-pass B2/C1/C2 passed too generously; narrower face / younger / jewellery recur; R1 emblem monogram-like; R5 horse ambiguous | accepted as **OBSERVED** by the independent reviewer; addressed by experiment 3's design (§5) | |
| Second independent review of this round's PRs | 2 MED + 3 LOW (CC), 2 MED + 3 LOW + 4 INFO (AVT): all fixed except one INFO residual | PR bodies list them |

## 3. PRs, commits, deployment verification

| Repo | PR | Merge SHA | Deployed by Lovable | Verification |
|---|---|---|---|---|
| CC | #59 | `88bfb65` | `image-providers-gemini-generate` source_sha256 `a0ff6c46…` (23:34 UTC) | dry run through AVT returns `costBoundConditional:true`, new `costBasis` string |
| AVT | #240 | `42eb608` | 17 functions (list in PR), all succeeded (23:35 UTC) | live probe §4 |
| AVT | #241 | pending | `asset-derivative` to redeploy after merge | §4 |

Lovable auto-commits on both mains after the deploys (not mine): AVT `e2b1d04`/`f1df4c2` retyped `gemini.test.ts` (adopted on the branch); CC `adc68cc`/`8f24689` regenerated `src/integrations/supabase/types.ts`.

**Not done / not needed:** no frontend Publish (no frontend change); no SQL run this round except read-only verification.

## 4. Test evidence (incl. failure paths)

- CC: vitest 96/96; `tsc --noEmit`; `deno check`. Failure paths: malformed escapes, control chars, invalid UTF-8 in discarded strings, depth/container limits, header-only image (`image_too_small`, `possiblyBilled`), MAX_TOKENS with image (returned, flagged).
- AVT: full suite 2634 passed / 1 skipped; edge functions 535/535. Failure paths: intent-write failure sends nothing (`job_submission_record_failed`); finalize failure → `finalized:false` after one retry; recovery refusals (`nothing_recoverable`, `recoverable_path_forbidden` incl. other-project and `..` paths, `recoverable_object_missing`, `gemini_job_not_found`); lost finalize race → `duplicate:true`; `callerOwnsArtist` lookup error → refusal; two-segment legacy key refused.
- **Live proxy probe** ([`data/proxy_probe_2026-10-12.json`](../review/gemini_2026-10-12/data/proxy_probe_2026-10-12.json)): fresh anonymous identity A, bare publishable key, owner. 11/11 expected. Owner + legacy-grant folder → gate passes, 404 on missing object, no provider call; owner + non-granted uid → 403.
- **SEC-4 verify SQL** run live 12 Oct: full policy set, literal bucket pins on every other policy, `storage.prefixes`, grants table (authenticated and anon cannot read), predicate privileges, private buckets: OK.
- **Benchmark** (`scripts/bench/gemini-memory/run.sh`, medians of 3): `64c6c50` buffered 1 ref +166.5 MB peak RSS; current streamed 1 ref +57–62 MB; 3 refs +59 MB. Peak is polled every 5 ms and is a lower bound (the poll cannot fire during long synchronous stretches); phase marks are reported separately.
- Deployed Gemini path (free dry run, 1 reference): `ok`, `modelAccessVerified`, `estimatedCostUsd 0.270336`, `costIsUpperBound:false`, `costBoundConditional:true`.

## 5. Character comparison (experiment 3)

Protocol (written before any paid run): [`EXPERIMENT_3_REFERENCE_COMPETITION.md`](../review/gemini_2026-10-12/EXPERIMENT_3_REFERENCE_COMPETITION.md).
Results: _pending (filled after the runs)_. Production selections, treatments, wardrobe locks, timelines, exports and footage: **unchanged**; the ORIGINAL portrait `3fce9cb5…` remains `approved` and the only identity authority.

## 6. Spend

| Item | Estimate (conditional) | Verified charge |
|---|---|---|
| Authorized for the second brief | $3.00 | — |
| Committed before this round (upper bound) | $1.13 | unknown (no invoice access) |
| Remaining before experiment 3 | $1.87 | — |
| Experiment 3 | _pending_ | unknown |

No top-ups, no subscription changes. Gmail: no Google billing or reload mail (checked earlier this session).

## 7. Recommended next production step

_pending experiment 3 verdict._
