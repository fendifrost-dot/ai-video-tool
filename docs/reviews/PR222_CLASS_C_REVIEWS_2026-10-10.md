# PR #222 — Class C reviews · the edit model of a still by picture count · 10 October 2026

`docs/ARCHITECTURE_REVIEW.md` requires three sign-offs before a Class C change merges: architecture, product,
security. Each was run as an independent, read-only review of the branch (`feat/still-reference-capacity`, first at
`36fd152`, diff against `origin/main`), by a separate reviewer with no shared context beyond the repository, and each
returned a verdict and numbered findings. The dispositions below are what the integration agent did about each
finding. The reviewers are agents; none of them is the director, and none of their verdicts is his.

What the director asked for (takeover brief, 9 Oct): "Fix wardrobe propagation through the tool … report missing
references and capacity conflicts before spend; never quietly drop required items", "Use Lovable for required
publish/redeploy operations", "Follow the project's supported migration process", "Do not bypass authentication,
approval review, or access controls."

Labels follow the repo taxonomy: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## Verdicts, first pass

| review | verdict | blocking findings | disposition |
|---|---|---|---|
| Architecture | APPROVE WITH CHANGES | A1: once the probe says 5, the planner fills optional pictures to 5 and moves shots that did not need it to the larger model; A2: the confirmation still quotes the flat rate | **applied** |
| Product | REQUEST CHANGES | P1: the price the director confirms is wrong for 4–5 pictures; P2: the first use of an unverified model on exact garments is silent and nothing names the model | **applied**, except the paired comparison (P2c), which is a paid run for after deploy |
| Security | APPROVE WITH CHANGES | none blocking; S1–S5 before deploy | **applied** except S7 (see below) |

## Architecture findings

- **A1 (blocking) — optional pictures filled to the larger limit.** `planStillReferences` filled every role to the
  cap, so with the probe at 5 a shot with a place and two props would send them and move to the larger model at a
  higher rate, though it needed none of them. **Applied:** the probe returns `referenceModels` (each model's limit and
  estimate); the planner takes `baseCap` (the usual model's limit) and fills a picture the shot can do without only
  up to it — only a screen, a person or an exact garment takes a place past it (`references.ts`, test in
  `linksRoutes.test.ts`).
- **A2 (blocking) — the app quoted $0.14 where the server planned $0.26.** **Applied:** `imageEstimateUsd` prices a
  still with pictures by the model that takes them, with the generator's own numbers (`queries/stillReferences.ts`
  `stillTierFor`, `stillRateUsd`); the clip estimate adds the difference when it draws the image first; the
  confirmation's caveat is `stillCostNote`.
- **A3 — the probe paired `maxReferences: 5` with a model that takes 3.** **Applied:** `referenceModel` is answered
  only for a request with pictures; the probe answers `referenceModels`.
- **A4 — migration (2 Nov 2026).** **Recorded:** `RISK_REGISTER.md` REF-2, with a DoD dated before the retirement.
  The no-redeploy lever is noted beside the capability record.
- **A5 — overrides.** An endpoint-level override lifts both models. DECISION: documented beside the capability
  record (levers must use the model key; the way back is the 2.0 key at 3) and tested; the ceilings table is left as
  designed — it bounds unverified RAISES, and an existing test holds that a model-key override may go to 6 without a
  redeploy.
- **A6 — no test of the plan.** **Applied:** the decision (model, rate, estimate, gate, plan fields) is one pure
  function, `planStillRequest`, with tests for 0 / 3 / 4 / 5 / 6 pictures, the gate at n = 4, a named model, an
  override, and a NaN estimate; `readSupport` is tested on the new and the old probe shape.
- **A7 — two price tables.** **Applied:** the generations table lists 2.0 at the same 2K rate and says why it repeats
  it.
- **A8 — request shape on 2.0 is unverified (`resolution`, `aspect_ratio`).** HYPOTHESIS until the first paid call
  after deploy; the plan is one supervised 4-picture, one-candidate request, its result written into the capability's
  `source`.
- **A9 — a non-string `resolution` threw.** **Applied** (see S3).
- **A10 — five pictures at four candidates is over the default limit.** Recorded in REF-1; DECISION: the default
  limit is not raised.
- **A11 — honour a listed model the caller names.** **Applied** (`pickReferenceModel` `asked`): a board can be kept
  on one model, and one shot can be drawn on both to compare.
- **A12 — stale comments.** **Applied**; `avt-mcp/catalog.generated.ts` regenerated.

