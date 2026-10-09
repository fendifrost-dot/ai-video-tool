# PR #185 — Class C reviews · reference delivery in `world-still-proxy` · 7 October 2026

`docs/ARCHITECTURE_REVIEW.md` requires three sign-offs before a Class C change merges: architecture, product,
security. Each was run as an independent, read-only review of the branch (`origin/claude/ib-still-references` at
`321f96e`, diff against `origin/main`), by a separate reviewer with no shared context beyond the repository, and
each returned a verdict and numbered findings. The dispositions below are what the integration agent did about
each finding, with the commit that carries it. The director (Fendi) authorised the feature and the process:
"Complete #185's required architecture, product, and security reviews… That does not waive the repository's review
requirements" (7 Oct, 15:1x UTC).

Labels follow the repo taxonomy: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## Verdicts

| review | verdict | blocking findings | disposition |
|---|---|---|---|
| Security | APPROVE WITH CHANGES | F1: with today's open RLS a caller can re-own a project and have its files signed | **applied** (see S-F1) |
| Product | REQUEST CHANGES | P1: "not sent" still let money move for shots that need pictures; P2: identity silently demoted by the cap | **applied** (#188, merged `2b857ab`) |
| Architecture | APPROVE WITH CHANGES | none blocking; 6 should-fix, 4 nits | **applied** except A-9 (dropped from the PR as asked) and A-10 (comment added) |

## Security findings

- **S-F1 (HIGH, blocking)** — Holding the *row* to the caller is not enough while `*_open_test` RLS policies (`FOR ALL
  TO anon, authenticated USING (true)`) stand on `video_projects`, `project_assets` and the rest (VERIFIED live by
  `pg_policies`, 7 Oct): a caller with any JWT can `UPDATE video_projects SET user_id = <self>` and the function's
  `project.user_id === userId` check passes for the victim's project; the folder check then passes for the victim's
  own files.
  **Applied:** references are now signed **as the caller** (`userClient.storage…createSignedUrl`), never with the
  service role, so storage RLS decides in the database whether the file is theirs; and the function **refuses
  anonymous JWTs** (`is_anonymous`, the same refusal `lyric-align-proxy` makes) — today the only durable account is
  the director's (VERIFIED: `auth.users` 1 durable / 1,376 anonymous), so no anonymous visitor can spend on or sign
  through this route whatever the table policies say.
  **Correction to the review's premise (OBSERVED live):** storage RLS is *also* open today — every bucket carries a
  `<bucket>_open_test` policy for anon + authenticated. So caller-JWT signing is the right layer for when RLS is
  restored, and the anonymous-JWT refusal is what holds now. Removing the `_open_test` policies is RISK-001's own
  remediation and is tracked there; it is not this PR's to do. When those policies go, files under legacy anonymous
  uid prefixes (RISK-002 / STOR-2…4) stop signing for the director too — the same thing that happens to in-app
  reads; the storage re-key is the fix, not a looser check.
- **S-F2 (LOW)** — distinct refusal reasons as an existence oracle for guessed uuids. DECISION: kept; the reasons
  name the caller's own rows after the ownership check, uuids are 122-bit, and the director needs to be told *which*
  picture failed and why (product P3).
- **S-F3 (LOW)** — `pErr.message` / `upErr.message` echo database errors (pre-existing). Left; the lookup error
  was already made generic in `90c1c06`.
- **S-F4 (MEDIUM, pre-existing)** — no per-user rate limit; anonymous JWTs accepted. The anonymous refusal above
  closes the anonymous half for this function. RECOMMENDATION: the same refusal on every paid proxy
  (`treatment-writer-proxy`, `grok-video-edit-proxy`, `video-providers-*`, `grok-image-look-composite`) — separate
  Class C PR; see `docs/security/SECURITY_TRIAGE_2026-10-07.md`.
- **S-F5 (INFO)** — `jobRowId` write filtered by `user_id`: harmless.

## Product findings

- **P1 (blocking)** — with the generator unable to take pictures the confirmation showed "not sent: …" and the still
  was billed from words. **Applied in #188:** `undeliveredProblem` blocks a shot that needs a screen picture, an exact
  garment or an identity; the runner refuses the same case as the last guard before money.
- **P2 (blocking)** — a cast identity that overflowed the cap was listed in grey. **Applied in #188:** order is
  screen → cast → garments → place → props (xAI edits the first picture; a wrong face is unusable; the place's words
  are in the prompt anyway); an identity that does not fit **blocks**.
- **P3 (should-fix)** — refusal detail never reached the director. **Applied:** `detail` names each refused picture
  and why.
- **P4 (should-fix)** — price shown as fact. **Applied:** the confirmation says the edits route's price is assumed
  equal to a plain still; the job and the filed still carry `cost_basis: "generations list rate; edits rate
  unverified"` (HYPOTHESIS until one billed run). Model echo: the response reports `model` and `modelOverridden`.
- **P5 (nit)** — `aspectRatio` is the request, not the output. Worded as "asked for" in the handoff; the visual test
  checks it.
- **P6 (wardrobe rule)** — a garment picture sent as a reference to draw a storyboard *still* is planning imagery,
  not regeneration of garment footage (the pixel-preservation rule governs the garment lane). **Applied:** the label
  reads "sent as pictures — the model reproduces them; check the result".

## Architecture findings

- **A-1** `storage_path` only → pre-migration rows refused. **Applied:** `storage_path ?? file_url`, with a test.
- **A-2** refusal detail (same as P3). **Applied.**
- **A-3** duplicated filing block. **Applied:** one `fileStill()` for both routes; the record of a still is the
  same whichever endpoint drew it.
- **A-4** 120 s edit timeout × parallel calls + filing inside a ~150 s gateway. **Applied:** 100 s.
- **A-5** a timeout counted as "not billed". **Applied:** `possiblyBilled` / `billed: "unknown"`; failures are
  always written to the job row when a `jobRowId` is given.
- **A-6** pricing basis. **Applied** (P4).
- **A-7** silent model override. **Applied:** `modelOverridden: true` in the plan.
- **A-8** sign-failed names no bucket. **Applied.**
- **A-9** unrelated `deno.lock` bump. **Applied:** dropped from the PR.
- **A-10** `bucketForAssetType` re-implemented. **Applied:** comment naming the app file as the source of truth.

## What the reviews could not do

- No live call of the endpoint was made (no user JWT in this session; nothing was spent). Refusal of unauthorized
  references is VERIFIED by unit test (`_shared/stillReferences.test.ts`: another project's asset, another user's
  folder, another artist's picture, a video labelled as an image, traversal) — not by a live request. The first
  live run is part of the visual test and must be read as the first proof that the provider honours the pictures.
- The RLS integration test category `docs/ARCHITECTURE_REVIEW.md` names for storage/auth changes is still empty in
  this repository; this PR changes no policy. RECOMMENDATION: an RLS integration test that signs a `<otherUid>/…`
  path as a durable user and expects a refusal, to run once the `_open_test` policies are removed.
