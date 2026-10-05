# Integration agent → repo · subscription billing route and cost audit (2026-10-03)

> Written by the integration agent (Claude, session 01QySQR3B2J8Essrd4t3PAFK). The testing agent owns
> `CLAUDE_LATEST.md`, the retest, playback QA and retest spend; this file does not replace it.
> Branch `claude/subscription-billing-route`. **Nothing here is deployed. No paid generation was run. $0 spent.**

## State in one paragraph

Every provider job now records which money pays for it. A plan-credit ("subscription") route for Higgsfield exists
in code, off, with no verified operation — because **the Higgsfield account (fendifrost@gmail.com) is on the Free
plan with 10 credits** (read from higgsfield.ai → Subscription, 2026-10-03 21:20 CT), and Higgsfield requires an
active paid plan for agent connections. The route cannot be verified until a plan exists; buying one is Fendi's
decision.

## Accounts as actually found (read in Fendi's signed-in Chrome, read-only)

| Account | Plan / balance | Evidence |
| --- | --- | --- |
| Higgsfield (website plan) | **Free**, 10 / 10 monthly credits, 0 unlimited models | higgsfield.ai/me/settings/subscription |
| Higgsfield API | separate dollar balance, topped up by Fendi before the rev 61 retest | handoff rev 61; console not opened this session |
| Grok (grok.com) | **SuperGrok Heavy**, weekly limit **0 % used** (resets Oct 9), Grok Bot limit 46 % used, $10.00 extra usage credits | grok.com → Settings → Account / Usage |
| xAI API (console.x.ai, team "Boltz") | **$30.00** remaining; last 7 days $12.72 = image & video $9.53 + text $3.19 | console.x.ai dashboard / usage |
| Runway (web app) | **Free**, 102 credits (the API developer account is separate) | app.runwayml.com |
| OpenAI platform | not signed in — not read | platform.openai.com showed the login page |

## Higgsfield MCP / CLI — what is verified

- Publisher: `@higgsfield/cli` 1.1.26 on npm, maintainers at higgsfield.ai, source `github.com/higgsfield-ai/cli`;
  postinstall fetches a release binary and checks its SHA-256 against checksums in the package.
- Hosted MCP: `https://mcp.higgsfield.ai/mcp`, OAuth (authorization-code + PKCE for Claude; a device flow for
  headless agents). Added to Fendi's Claude account as a custom connector; consent pending his click.
- Billing rules, from Higgsfield's help centre and pricing page: every agent generation deducts plan credits;
  "Unlimited access and free generations apply only on higgsfield.ai"; "An active paid subscription is required";
  API keys and the API balance are a separate developer product. All three of the brief's statements hold.
- CLI surface (from `--help`, no sign-in): `generate create|cost|get|list|wait`, `--video-references`,
  `--image-references`, `--start-image`, `--end-image`, `upload`, `account status|transactions`, `model list|get`,
  `workspace`. `generate cost` quotes credits without creating a job.
- **Not verified** (the CLI answers nothing without a signed-in paid plan): the job_type for Seedance 2.5
  reference-to-video; whether duration / resolution / aspect are accepted beside a video reference; whether audio
  can be switched off; whether input seconds are billed as they are on the API; the credit quote for AVT's 4 s
  720p restage. These are the `_open` items in `config/higgsfield_subscription.json`.

## What was built (commit 871a39f)

- `src/lib/worldBatch/billing.ts` — `settings.billing` on every job (`route`, `source`, estimate, quote, actual
  credits, why and when it moved). `decideAfterApiRefusal`: a job moves from the API to plan credits only when the
  API refused it with Higgsfield's explicit no-funds words, the operation is verified on the plan, and routing is on.
  An accepted API job is never moved. Nothing is substituted. `SUBSCRIPTION_ROUTING = { enabled: false, verifiedRoutes: [] }`.
- `runner.ts` — stamps the record before the money moves; on a qualifying refusal parks the SAME row (one row, one
  provider call); a parked row reads as running, so a run never submits it again.
