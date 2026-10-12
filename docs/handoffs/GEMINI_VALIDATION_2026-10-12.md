# Gemini / Nano Banana 2.1 — bounded validation run, 12 October 2026

Owner-authorised: up to **$3** of new Google generation, stills only, all output filed as **unselected tests**.
Evidence labels follow `CLAUDE.md`: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## 1. Where things stand

| Item | State |
|--|--|
| Route `AVT world-still-proxy → CC image-providers-gemini-generate → Google` | **LIVE, works end-to-end** (VERIFIED: 7 images filed) |
| Reliability | **BROKEN for production**: 4 of 11 paid submissions killed by CC worker memory limit after Google answered (VERIFIED) |
| Storage isolation (`gemini_storage_rls`) | **FAIL** — SEC-4 still open (VERIFIED, §4) |
| Creative pipeline | Identity strong at stage A, drifts through chained references (OBSERVED, §5) |
| Spend | ≈ **$0.69** estimated, upper bound **$1.03**; invoice not verified (§6) |

Code merged + deployed during this run (all via Lovable, edge redeploy only, no SQL, no Publish):

| PR | Commit | Fix | Deployed |
|--|--|--|--|
| CC #48 | a9a2391 | free `models.get` dry-run probe; Google's exact refusal in `googleError` | CC `image-providers-gemini-generate` |
| AVT #233 | cfc3338 | failed dry-run keeps `googleError` | AVT `world-still-proxy` |
| CC #49 | ffeab4d | **v1 → v1beta** (v1 answered 404 "Model is not found … for api version v1") | CC |
| CC #50 | bc1409c | **`imageConfig` strings** (v1beta `responseFormat.image` is enum-typed, 400 on "4:5"/"2K"); `thinkingLevel: MEDIUM` | CC |
| CC #51 | 77eda78 | memory: slice-wise base64, serialise once, header-only output check (local peak 114→72 MB) | CC |
| CC #52 | 9ebc5ee | release request bodies before reading answer; record `responseBytes`, `finalImageParts`, `thoughtImageParts` | CC |
| (Lovable) | 3a794ce | test-only: `Buffer` → `toBase64` helper for Deno type check | n/a |

Without #49 and #50 **no paid request could ever have succeeded**; both were found by the free dry-run / first refusal, before any image spend.

## 2. Funding (VERIFIED from Gmail receipts, not from the console)

