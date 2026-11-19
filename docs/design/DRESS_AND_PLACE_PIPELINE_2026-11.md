# Design note: the four proven methods inside AVT ("Dress and place")

Job 3 of `docs/handoffs/HANDOFF_AVT_BUILT_IN_METHODS_2026-11-19.md` (§4). **Class C** (rendering, orchestration,
storage): this note comes before the code, and nothing here merges without three sign-offs (architecture, product,
security). Status of everything below: **PROPOSED**. Nothing is LIVE.

Fendi, 19 Nov 2026: "include the outfit swap, proper masking method with lighting matching and face repair of exact
pixels that we use frequently so that it is built directly into AVT. for some reason every agent tries to reinvent the
wheel on these costing me time and money."

Labels: VERIFIED (I read the line or ran the query, cited), OBSERVED, DECISION, RECOMMENDATION.

## 1. What is there today (VERIFIED, 19 Nov 2026)

| Fact | Evidence |
|---|---|
| None of the four methods runs in the app; each is an offline Python script | the handoff §4.1, re-read against `src/lib/regionSwap/`, `src/lib/composite/pixels.ts`, `src/lib/queries/faceRestore.ts` |
| The only worker outside edge functions is `workers/edit-render/` (Node 22 + ffmpeg; no Python in its Dockerfile) | `workers/edit-render/Dockerfile` |
| It already has a slot for other job kinds, but **no runner is wired**: `main()` calls `runOnce({ api, workerId })`, so any job that is not an edit fails with "no runner for …" | `workers/edit-render/worker.mjs:78`, `:95–97`, `:163` |
| **The job-kind column is not in the live database.** `select job_kind from edit_renders` answers "column edit_renders.job_kind does not exist": migration `20261113120000_asset_store_extensions.sql` is CODED, not applied | AVT MCP `avt_select`, 19 Nov |
| **No job has been claimed since 18 Oct, but a worker is alive.** `edit_renders` holds three rows in all, the last claimed on 18 Oct. The Linux worker `box` still polls every few seconds (`last_seen_at` six seconds before I read it, 19 Nov 23:22 UTC); the cloud agent's worker row is revoked | AVT MCP and Lovable `query_database`, 19 Nov |
| **Neither November migration is applied.** `edit_renders` has no `job_kind`, `project_id`, `input_asset_ids` or `settings`; `edit_render_workers` has no `owner_user_id`; none of the STORE-5 tables exist. STORE-5 is another Class C item still "in review; not deployed" (`RISK_REGISTER.md`) | Lovable `query_database` on `information_schema`, 19 Nov |
| **The job table's policy admits only edit rows.** `edit_renders_owner`: `user_id = auth.uid() AND sequence_id IN (own sequences)`. A job with no sequence cannot be inserted or read by its owner through the app or the MCP, which use the owner's own client. There is no open `_open_test` policy on this table, and `edit_render_workers` has no policy and no grant at all (service role only) | `pg_policies` and grants, 19 Nov |
| `claim_edit_render` hands the oldest queued row to whoever asks, whatever its kind | `supabase/migrations/20261018100000_edit_render_worker.sql:62–81` |
| The worker API signs inputs only from `plan.inputs.items`; a job submitted through `avt_job_submit` stores asset ids instead, so it would be handed no files | `supabase/functions/edit-render-worker-api/index.ts:67–80`, `supabase/functions/avt-mcp/jobHandlers.ts:55–62` |
| Most tables and every bucket still carry an open `_open_test` policy (not `edit_renders` or `edit_render_workers`: the row above), and anonymous sign-in is live | `RISK_REGISTER.md` SEC-4 |
| The c033 fixture reproduces from stored inputs at $0, with hashes for the inputs, the models and the decoded output | `scripts/edit/reproduce_body_only_c033.sh` |

So the handoff's "give that worker a Python runtime" is right in direction and short by three things: the queue has
to be made live first, a worker has to exist and stay up, and the claim has to be by kind.

## 2. Decisions proposed

**D1. The scripts run unchanged.** The worker calls `scripts/edit/body_only_swap.py` (and later
`composite_over_plate.py`, `matte_repair.py`, `matte_stability.py`, the four checks) as a subprocess with `python -I`.
Nothing is ported to TypeScript, and no script is "improved" on the way in. The fixture in §7 is how that is proved.