- `supabase/functions/_shared/jobProgress.ts` — the server does not ask Control Center about a plan-credit job, does
  not fetch its clip, and never fails it (a failed row is retried; a retry of a job the runner may have sent is a
  second charge). It writes what it is waiting for on the row, and attaches the clip once the runner has saved it.
- `scripts/runner/higgsfield_subscription_runner.py` — `check` and `quote` (spend nothing), `run`, `reconcile`.
  Conditional claim, write-ahead "submit started", credit cap per job, request sent as recorded.
- Tests: `billing.test.ts` (17), `scripts/runner/tests` (6). Whole suite: 183 files, 2077 passed, 1 skipped; tsc clean.

**Runner dependency, stated plainly:** the plan-credit route runs only while a signed-in runner is up — the CLI on a
computer, or a Claude session using the connector. AVT's server cannot spend plan credits. Server-side autonomy is
not claimed and has not been demonstrated.

**Deploy note for whoever merges:** `jobProgress.ts` is edge code (`provider-jobs-tick` redeploy); the rest is app
code (Publish). With routing off, behaviour is unchanged except that new job rows carry `settings.billing`.

## To finish, in order (each needs the step before)

1. Fendi: approve the Claude ↔ Higgsfield consent; decide on a plan.
2. `runner check` on the plan → fill `job_type` and params, get the credit quote for the 4 s 720p restage.
3. One authorized eligible job on plan credits: generation, retrieval, right shot, billing source, page closed.
4. Only then `verified: true`, `enabled: true`, `verifiedRoutes: ["seedance_ref"]`.

## Grok subscription image generation — verdict: UNRESOLVED, left disabled

`notfixingit3/grok-image-mcp` (Go, standard library only, 1 star, all 16 commits on 2026-06-08): reads the Grok
Build CLI's OAuth token from `~/.grok/auth.json`, refreshes it at `auth.x.ai`, and sends it as the bearer to
`api.x.ai/v1/images/generations|edits`. Destinations are xAI's only. In `auto` mode it falls back to `XAI_API_KEY`
(paid) unless `GROK_IMAGE_AUTH=oauth`. xAI's own documents: the Imagine API describes API-key auth and per-image
prices only; subscription OAuth is announced for coding agents (Grok Build, OpenCode). No xAI document says the
subscription token may be used for image endpoints, and the project's own README warns of 403s on some tiers. Using
it means repurposing the coding CLI's credential on an undocumented route — not done, no test run.

## Savings, ranked

See the checkpoint in chat for the table; the short form: (1) Higgsfield plan credits for Seedance restaging —
test next, needs a plan, estimated 55–80 % per second, unverified; (2) 480p drafts for timing/framing retests —
usable now, 47 % per second at list; (3) SuperGrok Heavy — owned and idle, but no documented agent route for
images; manual use only; (4) Runway, OpenAI, Fal — nothing to route.

## Update 21:55 CT — connectors connected (Fendi: "the connection is the most important thing … hit the on switch when it's time")

| Connector | Where | State | Billing when used |
| --- | --- | --- | --- |
| Higgsfield — `https://mcp.higgsfield.ai/mcp` | Fendi's Claude account (custom connector) | **Connected.** 48 interactive tools, all "Needs approval". No plan bought: the plan offer was skipped ("Skip & proceed to MCP"), the 3-day trial was NOT started (it renews at $49/mo). | Plan credits (account is Free, 10 credits) |
| Runway — `https://mcp.runwayml.com/mcp` | Fendi's Claude account (custom connector) | **Connected**, workspace "Fendi" (Personal · Free). 21 interactive tools, "Needs approval". Scope granted: view name/email; access workspace, generations, content; create, edit, delete content; use available credits. | Runway web-app credits (102), NOT the API account's credits |