## Product findings

- **P1 (blocking) — the confirmed price.** **Applied** (A2).
- **P2 (blocking) — a silent first use of an unverified model; the model named nowhere.** **Applied:** (a) the
  confirmation says, for a still past the usual model's limit, that it is drawn on a different model from the
  director's other stills, that the figure is an estimate from its list price, and that what it bills and how exactly
  it reproduces a garment are not yet verified — "check each piece against its photo"; the reference panel says the
  same on the shot; the MCP driver prints it as a `CHECK` line. (b) `model`, `costBasis` and `costIsEstimate` are
  recorded on the job row. **Open — P2c:** one paired comparison (same shot, same three pictures, both models), which
  needs the deploy and a paid run; it is in REF-2's DoD.
- **P3 — a board cannot pin one model.** **Applied** on the server (A11). **Open:** a board-level setting in the app.
- **P4 — the gate could be lower than the bill.** DECISION: the estimate is the dearest tier the provider lists
  (medium; VERIFIED on the model page — no dearer tier is listed), said in the code and in `costBasis`; the recorded
  figure carries `costIsEstimate: true`.
- **P5 — the failure when xAI rejects 4–5 pictures.** **Applied:** the rejection is said in plain words with the
  limit to keep to (`stillFailure`). **Open:** the planning cap does not fall back by itself — the operator lowers the
  2.0 capability by its model key (no redeploy), noted beside the record.
- **P6 — what remains impossible.** A look of six pieces with a face is seven pictures and still blocks, accurately.
  **Applied:** the two handoff documents that say "3 photos" carry a dated note. **Open:** the block's first remedy
  ("take a garment off") still reads before "split the look across shots".
- **P7 — the retirement.** **Recorded:** REF-2.
- **P8, P9 — the probe's pair; two prices.** **Applied** (A3, A7).
- **P10 — pieces left off earlier to fit 3 are not flagged as now fitting.** **Open, follow-up.**

## Security findings

- **Confirmed unchanged (VERIFIED by the reviewer from the diff):** the order of checks (bearer, getUser, anonymous
  refusal, project ownership, reference parsing, over-limit refusal, cost gate, per-reference ownership, dry-run
  return, signing as the caller, provider call); no new code before authentication; no new service-role use; no
  signed URL, token or path added to any response, log or stored metadata.
- **S1 — the risk register.** **Applied:** REF-1 moved (5 pictures, the new ceiling, the added DoD item); REF-2
  opened; this record.
- **S2 — the gate prices a tier the request does not pin.** DECISION as P4.
- **S3 — `resolution` is the caller's, unvalidated, and now prices the request.** **Applied:** only `1k` and `2k`
  are taken (`normalizeResolution`), anything else is a 400 before spend; the price lookup uses `Object.hasOwn`.
- **S4 — the figure the director consents to.** **Applied** (A2).
- **S5 — an estimate recorded as "actual".** **Applied:** `costBasis` and `costIsEstimate: true` on the job payload
  and in the plan. The field name `actualCostUsd` is pre-existing and read elsewhere; it is not renamed here.
- **S6 — the two price tables.** **Applied** (A7); the dated switch is REF-2's DoD.
- **S7 — the override ceiling (8) is looser than the documented limit.** DECISION: not changed (A5). Only the holder
  of the edge secrets can set an override; a caller cannot.
- **S8 — the probe's pair.** **Applied** (A3).
- **S9 — a NaN estimate would open the gate.** **Applied:** the gate is `!(estimate <= limit)`, tested.
- **Pre-existing, not introduced here (S10–S13):** `maxCostUsd` is the caller's own limit with no server ceiling; an
  unknown model on the no-picture route priced at the dearest known rate; RLS is open (SEC-4) and the anonymous
  refusal is the live control — the reviewer's test, "confirm in Lovable auth settings that sign-up is off", is
  **open and is the owner's to check**; `redactSigned` strips tokens, not the caller's own paths.

## What is NOT verified

- That `grok-imagine-image-2.0` accepts five pictures from this account, with `resolution: "2k"` and `aspect_ratio`
  (HYPOTHESIS; test: the first supervised request after deploy).
- What it bills (HYPOTHESIS; test: one billed run against the xAI console — the owner's console, not reachable by an
  agent).
- That it reproduces a garment as exactly as the model in use, and addresses its inputs as `<IMAGE_n>` with the first
  as the edited frame (HYPOTHESIS; test: the paired comparison in REF-2).
