# Interrupted Broadcast, first half — spend ledger against the $50 line

Reconciled 10 October 2026 (rebuilt from `provider_jobs` at 06:30 UTC; an earlier copy of this file was written
but not committed before the working machine was recycled). Project `764a63d2-93cd-44f3-905f-292f14ab2f51`,
variation `882ec381-0fa0-4a76-b23b-b83ebc157372`.

Three kinds of number are kept apart. They are never added to each other without saying so.

| Kind | Amount | What it is |
|---|---|---|
| **Confirmed charge** | **$0.00** | A bill read from a provider. No provider bill is readable by an agent: `costFinalCents` is null on every job, and the xAI, Higgsfield API and Runway consoles are the owner's. |
| **Estimate** | **$18.47** | List-rate estimates recorded on the job rows or computed from the repo's rate rules (`config/provider_rates.json`). This is the figure counted against the $50. |
| **Unknown** | all of it | Actual billing for every line below is unknown until the owner reads the provider consoles. |

**Left of the $50 at estimate: $31.53.**

One balance was read directly and is not money: the Higgsfield web account behind the Claude connector (free plan)
went from 10.00 credits to 9.52 credits on 10 October for four test stills. No purchase or top-up was made.

## What is counted

| # | When (UTC) | Who | Provider / model | What | Requests | Estimate |
|---|---|---|---|---|---|---|
| 1 | 9 Oct, before 22:51 | previous agent | xAI `grok-imagine-image-quality` | 9 still requests, made without job rows (found from the filed pictures) | 9 | $1.26 |
| 2 | 9 Oct 22:51 | previous agent | Higgsfield API `kling-2.5-turbo-pro-i2v`, 5 s | clips for shots 3, 4, 5, 6, 8, 9, 10 | 7 | $2.45 |
| | | | | **Previous agent** | | **$3.71** |
| 3 | 10 Oct 00:25–01:05 | this agent | xAI `grok-imagine-image-quality`, 2 candidates each | stills for shots 1, 2, 9, 8 (x3), 10, 11 (x2), 14, 16, 5, 3 | 13 | $1.82 |
| 4 | 10 Oct 02:49–03:23 | this agent | xAI `grok-imagine-image-2.0` (four or five reference pictures) | stills for shots 13 (x5), 12, 17; 12 candidates | 7 | $1.56 |
| 5 | 10 Oct 00:40–03:04 | this agent | Higgsfield API `kling-2.5-turbo-pro-i2v`, 5 s | clips for shots 9, 1, 2, 10, 8, 11, 3, 5, 14 (x2), 16, 13, 15, 12 | 14 | $4.90 |
| 6 | 10 Oct 03:22 | this agent | Higgsfield API `kling-2.5-turbo-pro-i2v`, 10 s | one clip for shots 17 and 18 | 1 | $0.70 |
| 7 | 10 Oct, about 03:30 | this agent | xAI video edit (`grok-video-edit-proxy`, record `813577a6`) and Runway video edit (job `9450b367`) | two wardrobe edits of the 4 s performance cut; both failed | 2 | $0.92 |
| 8 | 10 Oct 04:10, 04:32 | this agent | Higgsfield API `seedance-2.5-reference`, 720p, 4 s | two dressed-restage tests of shot 19 (jobs `bb645697`, `78f876e4`); both ruled unsuccessful by the director | 2 | $4.44 |
| 9 | 10 Oct 05:36 | this agent | xAI `grok-imagine-image-quality` | two candidates of a place picture for 79th and Lafayette (job `b5846919`), submitted two minutes before the director's pause; neither is approved or used | 1 | $0.14 |
| 10 | 10 Oct 06:13 | this agent | xAI `grok-imagine-image-quality` | realism comparison on shot 9: four test stills (jobs `5b8f607d`, `e3fa9fc0`), unselected | 2 | $0.28 |
| | | | | **This agent** | | **$14.76** |
| | | | | **Counted total** | | **$18.47** |

Notes on the estimates:

- Line 8 uses the repo's token rule for Seedance with a video input ($2.22 for 4 s at 720p). Control Center's own
  estimate for the same jobs is lower ($1.85 each). With Control Center's figures throughout, the counted total is
  about $17.63.
- Lines 3 and 4 are the still function's own figures (`stillCostUsd` on each job row): $0.07 a picture on the
  three-reference model; on the five-reference model the list rate plus $0.01 per input picture. The function
  marks the edits rate as unverified.
- Line 7 is the pair's combined estimate as recorded when they ran; the split between the two is not on the job
  rows.

## Listed, not counted

| When (UTC) | What | Estimate |
|---|---|---|
| 8 Oct 13:58 – 9 Oct 03:24 | The first board run of candidate 5, before the takeover: 41 still requests ($5.74) and 18 five-second Kling clips ($6.30). The director refers to it as the $30 test; it is outside the $50 line this ledger tracks. | $12.04 |
| 10 Oct 06:14–06:17 | Higgsfield web app through the Claude connector (free plan), model `soul_cinema_studio`: four test stills for the realism comparison. | 0.48 credits (verified from the balance), no money |

## Not running

At 06:30 UTC on 10 October no job of this project is queued or running. Three rows of another project
(`8ea590f0…`, providers pika and fal, created 17 May 2026) still read `queued`; they are stale records, not
running work, and were left as found.

## What would turn an estimate into a confirmed charge

The owner reading, for 9–10 October: the xAI console's usage for the key AVT uses; open.higgsfield.ai → Billing
for the API key pair Control Center holds; Runway's usage page. Until then every figure above stays an estimate.