Higgsfield tools seen on the connector page (names as shown): Generate Video, Generate Image, Generate Audio,
Generate 3D, Upload Local Media, Manage Reference Elements, Motion Control (Recast), Reframe Video, Outpaint Image,
Remove Background, Upscale Image, Upscale Video, Voice Change, Dubbing, Create Voice, Show Generations (By IDs),
Wait For Generation Jobs, Check Balance, Show Plans & Credit Top-ups, Get MCP Preferences, plus Ads / Marketing /
Shorts / TikTok / Website tools AVT does not use. Two to leave alone: "Cancel Trial Auto-renewal", "Credit Reset".
Runway tools seen: Generate Image, Edit Video (Aleph 2.0), Expand Video (Aleph 2.0), Enhance Video Draft, Enhance
Frame Rate, Convert Video to HDR, and others not read.

Both connectors are connected at the account level and **not enabled in the integration agent's running chat**, so
no connector tool has been called yet: the parameter read and the credit quote are still open. A new Claude session
with the two connectors switched on (or this chat's connector toggle) can do them with no spend: Check Balance,
then the Generate Video tool's schema for Seedance 2.5 with a video reference.

The connector route and the CLI route spend the same plan credits. The connector needs no computer; the CLI runner
(`scripts/runner/`) needs a signed-in one. Which of the two becomes AVT's runner is decided when the plan exists:
a scheduled Claude session can claim parked jobs and call the connector, with the same claim / write-ahead /
reconcile rules the script uses.

## Grok image MCP — ON HOLD (corrected 22:05 CT)

An earlier revision of this file gave Mac-side steps for a live test. That was premature and is withdrawn: Fendi's
brief requires the subscription login to be verified as a supported route for image generation BEFORE any live
test, and moving execution to the Mac does not answer that. Status stays UNRESOLVED; nothing is to be built, run or
tested until xAI documents subscription sign-in for its image endpoints (or says so in writing).

## Update 22:05 CT — connector tools read in the integration session (nothing generated, 0 credits spent)

Who approved what: Fendi signed in to Higgsfield and Runway himself. The integration agent added both custom
connectors in Claude and clicked the two consent buttons ("Allow" on Higgsfield's page, "Allow access" on Runway's)
in Fendi's signed-in Chrome, after his message "Do everything that you can on your end … the connection is the most
important thing". Both are the providers' documented Claude flows (authorization code + PKCE, redirect to
claude.ai). The earlier statement that Fendi had to click was written before that message. The Higgsfield CLI
sign-in was started and abandoned: no CLI credential exists anywhere.

**Higgsfield (balance: free plan, 10 credits).** `seedance_2_5` exposes `mode: omni_reference` with media roles
`video_references`, `image_references`, `start_image`, `end_image`, `audio_references`; `duration` 4–30 s;
`resolution` 480p / 720p / 1080p; `aspect_ratio` incl. 9:16; `generate_audio` bool. That is every input AVT's
restage sends (source clip, optional still, seconds, size, aspect, audio off). Also present: `video_edit` (edits one
reference video, billed by its duration). Quotes read with `get_cost: true`, audio off, 9:16:

| Seedance 2.5 omni_reference | credits | at Plus monthly ($59 / 1,200) | API list today |
| --- | --- | --- | --- |
| 4 s 480p | 12 | $0.59 | $1.97 |
| 4 s 720p | 28 | $1.38 | $3.70 |
| 8 s 720p | 56 | $2.75 | $7.40 |
| 4 s 1080p | 48 | $2.36 | $9.10 |
| 4 s 720p with a video reference attached | 28 | $1.38 | $3.70 |

The quote did not change when a video reference was attached (the API bills input seconds as well). So a 720p
restage is about 63 % cheaper on Plus monthly; 1,200 credits is 42 such restages. This corrects the earlier
"roughly $0.74" estimate, which came from the pricing page's "~80 videos" line. A public-domain 5 s test clip
(`flower.mp4`, media id 597a7018-d36c-4515-967d-ac2e7aacb33d) was imported into the Higgsfield media library to
get the with-reference quote. Not proven: a real job's output, its result link, and the actual charge.

