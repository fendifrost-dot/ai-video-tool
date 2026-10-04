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

## Grok image MCP — prepared, not enabled

Fendi asked for it to be enabled. It cannot be done from a cloud session: the login it uses is the Grok CLI's own
file on the Mac (`~/.grok/auth.json`), and that file is not copied anywhere. It also remains an undocumented use of
that login (see the verdict above) — the risk is to the SuperGrok Heavy account. If it is to be tried, on the Mac:

1. `git clone https://github.com/notfixingit3/grok-image-mcp ~/agent-tools/grok-image-mcp && cd $_ && go build -o grok-image-mcp .`
   (build from source; do not use the release binary). Read `main.go` first — only `oauth.go` and the request
   destinations were read in the audit.
2. Register it with **OAuth only**, so it can never fall back to the paid API key:
   `{"mcpServers":{"grok-image-mcp":{"command":"/Users/gocrazyglobal/agent-tools/grok-image-mcp/grok-image-mcp","env":{"GROK_IMAGE_AUTH":"oauth","GROK_IMAGE_MODEL":"grok-imagine-image"}}}}`
3. `get_configuration_status` must say "Grok subscription OAuth is active". One `generate_image`, then check
   console.x.ai usage: the image must NOT appear there. A 403 means the tier has no such access — stop.
4. Not wired into AVT. AVT's stills go through `world-still-proxy` on the API key until a documented route exists.