**D2. One new job kind per stage, on the queue that exists.** `putback`, then `checks`, `composite`. Each is a row in
`edit_renders` with `job_kind`, claimed by a worker that says which kinds it can run.

**D3. A job is a preset plus two asset ids. Nothing else reaches the command line.** See §5.

**D4. The proof travels with the asset, and is said for what it is.** A put-back result is filed with
`metadata_json.putback`: the preset and its exact flags, the proof, on how many frames of each scene his face was
found, one hash over the script and the five modules it imports, the worker checkout's commit and whether it was
dirty, the Python, library and ffmpeg versions, both input hashes, and the output's frames and size. A result is
**not filed** when the proof is not 0, when the script did not say where it found his face, when it found him on no
frame of any scene (a 0 that protected nothing proves nothing), or when the file's frame count is not the proof's.
A low face count is filed with a plain warning on the asset. The proof is the worker's own measurement, on the
frames before the final encode: the server checks the record against the job, it does not re-run the script or
hash the file, and the asset's note says so.

**D5. A whole-frame Dress output is an intermediate.** The app and the MCP label it so, and it cannot be made a
shot's primary until a put-back with proof 0 exists for it (slice e).

**D6. Nothing is selected for him.** The dressed clip is filed unselected. Only Fendi's words make it primary.

## 3. Where the worker runs (DECIDED 19 Nov 2026)

Fendi, 19 Nov 2026, asked which of the options below: "any technical decision is out of my range please make
whatever decision you deem necessary." DECISION (the agent's, under that delegation):

**The put-back worker is his Mac, started on demand.** Whoever queues a put-back starts the worker with `--once`
for that job, after checking the machine is free, and it exits when the job is done. It is not a login item and
not an always-on service.

| Why | |
|---|---|
| It is where every approved put-back was made | Python `~/.avt-venv`, the two model files on the T7, the capability check passes there (§12) |
| $0 | nothing to rent |
| It can never start a heavy job behind his back | the Mac has 8 GB and was at 9–12 GB of swap all of 19 Nov with one other session working; an always-on worker would start a put-back the moment one is queued |
| Media stays on the T7 | `AVT_SCRATCH_DIR` points the job's files at the T7; the worker's default is the system temp folder, which on his Mac is the internal disk and is not allowed |

Start it (the README has the same):

```bash
AVT_SCRATCH_DIR="/Volumes/T7/_avt_work/worker_scratch" AVT_MODELS="/Volumes/T7/Hyenas AVT edit/_avt_work/models" AVT_PUTBACK_PYTHON="$HOME/.avt-venv/bin/python" workers/edit-render/run-once-putback.sh
```

The Linux worker `box` keeps doing edit renders exactly as today: it asks for no put-backs and is handed none.
Giving it the Python runtime and the models later (the image is `Dockerfile.putback`) is a change of host, nothing
else; it would need a worker row owned by Fendi's user.

## 4. The worker

- `workers/edit-render/putback.mjs`: the runner for `job_kind: "putback"`. It downloads the two inputs from the signed
  URLs the API hands it, checks the two model files against their recorded sha256
  (`selfie_multiclass_256x256.tflite` c6748b12…507e0e0, `face_landmarker.task` 64184e22…4e0bc9ff), runs the script,
  reads the proof line, and returns the output with the proof. One job at a time (the worker already enforces it).
- `worker.mjs` sends the kinds it can run with every claim. A worker with no Python, or without the models, never
  claims a put-back.
- `workers/edit-render/Dockerfile.putback`: the same image plus Python 3 with pinned `numpy`, `opencv-python-headless`,
  `mediapipe`, `scipy`. The model files are mounted, never baked in and never committed.