**Runway (free plan, 102 credits = 75 plan + 27 purchased).** `whoami` returns `availableVideoModels: []`: the free
workspace cannot run ANY video tool (generate, edit, expand). The 102 credits work only for image models
(nano-banana-pro, nano-banana-2, seedream-5, gen-4, …). Plans: Standard $15/mo (625 credits), Pro $35/mo (2,250),
Max $95/mo (9,500); top-ups $10 per 1,000 credits. Aleph 2.0 `edit_video` costs 28 credits per second of source.
Runway's Seedance rate in credits was not read (no quote tool without a paid plan).

## How a Claude session receives AVT jobs and returns results (connection to Claude alone does not connect AVT)

The queue is AVT's own `provider_jobs` table. Nothing lives only in a chat.

1. **In:** when the API refuses a verified operation for lack of funds (routing on), the app parks the same row
   with `settings.billing.route = "subscription"` and `settings.billing.inputs` = the signed links to the job's own
   source clip and still (a day's life) — a connector session cannot sign storage links itself.
2. **Claim:** a Claude session with the Higgsfield connector and the Lovable connector reads parked rows with
   `query_database` and claims one with a conditional `UPDATE … WHERE … runner->>'claimedAt' IS NULL RETURNING`.
3. **Run:** `media_import_url` for each input → `generate_video` with `get_cost: true` → refuse above
   `max_credits_per_job` → write `submitStartedAt` on the row → `generate_video` → write the job id → `jobs_wait`.
4. **Out:** the session writes `status = succeeded` and `response_payload_json.resultUrl` on the row. From there
   it is AVT's server: `provider-jobs-tick` fetches the clip from that link, stores it, files it and puts it on its
   shot (`jobProgress.ts` → `saveClip` → `ingestOne(…, directResultUrl)`), with no session and no page open.
5. **No second charge:** same rules as the CLI runner — a row with `submitStartedAt` and no job id is never
   submitted again; the connector's own rule is the same ("on a transport timeout … do not automatically resubmit").

What this does and does not give: retrieval, storage and shot assignment are server-side and durable. Submission is
not: it happens only while a Claude session runs (a scheduled task can do it on a timer with the computer off, but
Claude's connector tools ask for approval unless their permission is changed, and a scheduled run has no one to
approve). Unproven until one authorized job runs: every step of 2–4 against the live plan.

## Connector permissions (nothing changed yet)

Claude's connector page has three settings per tool: always allow, needs approval, blocked. Purchases cannot be made
through either connector (both only link out to the provider's site). Proposed, for Fendi to set or approve:
always allow the reads (`balance`, `transactions`, `models_explore`, `jobs_wait`, `show_generation_by_ids`,
`list_workspaces`, `get_preferences`; Runway `whoami`, `get_task`, `list_recent`); always allow `media_import_url`;
keep `generate_video` on approval until the first job passes — the credit quote lives in the same tool as the
spend, so the budget cap has to be enforced by the runner's own rule, not by the permission; block what AVT never
uses and that publishes or changes things (`deploy_website`, `publish_website`, `website_*`, `tiktok_*`,
`sandbox_exec`, `apps_invoke`, `cancel_trial_auto_renewal`, `participate_in_contest`).

## Update 23:45 CT — permissions set, the cap and the reconcile rule made executable

**Correction to the 22:05 note.** The checks were no-spend, not read-only: one test clip was imported into the
Higgsfield media library. And "neither connector can make a purchase" was too broad: Higgsfield's connector lists
app-only tools "Confirm Billing Purchase" and "Confirm Trial Cancellation". App-only tools have no permission
setting and are driven by a person in the connector's own widget, not by Claude's tool calls.

**Connector permissions as set (Claude → Customize → Connectors), 2026-10-03 23:40 CT:**
- Higgsfield: interactive tools (48, incl. Generate Video, Deploy/Publish Website, Cancel Trial Auto-renewal) =
  Needs approval. Read-only tools (38) = Always allow. Write/delete: Import Media URL = Always allow; Invoke App
  Action, Create Website, Rename Website Subdomain, Enter App Contest = Blocked; the rest = Needs approval.
  Generate Video had become "Always allow" when this session first used it; it is back on Needs approval.
- Runway: interactive (21) = Needs approval; read-only (9) = Always allow; write/delete = Needs approval.
- The blanket setting for a group hides per-tool switches, so the website / TikTok tools in the interactive group
  are on approval rather than blocked. A run with nobody to approve cannot use them either way.

**The credit cap is code** (`supabase/migrations/20261004030000_subscription_route_gate.sql`, NOT applied):
`authorize_subscription_submit(job, quote, runner)` is the only way a row gets "submit started". It refuses when the
route is off (`subscription_route_config.enabled`, default false), the quote is above `max_credits_per_job` (60),
or the month's credits plus the quote pass `max_credits_per_month` (1,200), and it writes the start mark in the same
statement that checked. Limit of this: it gates AVT's record, not Higgsfield. A session that called Generate Video
without asking the gate would not be stopped by it — which is why Generate Video stays on approval until a job has
passed, and why the plan's own credit balance is the outer bound. The CLI runner has its own per-job cap in Python
and does not yet use the monthly cap.

**Accepted by the provider, then the session dies before the job id is saved.** The row already says "submit
started" (written before the provider is called). From then on `authorize_subscription_submit` answers
"unreconciled" for that row, to every runner, forever: nothing resubmits it. Reconciling is a separate act: look at
Higgsfield's own job list and credit transactions since the start time. If the job is there,
`record_subscription_submit(job, id)` attaches it (once; a second id is refused). If it is not there,
`clear_unreconciled_submit(job, evidence)` removes the mark and keeps the evidence on the row; only then can the job
be authorized again. Scenarios: `supabase/tests/subscription_route_gate.sql`, run against a throwaway Postgres 16 —
all thirteen answers as expected.

**Still a claim until a real job proves it:** that the server fetches, stores and assigns the clip after the session
has stopped. Tested with stand-ins only (`billing.test.ts`). The first live job must be run with the session ended
after the result link is written, and the row watched to `attachedBy: "server"`.

**Economics, qualified (Fendi / ChatGPT):** $1.38 per 4 s 720p restage holds only if all 1,200 credits are used.
At $59 a month the plan costs $5.90 per restage at 10 a month, $3.69 at 16, $1.97 at 30, $1.40 at 42, against
$3.70 on the API. Break-even is about 16 comparable restages a month, before tax; retries spend the same allowance.

## For the testing agent — the one capped end-to-end test (not scheduled; needs the plan and Fendi's word)

One `seedance_ref` job, 4 s, 720p, audio off, on an existing shot whose API restage already exists for comparison.
Before: apply the migration, set `enabled = true` with `max_credits_per_month = 60` for the test, merge PR #167,
redeploy `provider-jobs-tick`, publish. Run: park the job, authorize (expect quote 28), submit through the
connector, write the id, wait, write the result link, END THE SESSION. Pass means: clip stored, on its shot,
`attachedBy: "server"`, `billing.actualCredits` matches Higgsfield's transactions, and the take check
(lip timing, framing) is no worse than the API restage of the same shot. Then, and only then, `verifiedRoutes`.
No generation is to be started by the integration agent without the testing agent's go.

## Update 00:05 CT, Oct 4 — Higgsfield's ACTUAL API charges read (open.higgsfield.ai, Fendi's signed-in Chrome, read-only)

The retest report could not read these ("its console is signed out"). It is signed in now. Balance **$49.60**;
auto top-up off; October: **$80.30 over 81 requests** (10/1 29, 10/2 13, 10/3 38, 10/4 1). By model: Seedance 2.5
$54.64, Kling 2.5 Turbo Pro i2v $12.60, DoP $5.84, Genjutsu $4.77, Kling t2v $2.45. Latest transactions, newest first:

| Date | Type | Amount |
| --- | --- | --- |
| Oct 4 | Usage | −$2.22 |
| Oct 3 | Top-up | +$50.00 |
| Oct 3 | Usage | −$2.22 |
| Oct 3 | Usage | −$3.33 |
| Oct 3 | Usage | −$2.22 |
| Oct 3 | Usage | −$0.35 (×4) |
| Oct 3 | Usage | −$2.22 |

Reading (by amount, order and proportion — the console's rows carry no AVT job id, so this is a match, not a join):
the fresh section's three restagings (4 s, 6 s, 4 s) were charged **$2.22, $3.33, $2.22 = $7.77**, where AVT
recorded $3.70, $5.55, $3.70 = $12.95; the Oct 4 retest was charged **$2.22**, recorded $3.70. That is $0.555 per
OUTPUT second at 720p. AVT's estimate (`seedance_usd_per_s` 0.4622 × source seconds × 2) overstates Seedance by
about 67 %. Nothing was changed in `config/provider_rates.json` / `rates.ts` / `estimate.ts` — they are shared with
the testing agent and the ceilings are computed from them; the correction is theirs to land (rate 0.555 per output
second at 720p, no doubling; 480p and 1080p not yet observed). A fifth $2.22 on Oct 3 sits before the Kling
charges and is not attributed here.

**What this does to the subscription case.** Against the real $2.22, a 28-credit restage on Plus monthly ($1.38 at
full use) saves about 38 %, not 63 %, and break-even is about **27** comparable restages a month, not 16
($59 / $2.22). With restaging itself judged not ready for unattended use (retest: timing early, lighting failed,
lip sync unverified) and filmed performance preferred, the plan does not pay for itself on restaging at current
volume. The connections cost nothing to keep.

**The billing-path test** (section above) is amended: it must ride on a generation the testing agent already plans
for its own reasons — not a further creative retry of c035, which is paused — and its pass criteria are the
plumbing ones only (stored, assigned by the server, credits match). Creative acceptance of the clip is the testing
agent's separate verdict.

## Update 02:40 CT, Oct 4 — reply to `TESTING_TO_INTEGRATION_2026-10-04.md`

Read at main `7380312`; main is merged into this branch (no conflicts; one expectation in `billing.test.ts` moved
from $3.70 to the charged $2.22; whole suite 186 files, 2,111 passed, 1 skipped; tsc clean). Thank you for
attributing the fifth $2.22 (`5d2e007a`, c017) and landing the charged rate.

Agreed state: restaging is paused, no generation is planned, the account is Free with 10 credits, and nothing argues
for buying a plan now. So the billing-path test is **not scheduled and not waiting on anything of yours**. The route
is ready to be tried the day there is (a) a plan and (b) a job wanted for its own sake — `c037` is noted as the
candidate. Until then PR #167 stays a draft with routing off. A billing test's clip is judged by your acceptance
record, never read as a creative pass.

## Update 06:50 CT, Oct 4 — closed out against the testing agent's later note (main `2261a24`)

Main merged in again (no conflicts). `billing.test.ts` no longer hard-codes a dollar figure: it holds the billing
record to whatever estimate the row carries, so a rate-rule change cannot break it again.

The API column of the 22:05 comparison table is superseded by Higgsfield's published token rule (testing agent's
note): a 4 s restage with a 4 s source is $0.99 at 480p, $2.22 at 720p (charged), $5.46 at 1080p; 8 s 720p is $4.44.
Plan credits for the same: 12 / 28 / 48 (56 for 8 s). On Plus monthly at full use that is $0.59 / $1.38 / $2.36.

**Recommendation recorded (ChatGPT's, relayed by the testing agent — NOT a purchase decision by Fendi; corrected
4 October 19:45 CT, see the last section): do not buy the plan yet; keep the MCP integration available for later.** State this branch is left in: connectors connected with the permissions listed above;
routing off; the database gate written and tested on a throwaway database, not applied; nothing deployed; PR #167 a
draft. To switch on later: buy a plan → apply the migration → merge and deploy → one wanted job through the route,
session ended before the clip lands → only then `enabled` and `verifiedRoutes`. Grok stays on hold.

## PARKED — 4 October 2026, 19:45 CT (Fendi: "Keep PR #167 parked, routing disabled, and purchases paused")

No paid generations, no deployment, no further merges of main into this branch. The branch stays as it is until a
concrete production need reactivates it; whoever picks it up merges main first and re-runs the suite.

**Three corrections to the record, on Fendi's instruction:**

1. **"Do not buy the plan yet" is ChatGPT's recommendation, not a purchase decision by Fendi.** An earlier section
   of this file, following the testing agent's note, called it "Fendi's decision". Fendi has made no purchase
   decision either way. **No purchase is authorized** — no plan, no trial, no top-up, on Higgsfield or Runway — and
   nothing in this file should be read as standing permission to buy later. (The same wording is in
   `TESTING_TO_INTEGRATION_2026-10-04.md` on main, item 3; that file is the testing agent's and was left as it is.)

2. **What the subscription connections are still for.** Compositing keeps the filmed performance: the artist's take
   is real footage and is not regenerated, so performance restaging is not what a plan would be bought for. The
   things that ARE generated around the take — backgrounds, plates, B-roll — may still go through the subscription
   connections where the connector supports the operation and it is cheaper than the API for that operation. An
   earlier line here said the next test draws "nothing a plan-credit route would carry"; that was too strong. The
   route as built carries one operation (`seedance_ref`); a still or a Kling plate through the connector would need
   its own operation verified, its own quote and its own break-even — none of which has been read yet.

3. **Pricing is established by its own tests, not by the routing test.** `billing.test.ts` only holds the billing
   record to whatever estimate the job row carries; it says nothing about whether that estimate is right. That is
   established separately, and was checked on this branch (71 tests in `src/lib/worldBatch` and
   `src/lib/storyboard/restage.test.ts`, all passing):
   - `worldBatch.test.ts` → "seedance is priced by the provider's token rule" asserts the documented formula
     (`ceil(height × width × (input s + output s) × 24 / 1024)` tokens, $0.0214 per 1,000 at 720p, × 0.6 with a video
     input) against fixed dollar outcomes: 4 s from a 4 s source = 172,800 tokens = $2.218752 → **$2.22, the amount
     charged**; 6 s = **$3.33, charged**; the durations AVT really sent (4.004 s, 6.006 s) → still $2.22 and $3.33.
   - `restage.test.ts` asserts the same two charged amounts through `restageEstimateUsd`.
   - Recomputed by hand, outside the repo's code: 1280 × 720 × 8 × 24 / 1024 = 172,800 → $2.2188; with 4.004 s,
     172,887 → $2.2199; 6.006 + 6 s → 259,330 → $3.3298. They agree.
   - **One open inconsistency, at 480p only.** The rule with the configured 854 × 480 pixels gives $0.2056 per
     second without a video input, and the test asserts that figure as "the provider's per-second figure" — but the
     provider's per-second list in the same config says $0.2468 (720p and 1080p reproduce their list figures
     exactly: $0.4622, $1.1372). So either the 480p pixel count is not 854 × 480 or the list differs; the 480p
     restage estimate ($0.99) may be about 20 % low (about $1.18). Nothing has been charged at 480p or 1080p, so
     both remain the published rule, unverified. Left for the owner of `config/provider_rates.json` — not changed
     here.

**State at parking:** connectors (Higgsfield, Runway) connected in Fendi's Claude account, reads on always-allow,
generation on approval; `SUBSCRIPTION_ROUTING.enabled = false`, `verifiedRoutes = []`; database gate migration
written and tested on a throwaway database, not applied; nothing deployed; PR #167 draft; Grok on hold; $0 spent by
this session.
