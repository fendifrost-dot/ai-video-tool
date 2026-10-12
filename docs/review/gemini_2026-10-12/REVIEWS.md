# Independent reviews run during the work (12 Oct 2026)

Each review was an independent AI reviewer agent, read-only, with no access to the author's reasoning. This page gives each verdict, its findings, and what was done about every finding. Product sign-off came from the owner's brief, not from these reviews.

## 1. CC streaming change: architecture + security (CC #55)

**Verdict:** approve with fixes.
**Reviewer's own checks:** the parser output matched `JSON.parse` on 20,000 fuzzed documents. On Deno 2.9.7, `ReadableStream` request bodies needed no `duplex`. No requirement violations.

| Finding | Action |
|---|---|
| Medium: a runtime that throws on a streamed body would make every run fail (the fallback only caught 411) | Fixed: fall back to Blob on an exception too |
| Medium: if a runtime consumed the reference buffers, the paid call could send empty images silently | Fixed: buffer lengths checked before the paid call (`request_build_failed`) |
| Low: body not cancelled on a parse error | Fixed |
| Low: every final image held in memory | Fixed: only the first final image is held |
| Low: `indexOf` scan cost | Left as is; harmless for Google's answer shape |
| Low: 411 on generateContent is reported as possibly billed | Correct as is; documented |
| Nit: misleading phase name | Fixed |

## 2. AVT recoverability: architecture + security (AVT #235, part 1)

**Verdict:** approve with fixes.
**Questions answered:**
- No call that reached Google can be labelled unbilled.
- No failure can be reported as a success.
- No job can be replayed.
- No secrets or image data are persisted.
- Upload paths are owned by the caller.
- Grok callers are unaffected.

| Finding | Action |
|---|---|
| A refusal code could hide a submission | Fixed: stricter unbilled rule |
| An upload failure loses the paid image | Recorded as "image lost: upload failed" |
| Platform code length not capped | Fixed: code sanitised |
| Gateway 401 is over-counted as possibly billed | Documented (the safe direction) |
| Grok still drops the stored path | Follow-up |

## 3. SEC-4 storage migration: security (AVT #235, part 2), two rounds

**Round 1 verdict:** approve with fixes.

| Finding | Action |
|---|---|
| Check for any storage policy without a bucket filter | Done: none found; all 63 policies captured |
| The grant insert could silently do less, and read its owner from a client-editable table | Fixed: owner fixed in the migration; assert exactly 7 grants |
| Migration not re-runnable | Fixed: drop-if-exists plus a preflight assert |
| The 7 legacy anonymous sessions keep `*_own` access | Recorded in `RISK_REGISTER.md` |
| Fragile function parameter names | Fixed: `$1`/`$2` |
| Rollback text may not match exactly | Live text captured |
| The other 9 buckets stay open | Recorded |

**Round 2 verdict:** approve. One blocker in the evidence doc:

| Finding | Action |
|---|---|
| Signed URLs created while the buckets were open stay valid and can't be revoked by RLS | Fixed: added as an open HYPOTHESIS |
| CDN rule was overstated | Fixed: relabelled OBSERVED |
| 309 vs 310 objects | Count reconciled |
| `config.toml` comment out of date | Fixed |

## 4. Reference cap (CC #56)

**Verdict:** approve.
**Checked by arithmetic:** the worst case is 19,717,676 bytes, under 20,000,000.

| Finding | Action |
|---|---|
| Size check came after `countTokens` | Fixed: moved before both calls |
| Stale comment | Fixed |
| No test that exactly the cap is accepted | Fixed: test added |

## 5. Output-token cap (CC #57 / AVT #236)

**Verdict:** approve with one fix. The interim-image explanation for `MAX_TOKENS` is plausible but a HYPOTHESIS, from one sample.

| Finding | Action |
|---|---|
| AVT's 4-decimal rounding (0.2703) passed requests that CC then refused | Fixed: AVT gates on the exact bound. Verified live: a dry-run at 0.2703 answers `cost_gate` |
| Cost-bound assumption not stated | Labelled in `COST_BASIS` |

## 6. Visual review of the second-pass images (R1–R5)

The reviewer worked at full resolution against the original portrait, with crops of faces, hands, tack and legs. The verdict table is in [`IMAGE_MANIFEST.md`](IMAGE_MANIFEST.md) and the handoff §4.

**Summary, as written by the reviewer:**
> "The drift is systematic and goes one way. Each step chains off the previous output (R2 uses R1, and the forest images use R2), and the face gets steadily younger, narrower and more 'glam': a slimmer jaw and cheeks, a narrower nose bridge, eyeliner, and piercings that are not in the original. … R1 is close, R2 is starting to drift, and R3 and R4 look like a different woman in her early twenties. R5 partly recovers the features but adds heavy contour and gloss. … Each stage should be checked against the original portrait itself rather than the image before it."

The reviewer also found a monogram-like emblem on R1's whip collar. The author confirmed it on a crop; the author's own first pass had missed it.