- Limits, enforced in the runner: each input stops downloading at 1 GiB; then, before the script starts, ≤ 12 s,
  ≤ 1,000 frames, ≤ 3840 px on the long side, frames × width × height ≤ 520 million; script wall time ≤ 12 minutes
  (under the queue's own 20-minute stale limit), and at the limit the script's whole process group is stopped (it
  runs ffmpeg). Scratch is `AVT_SCRATCH_DIR`.

## 5. Security (for the security reviewer)

The threat: with SEC-4 open, **any visitor can insert an `edit_renders` row**. A worker that runs Python on what a row
says is therefore running on untrusted input. The design treats the row as hostile:

| Surface | Control |
|---|---|
| What gets executed | one fixed script path inside the worker's own checkout, `python -I` (no user site, no `PYTHONPATH`, no current-directory imports). The row cannot name a script, a flag or an environment variable |
| Arguments | `settings.preset` must be one of a closed list compiled into the worker (§6). The preset expands to a fixed set of flags and `AVT_*` values. Any other key in `settings` fails the job before anything runs |
| Inputs | two asset ids. The API resolves them itself, and signs a file only when the asset row has the **same `user_id` and `project_id` as the job row**, the project is that user's, the path is under **that user's own folder** of that project, the bucket is allowed, and the swap's own record says it is the Dress output **made from the original** (so the two cannot be reversed and a raw provider file cannot stand in). The worker never sees a path it could change |
| The same worker's other jobs | **Found by the security review, live since 18 Oct:** the claim handed ANY signed-in visitor's edit row to the always-on worker, and the edit runner executes the command line in a row's plan. Fixed here for every job kind: a worker is handed only the jobs of the account it belongs to (SQL), the API checks it again at claim and at complete, a worker says which kinds it takes (default `edit`; the Mac asks for put-backs only), and a claimed job carries the worker row's id, not just its label |
| Who may queue a put-back | only `queue_putback_job` makes a put-back row (the table's policy admits no row without an edit sequence, and is not changed). It acts for `auth.uid()` alone, refuses an anonymous session, checks the project and both files are that user's, takes a preset NAME only, and holds at most ten waiting put-backs a user |
| Who is handed one | `claim_edit_render_kinds` takes a put-back off the queue only for the user who owns the asking worker (`edit_render_workers.owner_user_id`, a table with no policy and no grant: service role only). Another user's put-back is never claimed by this worker, and the API checks the row again |
| Output | uploaded only through the signed upload URL for `project-exports/{user_id}/{project_id}/renders/{id}_a{attempt}.mp4`: one path per attempt, never overwritten |
| Secrets | the worker holds only its worker secret, as today. No service-role key, no provider key, no signed URL in any log (the runner logs asset ids and hashes) |
| Resources | each input: this project's storage only, no redirect, 1 GiB and 2 minutes at most; then h264/hevc/prores only, ≤ 12 s, and frames × width × height ≤ 520 million (what the script holds in memory: about 1.5 GB a clip, the size of the approved c033 window); the script's process group is stopped at 12 minutes; nothing of a failed job stays on disk; at most ten put-backs wait per user |
| Output | one object per attempt, never overwritten; a finished put-back set back to queued is not run again |
| The media itself | a crafted file reaching ffprobe, ffmpeg and OpenCV on the owner's machine. Only the owner's own door makes a job, so only a file the OWNER names is read; ffprobe runs with a bare environment (never the worker's secret) and the codec is checked before the script starts. **Residual, until RISK-001 closes:** every bucket and `project_assets` are open, so a stranger can plant a file under the owner's folder with a row to match; it is read only if the owner (or an agent acting for him) then queues a put-back naming it |
| What the proof guarantees | see D4. Whoever holds a worker's secret can file a clip carrying a proof record; the secret lives only on the worker's machine and its hash in a table no client can read |
| Provider spend | none. The put-back calls no provider. The swap that precedes it stays in `dress-clip`, behind its own dry run and price |

RLS integration test: this change adds, widens and drops no policy. It adds three security-definer functions:
`claim_edit_render_kinds` (service role only, like the one beside it), and `queue_putback_job` and `putback_job`
(callable by a signed-in user, each acting for `auth.uid()` alone, `search_path` pinned).

## 6. Presets (named after the approved asset each reproduces)

| Preset | Flags and settings | Reproduces |
|---|---|---|
| `c033_showroom` | `AVT_HEAD_ZOOM=4`, `--base original`, head fit off, hat gap fill on | YSL c033 `5482b35b` and c041 `6f4edd50`: the recipe's setting (`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md:131`). The 18 Oct file's decoded MD5 predates the swap-rate interpolation and is not expected to match |
| `hyenas_verse_creature` | `AVT_HEAD_ZOOM=3`, `--base swap`, `--retime auto`, `--hat-gap-fill off` | Hyenas verse, face found 96/96 (`docs/handoffs/HANDOFF_GROKBOT_HYENAS_PERFORMANCE_IN_SET_2026-11-13.md:137`) |

A clothing swap on a full-body frame (zoom 3 with `--base original`) has no approved asset behind it yet, so it is
not a preset: the first time one is needed it is added with the result Fendi approves.

An override is a new preset with a written reason, reviewed like code. There is no free-form override at run time:
that is how the improvising starts.

Stills (`still_face_putback.py`, `still_face_from_photo.py` with `AVT_FACE_EXACT`) follow in the same shape once
PR #508's scripts are on `main`; they are not in slice a.

## 7. Fixtures and the kill criterion

| Fixture | Inputs | Must show |
|---|---|---|
| c033 clothing swap | take window `c45e30c6`, stored Dress output `5a81d308` | proof 0; his face found on 240 of 240 frames. `hat_geometry.py` is reported against the approved final `5482b35b`; its pass range is **not set yet** (0.03–0.14 was measured on c041, not on this take) and is set from this fixture's own first run. The decoded MD5 of the 18 Oct file is reported, not required (it predates the interpolation step) |
| Hyenas creature swap | the verse take and its stored swap | proof 0; face found 96/96 |

Slice a is not LIVE until the worker, run end to end on the c033 inputs, files a clip whose record shows the first
row. **Not run yet** (the Mac's memory, §12), so two things in this note are unmeasured: how long a put-back takes
on that machine (the 12-minute limit is a guess that must hold under the queue's 20), and its peak memory. If c033
takes more than about ten minutes there, the limits and the stale reaper are revisited before anything else is
built on them.

Freezing the two fixtures read-only per `docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md` is part of slice b.

`docs/VIDEO_SWAP_ARCHITECTURE.md` kill criterion: unchanged. This pipeline adds no new swap engine; on his real takes
the canonical put-back already takes precedence over the keyframe lane (`CLAUDE.md`).

## 8. Failure modes

| Failure | What happens |
|---|---|
| No worker is started | the job stays `queued`, at no cost. The worker on the Mac is started on demand; nothing starts it by itself, and the app does not show a waiting put-back yet (slice e) |
| The Mac sleeps or the worker dies mid-job | the row is reaped after 20 minutes by the next claim of any worker and queued again (three attempts). It runs again only when a worker is started again |
| His face is found on few frames | filed with the counts and a plain warning; found on none in any scene: not filed |
| Proof is not 0, or the file's frames are not the proof's | the job fails with the number. No clip is filed, and it is not retried (only reaped jobs are) |
| A model file is missing or its hash differs, or the T7 is unplugged | the worker does not ask for put-backs at all; mid-job it fails before the script starts, naming the file |
| The swap is not conformed, does not say it was made from that window, or the two are reversed | refused at the claim (the swap's own record: `derived_from.asset_id` written by dress-clip, or `swap_of.asset_id` declared by whoever filed a creature or prop swap; which of the two is on the filed asset) and again by duration on the worker |
| The "original" given is itself a whole-frame Dress output | filed, with a WARNING in the asset's note: the face kept is that output's, not his own pixels. Refusing it outright waits for slice e (the one-call pipeline picks the inputs itself) |
| The inputs are too large for the machine | refused before the script starts, with the number |
| Two starts on one machine | the second stops: one put-back worker at a time (a lock in the scratch folder) |
| The worker's checkout is behind `main` or has local changes | the commit and a dirty flag are on the asset. Not refused yet: pinning an expected script hash is slice b |
| A signing error at the claim | the job goes back to the queue (while it has attempts left), it is not failed. A one-job run says what was set aside and asks again, up to five times |

## 9. What has to happen for slice a to be LIVE

| Step | State (19 Nov 2026) |
|---|---|
| 1. Sign-offs: architecture and security from independent reviewers (recorded on PR #512); product is Fendi's own request of 19 Nov and his delegation of the technical decisions | on PR #512 |
| 2. SQL, in Lovable only: `20261120100000_putback_job_kind.sql`. Self-contained: it does not need the pending STORE-5 migrations and applies before or after them. Four columns on `edit_renders`, one on `edit_render_workers`, the two claim functions, the owner's two functions. **No policy changes** | **APPLIED** 19 Nov ≈23:48 UTC through Lovable `query_database`, on Fendi's "Yes, apply it" in chat |
| 2b. The live worker `box` is given its owner, by hand, in the same editor (never derived from rows a visitor can write) | **DONE** with step 2. VERIFIED by a rolled-back test in the same editor: a queued edit row of another account was claimed 0 times by the old claim, 0 by the owner-scoped claim and 0 with no owner; the owner's own row was claimed once |
| 3. Merge; Lovable **Edge Functions → redeploy `edit-render-worker-api` and `avt-mcp`** | see §12 |
| 4. A worker row for the Mac, owned by Fendi's user (SQL in Lovable: label, the secret's sha256, `owner_user_id`). The secret is generated on the Mac and kept in `~/.secrets/avt_render_worker_mac.env` (mode 600); never in chat, the repo or SQL | see §12 |
| 5. The c033 fixture through the worker, proof 0, reported with the printed numbers | **NOT RUN**: the Mac's memory (pressure level 2 of 1/2/4 on 19 Nov) |

## 10. Order of slices (from the handoff §4.6, with what this note changes)

| Slice | What | Note |
|---|---|---|
| a | put-back with proof, as a job | needs §9 first: the queue is not live |
| b | the four checks filed with every put-back | same runner shape; `face_check.py` needs his face pictures from `artist-assets` |
| c | matte repair, stability and placement in the composite, off the browser | also fix the matte lane never finalising its `provider_jobs` row (audit §6) |
| d | measured light match | only the two tools he approved (`place_him_over_plate.py --gain --contrast`, `cover_regrade_figure.py`); the Blender path waits for his eye (audit §5) |
| e | the one-call pipeline and the MCP guard | `dress-clip` answers "intermediate: run the put-back" with the exact next call |
| f | docs | `CLAUDE.md` "Integration gap" is removed only when a is LIVE |

## 11. Open decisions for Fendi

1. ~~Where the worker runs~~ DECIDED (§3): his Mac, on demand, $0. Fendi, 19 Nov: "any technical decision is out of my range please make whatever decision you deem necessary".
2. Whether the Blender light match (`comp_scene.py`) may be a default: he has not judged showroom v9 or room 2 v2.

## 12. What is CODED on the draft branch (19 Nov 2026), and what is not

CODED, with unit tests. The SQL is applied (§9); the functions are live only once §9 step 3 is done and named here:

| File | What |
|---|---|
| `supabase/functions/_shared/putback.ts` | the presets, limits, model hashes, the proof reader and its gates, the server's input and record checks |
| `workers/edit-render/putback.mjs` | the runner: bounded downloads from this project's storage, input and pair checks, `python -I`, the gates, the record, cleanup |
| `workers/edit-render/worker.mjs`, `run-once-putback.sh` | kinds are said, not assumed; scratch is said; one job on demand on the Mac |
| `supabase/functions/edit-render-worker-api/index.ts` | a worker runs only its own account's jobs (every kind); the put-back's claim and complete paths |
| `supabase/functions/avt-mcp/jobContract.ts`, `jobHandlers.ts` | `avt_job_submit` queues a put-back through its own door; status reads through it |
| `supabase/migrations/20261120100000_putback_job_kind.sql` | §9 step 2. A file only: SQL runs in Lovable |
| `workers/edit-render/Dockerfile.putback` | the image with Python. **Never built** |

Reviews (independent agents, read-only): architecture and security both returned CHANGES REQUESTED on the first
draft (`3ae94e41`); what they found and what was done about each is on PR #512.

VERIFIED on Fendi's Mac, 19 Nov: the capability check passes with the real interpreter and the real model files
(both model hashes equal to the recorded ones).

NOT DONE:
- ~~The SQL is not applied~~ **APPLIED and verified** 19 Nov ≈23:48 UTC (§9 steps 2 and 2b), on Fendi's "Yes, apply it".
- **The c033 fixture through the runner.** The Mac's swap was 9–12 GB of 10–13 GB in use all of 19 Nov with other
  sessions working; one heavy job at a time there.
- Stage 1 of the handoff's table (cutting the window in the worker) and the checks of slice b.
- No test runs the edge function's handler or the SQL: both are covered only by `deno check` and reading.

