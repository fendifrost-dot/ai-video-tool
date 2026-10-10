# Ledger — the $50 generation budget on Interrupted Broadcast (candidate 5) · reconciled 10 October 2026

One ledger for the budget the takeover brief of 9 Oct names: "The prior authorized generation budget was $50. The
previous agent reported $3.71 used, but other concurrent work may have spent more. Reconcile actual jobs before
determining the remaining amount."

Reconciled from the live records, not from earlier reports: every `provider_jobs` row of project
`764a63d2-93cd-44f3-905f-292f14ab2f51` since 8 Oct, and every `project_assets` row of the same window (a still drawn
without a job row carries its own cost on the asset). Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION.

## The three kinds of number

| kind | what it is | total in this budget |
|---|---|---|
| **Confirmed charge** | an amount read off a provider's own bill or balance | **$0.00 — none is readable by an agent** |
| **Estimate** | list price × what was asked for, as the tool recorded it before or at the call | **$18.47** (see the range below) |
| **Unknown** | what each provider actually billed | every row |

Why nothing is confirmed (VERIFIED): the job-status envelope Control Center returns carries no final cost
(`costFinalCents` is null or absent on every finished job); the xAI, Higgsfield-API and Runway bills are in the
owner's consoles; the Higgsfield connector on this Claude account is a different, free account (balance 10 credits
before section D, one transaction — the registration grant) and shows none of these jobs. The figure the stills function records as
`actualCostUsd` is its rate × the pictures drawn, not a bill.

**Range of the estimate:** two rows have two estimates on file. The Seedance tests are $2.22 each by the repo's token
rule and $1.85 each by Control Center's own estimate; the Runway edit is $0.60 by the repo and $0.50 by Control
Center. With the lower figures the total is $17.63.

**Budget line (DECISION — the rule used):** counted against the $50 is everything from the previous agent's 9 Oct
work onward, because that is the work it reported "against a $50 authorization". The 8 Oct batch (the first draft of
candidate 5) was reported by the integration agent under a separate "$30 test" in the project's status note of 8 Oct
22:45 CT and is listed in the last section, not counted here.

**Used: $18.47 at estimate (sections A + B + C + D). Left: $31.53 at estimate. Confirmed: $0.00.** No job in this ledger was submitted twice:
every provider id below is distinct. Where a shot has more than one request, the later one was sent with a changed
request; the exact text of each is on its job row (`request_payload_json`).

## A · Previous agent — 9 Oct, 17:27–17:54 CT — $3.71

Stills went through `world-still-proxy` without a job row; each asset records $0.07 (VERIFIED on the assets).

| time (CT) | shot | operation | estimate | billed | outcome now |
|---|---|---|---|---|---|
| 17:27, 17:32 | c003 | 2 still requests, 4 candidates | 0.28 | unknown | not selected |
| 17:34 | c004 | still, 2 candidates | 0.14 | unknown | its clip `0649fc1e` is selected |
| 17:34 | c005 | still, 2 candidates | 0.14 | unknown | not selected |
| 17:35 | c006 | still, 2 candidates | 0.14 | unknown | its clip `7ceb788e` is selected |
| 17:36 | c009 | still, 2 candidates | 0.14 | unknown | not selected |
| 17:37 | c010 | still, 2 candidates | 0.14 | unknown | not selected |
| 17:37 | c008 | still, 2 candidates | 0.14 | unknown | not selected |
| 17:54 | c002 | still, 2 candidates | 0.14 | unknown | not selected |
| 17:51 | c005 | Kling 5 s · job `12ecf171` · provider `247ef981` | 0.35 | unknown | demoted |
| 17:51 | c004 | Kling 5 s · `06fc3d1d` · `8495e88a` | 0.35 | unknown | **selected** |
| 17:51 | c009 | Kling 5 s · `42380efc` · `19dfc96d` | 0.35 | unknown | demoted |
| 17:51 | c008 | Kling 5 s · `c4a8f0d4` · `84043f02` | 0.35 | unknown | demoted |
| 17:51 | c003 | Kling 5 s · `31ff7d74` · `029efc6e` | 0.35 | unknown | demoted |
| 17:51 | c010 | Kling 5 s · `a43720e8` · `61d2ff2c` | 0.35 | unknown | demoted |
| 17:51 | c006 | Kling 5 s · `7f216400` · `2c950473` | 0.35 | unknown | **selected** |

