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
| **No worker has claimed a job since 18 Oct.** `edit_renders` holds three rows in all; the last two were claimed by `box:grokbox` and a cloud agent on 18 Oct | same query |
| `claim_edit_render` hands the oldest queued row to whoever asks, whatever its kind | `supabase/migrations/20261018100000_edit_render_worker.sql:62–81` |
| The worker API signs inputs only from `plan.inputs.items`; a job submitted through `avt_job_submit` stores asset ids instead, so it would be handed no files | `supabase/functions/edit-render-worker-api/index.ts:67–80`, `supabase/functions/avt-mcp/jobHandlers.ts:55–62` |
| Every table and bucket still carries an open `_open_test` policy, and anonymous sign-in is live | `RISK_REGISTER.md` SEC-4 |
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

**D4. The proof travels with the asset.** A put-back result is filed with
`metadata_json.putback = { proof_max, frames, face_found, preset, script_sha256, model_sha256, input_sha256 }`. A
result whose proof is not 0 is **not filed as a clip**: the job fails and says the number.

**D5. A whole-frame Dress output is an intermediate.** The app and the MCP label it so, and it cannot be made a
shot's primary until a put-back with proof 0 exists for it (slice e).

**D6. Nothing is selected for him.** The dressed clip is filed unselected. Only Fendi's words make it primary.

## 3. Where the worker runs (Fendi's decision; needs an answer before slice a is LIVE)

| Option | Cost | For | Against |
|---|---|---|---|
| **A. His Mac**, as a login item (`run-supervised.sh` under launchd), Python = the `~/.avt-venv` the scripts already run in, models and scratch on the T7 | $0 | it is where every approved put-back was made; nothing to rent; media stays on the T7 | 8 GB of memory: one job at a time, and not while a Blender render runs; only works while the Mac is on and the T7 is plugged in |
| **B. The Linux box that claimed jobs on 18 Oct** (`box:grokbox`) | unknown to me: whether it still exists and who pays for it | always on; a container image is ready-made (§4) | I cannot see it from here; it holds none of the models |
| **C. A rented CPU machine** | unknown until quoted. A put-back is CPU-only; how long one takes is not measured yet (slice a records it per job) | always on; no load on his Mac | a monthly bill for a job that runs a few times a day |

RECOMMENDATION: **A now**, built so that B or C is a change of host and nothing else (the same worker, the same
image, the same secret flow). A is $0 and is the environment the fixture already passes in.

## 4. The worker

- `workers/edit-render/putback.mjs`: the runner for `job_kind: "putback"`. It downloads the two inputs from the signed
  URLs the API hands it, checks the two model files against their recorded sha256
  (`selfie_multiclass_256x256.tflite` c6748b12…507e0e0, `face_landmarker.task` 64184e22…4e0bc9ff), runs the script,
  reads the proof line, and returns the output with the proof. One job at a time (the worker already enforces it).
- `worker.mjs` sends the kinds it can run with every claim. A worker with no Python, or without the models, never
  claims a put-back.
- `workers/edit-render/Dockerfile.putback`: the same image plus Python 3 with pinned `numpy`, `opencv-python-headless`,
  `mediapipe`, `scipy`. The model files are mounted, never baked in and never committed.
