# Gemini stills reliability, storage SEC-4 and live continuity: 12 Oct 2026 (second pass)

Labels: **VERIFIED** (proven; the evidence is cited), **OBSERVED**, **HYPOTHESIS**, **DECISION**, **RECOMMENDATION**.
Earlier run: [`GEMINI_VALIDATION_2026-10-12.md`](GEMINI_VALIDATION_2026-10-12.md).

## Status

| Thing | State |
|---|---|
| CC streaming request and answer (#55, `26f9ccd`) | merged · edge-deployed · live-verified |
| CC reference cap sized to Google's 20 MB limit (#56, `f49c78d`) | merged · deployed · live-verified (run 2, 3 references, 13.4 MB) |
| CC output cap 8,192 tokens (#57, `d8955b2`) | merged · deployed · live: 2 runs OK; the root-cause hypothesis is not yet proven |
| AVT recoverable failures, SEC-4 migration, research tools service-role only (#235, `0d88d03`) | merged · migration applied via Lovable SQL · 4 functions deployed · verified |
| AVT exact Gemini cost bound and catalog (#236, `50c6553`) | merged · `world-still-proxy` and `avt-mcp` deployed · verified: a dry-run at `maxCostUsd: 0.2703` answers `cost_gate` |
| Frontend publish | not needed; no frontend change |

## 1. Root causes (Observation → Hypothesis → Test → Result → Conclusion)

### 1a. Paid answers lost to "Memory limit exceeded"

- **Observation.** 4 of 11 paid runs died about 20 s in, after Google had answered. Each answer was about 11 MB for a single 2K image.
- **Hypotheses retired.** Concurrency and warm workers: each request boots a fresh worker.
- **Test.** Deno 2.9.7 with real `fetch` against a separate local server, median of 5 runs, with per-phase memory logs. A Node benchmark was not used as evidence.

  | Version | 1 ref | 2 refs | 3 refs | Full 14 MiB cap |
  |---|---|---|---|---|
  | main (peak RSS above base) | +181 MB | +203 MB | +200 MB | — |
  | fixed | +58 MB | +66 MB | +58 MB | +64 MB |

- **Conclusion.** The peak came from copies made while building the request plus the whole answer held in memory. The fix:
  - streams the request body;
  - reads the answer incrementally, keeping only the final image and small fields;
  - counts large opaque fields but does not keep them.

  Nothing about the request changed: no reference dropped, same quality and model, identity anchor kept.
- **Result (VERIFIED, 6 live submissions).** No worker crash. Peak heap 38.6–55.9 MB. Google accepted the streamed body (`requestBodyMode: "stream"`). The extra ~7 MB in each answer is `thoughtSignature`, 6.39–7.32 MB per answer (`largeFields`). The earlier hypothesis is now VERIFIED.

### 1b. The identity portrait plus guides was refused (run 2, attempt 1)

- **Observation.** `references_too_large`, before submission, not billed. 7,511,334 + 2,841,677 + 3,009,321 = 13.36 MB against a 12 MiB cap left over from the buffered design.
- **Primary source.** Google: "Inline image data limits your total request size … to 20MB."
- **Fix.** Raise the cap to 14 MiB (~19.6 MB as base64). A serialised body over 20,000,000 bytes is refused before any call.
- **Result (VERIFIED).** The retry with the same three references succeeded.

### 1c. `MAX_TOKENS` with no image (run 4, attempt 1)

- **Observation.** `finishReason: MAX_TOKENS`. Reported output was 1,088 + 680 thinking = 1,768 tokens against a 4,096 cap. No image modality; 557-byte answer. Possibly billed.
- **Primary source.** Google docs say the model draws up to two interim images, "not charged". A 2K image is 1,680 tokens.
- **HYPOTHESIS.** Interim images count toward `maxOutputTokens`.
- **Fix.** Cap raised to 8,192. The model, thinking level, resolution and references are unchanged.
- **Result.** The identical retry and run 5 both succeeded. Both used under 4,096 tokens, so they do **not** prove the hypothesis. It stays a HYPOTHESIS until a run that would have exceeded 4,096 succeeds, or no `MAX_TOKENS` recurs over many runs.

### 1d. Failures recorded as "Gemini failed" and paid images without a record (AVT)

- **Platform crash.** A crash after submission is now `control_center_failed_after_submit`, recorded with `ccHttpStatus`, `ccPlatformCode`, `possiblyBilled` and `reconcile`.
- **Image stored without an asset row.** Keeps `recoverableImagePath`.
- **Upload failure.** Says `image lost: upload failed`.
- **VERIFIED** by mocked tests. A live platform crash was not reproduced, because crashes no longer occur.

## 2. Storage (SEC-4): `prop-refs` and `project-references`

- **Evidence:** [`../evidence/SEC4_STORAGE_2026-10-12.md`](../evidence/SEC4_STORAGE_2026-10-12.md).
- **Rollback:** [`../evidence/SEC4_STORAGE_ROLLBACK.sql`](../evidence/SEC4_STORAGE_ROLLBACK.sql).
- **Review.** An independent AI security reviewer approved the change after two rounds of fixes.

**VERIFIED through the real storage API, with test identities and fixtures only:**

| Before | After |
|---|---|
| Another user could list, download, sign, upload and overwrite; the anon key could list, upload and overwrite. | Both are denied every operation. The owner keeps all operations. |

- The owner still signs files in all 7 legacy anonymous-session folders (206). The test identities were deleted afterwards.
- `grok-video-research-proxy` and `grok-resolution-test` now answer the anon key with 401 `service_role_required` (VERIFIED live).

**Residual.** These can't be revoked by RLS:
- Signed URLs created while the buckets were open stay valid (HYPOTHESIS, open).
- CDN copies cached per requester last up to `max-age` (OBSERVED).

**Still open:** the other 9 buckets, every table, service-role functions that sign caller paths, and SEC-5. See `RISK_REGISTER.md`.

## 3. Live runs: results and limits

Every run used the original approved portrait `3fce9cb5` as `<IMAGE_0>`. "Est." is cost at Google list rates from the returned usage.

| # | Job | Stage | References | Result | Asset | Est. |
|---|---|---|---|---|---|---|
| 1 | `61420be9` | B full length | original + B2 outfit | OK | `3eee45de` | $0.0651 |
| 2a | `c4a31ef9` | C horse | original + R1 + C2 (13.4 MB) | refused before submit (1b) | — | $0 |
| 2b | `71ebdcfa` | C horse | same 3 | OK | `b48306d3` | $0.0635 |
| 3 | `a1688613` | D forest medium | original + R2 | OK | `03d9a1c4` | $0.0620 |
| 4a | `07d06358` | D forest wide | original + R2 | `MAX_TOKENS`, no image (1c) | — | $0.0175 (≤ $0.1475) |
| 4b | `d0beac01` | D forest wide | same | OK | `aebaca89` | $0.0642 |
| 5 | `86b681b1` | D firelight, closer | original + R2 | OK | `31ec27fb` | $0.0630 |

**Production untouched (VERIFIED by query, 21:17 UTC):**
- 0 shots, variations or continuity entities changed.
- The portrait is still `approved`.
- All 5 test assets are `pending` with `shot_id = null`.

## 4. Continuity: independent visual review

The reviewer viewed every image at full resolution against the original portrait.
Images are shared privately, not in this public repo; checksums are in [`../review/gemini_2026-10-12/IMAGE_MANIFEST.md`](../review/gemini_2026-10-12/IMAGE_MANIFEST.md).

| | Realism | Identity | Wardrobe | Anatomy | Lighting | Treatment | Verdict |
|---|---|---|---|---|---|---|---|
| R1 | PASS | PARTIAL (face slightly longer and narrower) | PARTIAL (sport gloves, not thin leather) | PASS | PASS | **FAIL**: monogram-like emblem on the whip collar | reference only after retouch |
| R2 | PASS | PARTIAL (slimmer, looks late 20s) | PASS | PARTIAL (rider oversized, dangling rein loop) | PASS | PASS | test only |
| R3 | PARTIAL (airbrushed) | **FAIL** (looks early-to-mid 20s, eyeliner, piercings) | PASS | PARTIAL | **FAIL** (front-lit, pasted on fire) | PASS | reject |
| R4b | PARTIAL (hoof artifacts) | **FAIL** (younger, hoop earring) | PASS | PARTIAL (standing, not walking) | PARTIAL | PASS | reject |
| R5 | PARTIAL (contour and gloss) | PARTIAL (closest at night, still slimmer) | PASS | **FAIL** (horse head disconnected) | **FAIL** (key on her right, cool fill) | PASS | reject |

**Ground-level forest:** no YSL lettering, monogram, logo or logo-shaped clearing in R3, R4b or R5 (VERIFIED by both reviews).

**DECISION.** R1 was passed forward as the outfit guide for R2 before its whip emblem was found. R2 has no whip. R3, R4b and R5 were not passed forward.

**Conclusion (OBSERVED, 5 images).** Identity drift is systematic and goes one way: younger, narrower jaw and nose, more "glam" makeup and jewellery.
- It persists **even with the original portrait as `<IMAGE_0>` on every call**, once a generated guide is also attached.
- It is worst at night and at distance.

## 5. Spend and billing

| | Amount |
|---|---|
| Estimated, this pass | **≈ $0.34** (≈ $0.36 if run 4a's tokens were billed at the image rate) |
| Upper bound, this pass | $1.13 (4 × $0.147456 + 2 × $0.270336) |
| Cap authorised | $3.00 |
| Verified | **none**. No billing-console access; the invoice is unknown |

- Read Google AI Studio / Cloud Billing usage for 12 Oct to replace these estimates.
- Auto-reload: no Google payment, receipt or reload email between 9 and 12 Oct (Gmail, searched 21:17 UTC). This is not evidence of the balance or of which billing account sits behind `Frost_Gemini`.
- No top-ups, settings changes or provider switches were made.

## 6. Remaining steps

- **Billing reconciliation** (see §5).
- **RECOMMENDATION, creative.** Before more paid runs:
  1. Stop attaching generated images as guides for stages where the face is visible. Pass only the original portrait plus non-face guides: crop guides to the outfit, horse or tack.
  2. Add age, jaw width and "no makeup change, no jewellery" constraints. The R5 prompt partly did this and was the closest night result.
  3. Judge each stage against the original portrait, not the previous output.
  4. Retouch or regenerate R1 without the whip emblem before any reference use.
- **RECOMMENDATION, technical.** Watch for `MAX_TOKENS` at 8,192; if it recurs, the hypothesis is wrong. If `thinkingLevel` is ever changed, that needs its own Class C quality benchmark.

## 7. What not to do

- Don't promote any test asset, or change the cast reference, shots, locks, treatment, timing or exports, based on this pass.
- Don't retry a `possiblyBilled` job automatically. Reconcile it first: CC `tool_execution_logs` where `args->>'jobRowId'` is the job.
- Don't edit the SEC-4 migration so that it "runs". A mismatch means the live database differs.
- Don't log or commit signed URLs.