Stills $1.26 + clips $2.45 = **$3.71** — the figure that agent reported, and it reconciles (VERIFIED).

## B · This agent — 9 Oct 19:25 CT to 10 Oct 00:00 CT — $14.34

### Stills on the usual image model ($0.14 a request, 2 candidates) — 13 requests, $1.82

| time (CT) | shot | job | changed from the request before | outcome |
|---|---|---|---|---|
| 19:25 | c001 | `49037354` | first | still → clip `06715881` selected |
| 19:28 | c002 | `d02548d6` | first | still → clip `deeaf421` selected |
| 19:31 | c010 | `0b6dbd22` | first | → `0d2eb837` selected |
| 19:31 | c009 | `5c61e4ad` | first | → `164227f8` selected |
| 19:31 | c008 | `dd04188c` | first | not used — retried |
| 19:34 | c008 | `2c1ad236` | request reworded (the job row holds the prompt) | not used — retried |
| 19:36 | c008 | `6394bc6d` | request reworded again | → `84c230bc` selected |
| 19:57 | c011 | `1ab12b39` | first | not used — retried |
| 20:00 | c011 | `e699209e` | request changed (the job row holds it) | → `2e8cffbe` selected |
| 20:05 | c003 | `0ac97bcb` | first | → `a1c8e8d3` selected |
| 20:05 | c014 | `13aef023` | first | → `91d456be` selected |
| 20:05 | c005 | `ad7da78b` | first | → `4ead98d0` selected |
| 20:05 | c016 | `f09c4363` | first | → `eb7db792` selected |

### Stills on `grok-imagine-image-2.0`, five pictures ($0.13 a candidate, list) — 7 requests, 12 candidates, $1.56