- Limits, enforced in the runner before the script starts: input ≤ 12 s and ≤ 1,000 frames, ≤ 3840 px on the long
  side, script wall time ≤ 20 minutes (the queue's own stale limit), scratch on the configured volume only.

## 5. Security (for the security reviewer)

The threat: with SEC-4 open, **any visitor can insert an `edit_renders` row**. A worker that runs Python on what a row
says is therefore running on untrusted input. The design treats the row as hostile:

| Surface | Control |
|---|---|
| What gets executed | one fixed script path inside the worker's own checkout, `python -I` (no user site, no `PYTHONPATH`, no current-directory imports). The row cannot name a script, a flag or an environment variable |
| Arguments | `settings.preset` must be one of a closed list compiled into the worker (§6). The preset expands to a fixed set of flags and `AVT_*` values. Any other key in `settings` fails the job before anything runs |
| Inputs | two asset ids. The API resolves them itself, and signs a file only when the asset row has the **same `user_id` and `project_id` as the job row** and sits in an allowed bucket. The worker never sees a path it could change |
| Who may queue a put-back | the API refuses to hand out a `putback` job whose `user_id` is not the owner of a registered worker (`edit_render_workers.owner_user_id`). An anonymous visitor's row is never claimed. This closes the SEC-4 hole for this job kind without waiting for RISK-001 |
| Output | uploaded only through the signed upload URL for `project-exports/{user_id}/{project_id}/renders/{id}.mp4`, as today |
| Secrets | the worker holds only its worker secret, as today. No service-role key, no provider key, no signed URL in any log (the runner logs asset ids and hashes) |
| Resources | the limits in §4; a job over them fails with the number |
| The media itself | a crafted MP4 reaching ffmpeg and OpenCV is a risk that exists today for the edit job; the owner check above narrows who can send one to the owner himself |
| Provider spend | none. The put-back calls no provider. The swap that precedes it stays in `dress-clip`, behind its own dry run and price |

RLS integration test: this change adds no policy. It adds one security-definer function (`claim_edit_render_kinds`),
revoked from `anon` and `authenticated` like the one it replaces.

## 6. Presets (named after the approved asset each reproduces)

| Preset | Flags and settings | Reproduces |
|---|---|---|
| `c033_showroom` | `AVT_HEAD_ZOOM=4`, `--base original`, head fit off, hat gap fill on | YSL c033 `5482b35b` and c041 `6f4edd50` (`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md:131`: "`AVT_HEAD_ZOOM=4` is the setting of both approved results") |
| `full_body` | `AVT_HEAD_ZOOM=3`, `--base original` | the full-body setting of `docs/PROBLEM_INDEX.md` ("Face found on few frames": 4, or 3 on full body) |
| `hyenas_verse_creature` | `AVT_HEAD_ZOOM=3`, `--base swap`, `--retime auto`, `--hat-gap-fill off` | Hyenas verse, face found 96/96 |

An override is a new preset with a written reason, reviewed like code. There is no free-form override at run time:
that is how the improvising starts.

Stills (`still_face_putback.py`, `still_face_from_photo.py` with `AVT_FACE_EXACT`) follow in the same shape once
PR #508's scripts are on `main`; they are not in slice a.

## 7. Fixtures and the kill criterion

| Fixture | Inputs | Must print |
|---|---|---|
| c033 clothing swap | take `c45e30c6`, stored Genjutsu output `5a81d308` | `max \|out-original\| on face/hair/skin: 0`; decoded-frame MD5 `5f268d20fa6a440487ccfa8bbcab4dd4` on the pinned library versions |
| Hyenas creature swap | the verse take and its stored swap | proof 0; face found 96/96 |

Slice a does not merge until the worker, run end to end on the c033 inputs, files a clip whose recorded proof is 0.
The decoded MD5 is expected to differ where the Python or MediaPipe version differs from the pinned one
(`reproduce_body_only_c033.sh` says so); the proof line is the gate, the MD5 is reported.

`docs/VIDEO_SWAP_ARCHITECTURE.md` kill criterion: unchanged. This pipeline adds no new swap engine; on his real takes
the canonical put-back already takes precedence over the keyframe lane (`CLAUDE.md`).

## 8. Failure modes

| Failure | What happens |
|---|---|
| No worker is up | the job stays `queued`; the app says "waiting for the worker" with how long. Nothing is charged, nothing is lost |
| The Mac sleeps mid-job | the row is reaped after 20 minutes and queued again, three attempts at most (existing behaviour) |
| His face is found on few frames | the job completes only if the proof is 0, and files the per-scene face counts; a low count is shown, never hidden |
| Proof is not 0 | the job fails with the number. No clip is filed |
| A model file is missing or its hash differs | the job fails before the script starts, naming the file |
| The swap has a different frame count or a cut the take lacks | the script's own warnings are stored with the job; the result is still gated by the proof |
| The worker's checkout is behind `main` | the runner records the script's sha256 on the asset; a stale script is visible, and the preset list is checked against the server's on claim |

## 9. What has to happen for slice a to be LIVE

1. Sign-offs on this note.
2. SQL, in Lovable's SQL editor only: `20261113120000_asset_store_extensions.sql` (still unapplied), then
   `20261120100000_putback_job_kind.sql` (adds `putback` to the kind check, makes `claim_edit_render` hand out
   edit jobs only, and adds `claim_edit_render_kinds`).
3. Merge; Lovable **Edge Functions → redeploy `edit-render-worker-api` and `avt-mcp`**.
4. A worker registered and running where Fendi says (§3).
5. The c033 fixture through the worker, proof 0, reported with the printed numbers.

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

1. Where the worker runs (§3). Recommended: his Mac, $0.
2. Whether the Blender light match (`comp_scene.py`) may be a default: he has not judged showroom v9 or room 2 v2.

## 12. What is CODED on the draft branch (19 Nov 2026), and what is not

CODED, with unit tests, **not merged, not applied, not deployed**:

| File | What |
|---|---|
| `supabase/functions/_shared/putback.ts` | the presets, limits, model hashes, the proof reader, the server's input and record checks |
| `workers/edit-render/putback.mjs` | the runner: downloads the two inputs, checks the models, runs the script with `python -I`, gates on proof 0 |
| `workers/edit-render/worker.mjs` | claims by kind; hands the runner the claim; sends the proof with the result |
| `supabase/functions/edit-render-worker-api/index.ts` | the claim and complete paths for a put-back (§5) |
| `supabase/functions/avt-mcp/jobContract.ts` | `avt_job_submit` accepts `putback` and refuses a bad one before it is queued |
| `supabase/migrations/20261120100000_putback_job_kind.sql` | §9 step 2. A file only: SQL runs in Lovable's SQL editor |
| `workers/edit-render/Dockerfile.putback` | the image with Python. **Never built** |

VERIFIED on Fendi's Mac, 19 Nov: the worker's capability check passes with the real interpreter and the real model
files (`{"ok":true, "versions":{"python":"3.9.6","numpy":"2.0.2","opencv":"5.0.0","mediapipe":"1.2.3"}}`, both model
hashes equal to the recorded ones).

NOT DONE: the c033 fixture through the runner. The Mac's swap was 9.0 GB of 10.2 GB in use when I checked
(`sysctl vm.swapusage`), another session was working on it, and a 240-frame put-back holds several GB; the rule on
that machine is one heavy job at a time. It is the first thing to run when the machine is free, and slice a does not
merge before it prints proof 0.