- Google Cloud customer `019D00-2E479F-AFE4FD`, payments profile `5865-0187-4020`; upgraded to paid 8 Mar 2026.
- **Prepaid Gemini-API credits**: $25 purchased 17 May 2026 (Mastercard ••9417), "Credits can only be used with Gemini API", expire one year after purchase.
- **Auto-reload ON**: +$25 when balance falls below $10. No reload receipt since May.
- Exact balance: **unknown** (no console/billing API access from this session).
- Model access: **VERIFIED** — `models.get` on v1beta returned `models/gemini-nano-banana-2.1`, displayName "Nano Banana 2.1", version "3.0"; 7 paid generations returned images, so billing accepted the requests.
- Link between the `Frost_Gemini` key and this billing account: **HYPOTHESIS** (only Gemini-API prepay account found; the key's project number was never returned in an error). To verify: AI Studio → API keys → the key's project → Billing.
- Note: auto-reload means any spend that crosses the $10 floor charges the card $25. That is the account's configuration, not something this run changed.

## 3. Technical checks

| Check | Result | Evidence |
|--|--|--|
| Correct project / variation / reference ownership | PASS | every job: owner `3ca10935…`, project `764a63d2…`, variation `882ec381…` (active, unchanged); references resolved by asset ID |
| Reference reaches Google | PASS | `promptTokensDetails` IMAGE = 1120 tokens per reference (2240 with two) |
| Output saved in AVT and linked to job | PASS | each success: `provider_jobs.result_asset_id` set, `status=succeeded`, `finalized_at` set |
| Model id, prompt, reference IDs, usage, cost estimate recorded | PASS | `project_assets.metadata_json` carries model, modelVersion (`gemini-nano-banana-2.1`), job_id, variation_id, route, prompt, references, usage, estimatedCostUsd |
| Estimated vs verified billing kept apart | PASS | `actual_cost_usd: null`, `billed: "unknown"`, `billingStatus: "invoice_unknown"` |
| Duplicate submission refused (unpaid) | PASS | replay of job `dfd13f7f…` → `gemini_job_not_claimable`, `billed:false`, no CC call |
| Failures visible, no Grok fallback | PASS | failed jobs carry `error_text` + Google error; 0 Grok jobs/assets created |
| Storage isolation | **FAIL** | §4 |
| Worker survives a paid answer | **FAIL** | §7 |

Production untouched (VERIFIED by query): 0 shots / continuity entities / variations updated on 12 Oct; cast reference `3fce9cb5…` still `approved`; all 7 outputs `approval_status=pending`, `shot_id=null`.

## 4. Storage isolation — FAIL (SEC-4 still live)

Read-only RLS simulation in Lovable SQL (rolled back, counts only, no files read):

| Role | prop-refs visible | project-references visible |
|--|--|--|
| anon | 20 | 347 |
| random authenticated uid (no account) | 20 | 347 |
| owner | 20 | 347 |

Cause: `prop-refs_open_test` / `project-references_open_test` (`FOR ALL TO anon, authenticated`, bucket check only) and `single_tenant_storage` (`FOR ALL TO authenticated`, every bucket). Permissive policies OR together, so the `*_own` policies restrict nothing.
`scripts/qa/gemini_storage_rls.mjs` was **not** run: it needs two real disposable identities; the SQL simulation answers the same question without creating accounts.
Not changed here (security-reviewed change; dropping the policies can break the app). The Gemini route adds spend exposure: any durable account (SEC-5) can create a project and call it. **Do not widen the Gemini route's audience until SEC-4/SEC-5 close.**

## 5. Creative results (full-resolution files inspected)

Identity references: A used the approved portrait `3fce9cb5…`; B used portrait + A2; **C and D used only generated outputs (B2/A2, C2/A2)** because the 7.5 MB PNG kept the CC worker near its memory limit (DECISION, recorded on each job).
Garments: **no approved garment references exist** for the rider — the outfit is described in words only in every stage.

| Stage | Asset | Verdict | Specific defects |
|--|--|--|--|
| A1 natural-light medium | e9bcd621 | PASS | freckle cluster over-emphasised by the prompt |
| A2 three-quarter | 82578b2f | **PASS, strongest** | freckles dark/stamped; turn ~30° not 45° |
| B2 wardrobe, glove | b7a6b601 | **PASS, strongest B** | mild glamour drift (longer face, smoother skin), freckles gone; boots not in frame |
| B1 full length | — | lost (worker crash) | — |
| C1 horse side | 6a38c08f | PASS | horse back/barrel slightly long; rider reads small; girth not drawn |
| C2 horse three-quarter | a1b2ced9 | **PASS, strongest C** | hanging strap ambiguous (rein loop vs martingale); small metallic detail at wrist |
| D1 forest wide | — | lost (worker crash) | — |
| D2 forest medium | d2e9da78 | PARTIAL | treatment-compliant, but subject lit like overcast daylight (composited look); pose cloned from C2; identity drift |
| D retry (changed variable: firelight as only key light) | c44fe57c | **PASS on lighting/compliance, PARTIAL on identity** | face younger/softer at distance; embers stylised; rider slightly small |

No YSL lettering, monogram, logo-shaped clearing or path geometry in any D image (VERIFIED by inspection).
The returned model id was `gemini-nano-banana-2.1` every time; this is **not** asserted to be the same model as the Higgsfield "nano_banana_2_1" that made the approved portrait.

## 6. Spend (Google list rates: input $1.50/M, text+thinking $7.50/M, image output $30/M)

| Job | Result | Estimated |
|--|--|--|
| dfd13f7f, e0eb62f8 | 400 INVALID_ARGUMENT (request shape) | $0 |
| 530ba437 A1 | image | $0.0577 |
| 13c56a6d A2 | worker crash after answer | ~$0.06 (≤ $0.1475) |
| 678138cd A2 | image | $0.0655 |
| e3838068 B1 | worker crash after answer | ~$0.06 (≤ $0.1475) |
| 587ba99d B2 | image | $0.0636 |
| ddae6a23 C1 | image | $0.0610 |
| c9ba27d1 C2 | image | $0.0632 |
| d6fb32c1 D1 | worker crash after answer | ~$0.06 (≤ $0.1475) |
| ae760fb6 D2 | image | $0.0627 |
| 76c688f6 D retry | worker crash after answer | ~$0.06 (≤ $0.1475) |
| 60b15318 D retry | image | $0.0606 |
| **Total** | 7 images, 4 lost | **≈ $0.69** (upper bound $1.03) |

Verified billing: **none** — read the AI Studio / Cloud billing usage for 12 Oct to replace these estimates.

## 7. The blocking defect — CC worker memory on the answer

- VERIFIED: 4 of 11 paid submissions died ~20 s in (`ERROR Memory limit exceeded` in CC logs), after Google had answered; CC audit rows stay `attempted`.
- VERIFIED (first run with #52): one final 3.1 MB JPEG came back in an **11,299,168-byte** answer with `finalImageParts: 1`, `thoughtImageParts: 0`. ~7 MB of the answer is neither the image nor an interim image.
- HYPOTHESIS: the excess is a `thoughtSignature` on the image part. Test: log per-part key sizes (no values) on one run.
- The answer is also within 1 MB of the code's 12 MB cap — some answers will fail as `response_too_large`.

RECOMMENDATION (next fix, CC only):
1. Request `generationConfig.responseFormat.image.delivery = "URI"` (enum in the v1beta schema, with `aspectRatio: "ASPECT_RATIO_FOUR_BY_FIVE"`-style enums and `imageSize: "IMAGE_SIZE_TWO_K"` instead of `imageConfig`) so Google returns a link, then stream the image from that URI. Answer becomes kilobytes. Verify on one dry-run-sized request first: the 400 earlier proves the enums are validated strictly.
2. Or stream-parse the JSON answer and drop everything but the final image part.
3. Then restore the approved 7.5 MB portrait as an identity reference in every stage — the drift in C/D is the cost of having dropped it.
Until fixed: run one request at a time and treat each attempt as possibly billed.

## 8. What not to do

- Do not retry a crashed job automatically or mark its spend $0 — the image was very likely billed.
- Do not promote any test asset or change the cast reference, shot selections, locks, timeline or exports from this run.
- Do not "fix" SEC-4 by editing `gemini_storage_rls.mjs` or weakening its assertions.
- Do not top up Google credits: funding is not the blocker.

## 9. Report back

Billing-console usage for 12 Oct (actual $ vs §6); the per-part size test result; whether URI delivery removes the crashes over ≥5 sequential runs; SEC-4 decision.
