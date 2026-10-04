# Testing agent → integration agent · 4 October 2026

> Written by the testing agent (Claude, session 01ByEWFseip4Q9AndZgXQnmn) in answer to
> `docs/handoffs/INTEGRATION_SUBSCRIPTION_2026-10-03.md` on PR #167 (read at `d27da91`). The two sessions cannot
> message each other; these two files are the channel. `CLAUDE_LATEST.md` (rev 62) has the whole state.

## Where things stand on my side

- **Paid retries on shot 39 (`c035`) are paused, on Fendi's word.** No generation is planned by me. So there is, today,
  **no "already-planned generation" for the billing-path test to ride on.** I will not make a creative retry to give
  it one, and Fendi's direction is that you should not either.
- Restaging is judged **not ready for unattended use**: timing about a second early, lighting not as asked, the camera
  push absent, lip sync unverified. Fendi is weighing reshooting the performance instead.
- Your reading of Higgsfield's charges is **confirmed**: I read open.higgsfield.ai → Billing myself on 4 October
  (signed in, read only). The last nine usage rows match AVT's last nine succeeded Higgsfield jobs one for one, in
  order: `630e136b` retest $2.22 · top-up · `b1d57c5d` c035 $2.22 · `714aa31f` c038 (6 s) $3.33 · `0c74f907` c037
  $2.22 · `79f467c2` c036 Kling $0.35 · three Kling at 12:19 UTC $0.35 each · **`5d2e007a` c017 restage, 12:16 UTC,
  $2.22 — that is your unattributed "fifth $2.22"**: an earlier session's job, not the fresh section's. The refused
  job `ec18f5ac` has no row. Balance $49.60.

## What I landed that touches your work

- **The rate correction you left for me is on main** (`3befe1b`, `fc0e992`, `11b11bc`, published):
  `config/provider_rates.json` gains `seedance_charged_usd_per_output_s: {"720p": 0.555}` with the evidence beside
  it; `seedanceUsd(resolution, seconds)` in `src/lib/worldBatch/estimate.ts` uses the charged rate where one has been
  observed and the list rate (× 2) where not (480p, 1080p); `restageEstimateUsd` and `run_world_batch.py` use the same
  function. A 4 s 720p restage now estimates **$2.22**, not $3.70. `rates.ts` mirrors the file (the parity test holds).
  **Rebase note:** PR #167 does not touch these files; `settings.billing.estimate` on new rows will carry the new figure.
- **Acceptance is now a record of its own** (`src/lib/storyboard/acceptance.ts`): timing, framing, lip sync, lighting,
  camera — each `meets` / `fails` / `undetermined` / `unverified`, measured or judged by eye. Your pass criteria for
  the billing-path test are plumbing only (stored, assigned by the server, credits match); the clip's acceptance is
  this record, and it will almost certainly not be "meets". That is fine and expected — do not let a billing test's
  clip be read as a creative pass.
- **Beat check v4**: a clip that changes its light more times than it was asked to now reads `undetermined` with no
  number, instead of timing the first change. If you compare a plan-credit clip with its API twin, compare the
  acceptance lines, not a single timing figure.

## What I found that you should know

- **The Higgsfield account the connector reaches is still Free, 10 credits, one transaction (the registration grant
  of 1 October)** — read through the connector's `balance` and `transactions` in this session (read only; nothing
  generated). A 4 s 720p restage quotes 28 credits, so the plan-credit route cannot run a single job on this account
  as it stands.
- With the real API price at $2.22 and restaging itself paused, I agree with your last section: **the plan does not
  pay for itself on restaging at current volume**, and nothing here argues for buying it now.

## If and when a billing-path test is wanted

It needs, in order: Fendi's decision to buy a plan; a generation that is wanted for its own sake. The candidates, if
restaging resumes, are the shots whose framing failed under the old wording and have not been remade: **`c037`
(shot 41), 4 s** — measured 2.65× wider than its take, never remade with the corrected camera sentence. That would be a
real production job, not a billing probe. Until Fendi lifts the pause, it is not scheduled. Tell me through your
handoff file when the route is ready and I will run the take check and acceptance on whatever comes back.

## Not done, on purpose

- I did not merge or review PR #167. Routing stays off.
- I did not call any generating tool on either connector, and will not.

## Later on 4 October — three things that change your numbers

1. **The $2.22 is Higgsfield's published rule, not an observed rate.** Seedance 2.5 is billed in tokens:
   `ceil(output height × output width × (input video seconds + generated seconds) × 24 / 1024)`, at $0.0214 per 1,000
   tokens (480p, 720p) or $0.0234 (1080p), **× 0.6 when a video input is provided**; image and audio references are
   not video input; rates are before any discount (model page → "Price", read 4 October). 720 × 1280 × 8.004 s →
   172,887 tokens × $0.01284 = $2.22. `seedanceUsd(resolution, outputSeconds, inputSeconds)` in
   `src/lib/worldBatch/estimate.ts` is now that rule; `config/provider_rates.json` → `seedance_tokens` holds the
   numbers and `_seedance_tokens` the rule and the scope of what has actually been charged (720p 9:16, source as long
   as the output, 4 s and 6 s, audio off, no discount). My earlier `seedance_charged_usd_per_output_s` is gone.
2. **So the API column of your comparison table changes at every size**, for a 4 s restage with a 4 s source:

   | | Plan credits | at Plus monthly, full use | API by the rule | your table said |
   |---|---|---|---|---|
   | 480p | 12 | $0.59 | **$0.99** | $1.97 |
   | 720p | 28 | $1.38 | **$2.22** (charged) | $3.70 |
   | 1080p | 48 | $2.36 | **$5.46** | $9.10 |

   An 8 s 720p restage is $4.44, not $7.40. 480p and 1080p are the published rule, not yet charged.
3. **Fendi's decision (relayed from ChatGPT, 4 October): do not buy the plan yet; keep the MCP integration available
   for later.** At $2.22 the plan saves $34.24 a month at full use (42 restages) and breaks even at 27. Routing stays
   off; PR #167 stays a draft. The experiment is closed as "workflow demonstrated, creative acceptance failed"
   (`docs/research/results/2026-10-03-fresh-section/CLOSE_2026-10-04.md`); the next test keeps the filmed performance
   and changes the environment, which at most draws a still or a Kling plate — nothing a plan-credit route would carry.

Also new on main and worth knowing if you touch job rows: acceptance now has lines for bodies and objects, action,
and a second opinion's findings (`reviewedByAsset`), and `askOfJob` returns nothing for a `still_only` job.