| time (CT) | shot | job | candidates | changed | outcome |
|---|---|---|---|---|---|
| 21:49 | c013 | `79b87dca` | 1 | first five-picture request | room came out black and white — cause found (#224) |
| 21:53 | c013 | `ca139251` | 2 | garment wording | cap still backwards |
| 21:54 | c013 | `a66d721c` | 1 | screen words left out | **keyframe `5d175ab3`, selected on c012/c013/c015** |
| 21:56 | c013 | `dab0299b` | 2 | cap clause | comparison for #224 |
| 22:02 | c012 | `dae6fd21` | 2 | — | not selected (the shared keyframe is used) |
| 22:05 | c017 | `8f1e80f1` | 2 | — | **keyframe `0478cce9`, selected on c017/c018** |
| 22:23 | c013 | `accefd03` | 2 | final wording of #224 | wording check, not selected |

### Clips — Kling 2.5 turbo ($0.07 a second, list) — 14 × 5 s + 1 × 10 s, $5.60

| time (CT) | shot | job · provider id | outcome |
|---|---|---|---|
| 19:40 | c001 | `4c1b9170` · `4d6d2b16` | selected |
| 19:40 | c009 | `0b81da63` · `92a3eca5` | selected |
| 19:40 | c010 | `f3f07932` · `6f08cee7` | selected |
| 19:40 | c002 | `d6224421` · `a74a4c26` | selected |
| 19:42 | c008 | `9d652df1` · `7ef13236` | selected |
| 20:09 | c011 | `35f6db46` · `4040d80b` | selected |
| 20:10 | c003 | `d0e4171e` · `2c1dcdc8` | selected |
| 20:12 | c005 | `47558392` · `4ada62ad` | selected |
| 20:12 | c014 | `ad8d28b8` · `2c3d2c8f` | demoted — retried with other motion words |
| 20:12 | c016 | `8ba296ed` · `37b01326` | selected |
| 20:23 | c014 | `e3c70828` · `6228204f` | selected |
| 22:00 | c013 | `4063ea08` · `b18ba7a2` | selected |
| 22:01 | c015 | `db442056` · `248ede86` | selected |
| 22:04 | c012 | `ec7428b6` · `4c7376a8` | selected |
| 22:22 | c017 + c018 | `c2eb9e68` · `1252ec75` (10 s, $0.70) | selected on both |

### Performance tests on shot 19 — $5.36 (none selected; all four read as failed for production)

| time (CT) | operation | record | estimate | billed |
|---|---|---|---|---|
| 22:32 | Grok video edit, 4 s (`grok-video-edit-proxy`; no job row) | asset `813577a6`, xAI request `e2a11263` | 0.32 (the function's own figure) | unknown |
| 22:33 | Runway video edit, 4 s | job `9450b367` · `bba017ac` | 0.60 (Control Center: 0.50) | unknown |
| 23:10 | Seedance reference, 4 s, three pictures | job `bb645697` · `760797b0` | 2.22 (Control Center: 1.85) | unknown |
| 23:32 | Seedance reference, 4 s, close-up | job `78f876e4` · `e8144d22` | 2.22 (Control Center: 1.85) | unknown |

Sum of B: 1.82 + 1.56 + 5.60 + 5.36 = **$14.34**.

## C · This agent — 10 Oct, after 00:18 CT — $0.14, then paused

| time (CT) | what | job | estimate | billed | outcome |
|---|---|---|---|---|---|
| 00:36 | reference picture of a new place record, "79th and Lafayette, by the Red Line" (usual image model, 2 candidates, no reference pictures) | `b5846919` | 0.14 | unknown | two pictures filed with the place record (`1ea5541a`, `0770ce61`); **neither approved, nothing selected** |

The director paused all new paid generation at 00:38 CT. Nothing was submitted after that until he authorized the
bounded comparison of section D at 01:09 CT. No job was running at a
provider at the pause: this one had already drawn its pictures, and the server's finalizer closed its row as
succeeded at 00:40 CT. There are no automatic retries anywhere in this work.

## D · This agent — 10 Oct, 01:13–01:18 CT — the realism comparison on shot 9 — $0.28, and 0.48 Higgsfield web credits

Authorized by the director at 01:09 CT: at most $1.00 plus two existing Higgsfield credits, the Higgsfield connector
allowed for this experiment only, outputs filed unselected. Record with the full text, settings and the answer key to
the anonymous sheet: the project doc `claude/avt-realism-comparison-2026-10-10.md`.

| time (CT) | what | job | estimate | billed | outcome |
|---|---|---|---|---|---|
| 01:13 | xAI, usual image model, 2 candidates, the approved rider picture as the one reference | `5b8f607d` | 0.14 | unknown | test stills `21df3c7d`, `caf76384`; not on any shot |
| 01:15 | the same request again | `e3fa9fc0` | 0.14 | unknown | test stills `aa47a277`, `1611926a`; not on any shot |
| 01:14–01:17 | Higgsfield web app through the Claude connector (free plan), `soul_cinema_studio`, four single stills | Higgsfield jobs `791649d2`, `b39d4591`, `536c83d7`, `71b4ec3b` | 0.12 credits each, quoted before each request | **0.48 credits — VERIFIED from the balance: 10.00 before, 9.52 after** | filed in AVT as test stills `7f1d96e9`, `49a59662`, `9921cb9b`, `5f75380e`; not on any shot |

The Higgsfield credits are the free account's registration grant; no money was charged and nothing was bought. One
further Higgsfield request was refused by a rate limit before it started and one request for two pictures returned
and charged one. No motion test has been run: the two clips ($0.35 each at list) wait for the director's choice of
stills.

## What would turn "unknown" into "confirmed"

- xAI console → usage for the "Frost Grok" key on 9–10 Oct (stills and the video edit).
- Higgsfield API dashboard (the key Control Center holds) → the 22 Kling jobs and the two Seedance jobs by the
  provider ids above.
- Runway → the one `video_to_video` task `bba017ac`.

These are the owner's logins. An agent has no supported read of any of them; none was attempted.

## Not counted here — the 8 Oct draft (the "$30 test")

8 Oct 08:58 CT to 22:24 CT, same variation: 25 still requests with a recorded figure ($3.50); 16 still requests whose
job row says "the image request did not finish — no picture was recorded" although a picture was filed later (no
figure recorded; $2.24 if each drew two — HYPOTHESIS, test: the xAI console); 18 Kling 5 s clips ($6.30). About
$12.04 by these rows; the status note of that night says "about $12.88".
