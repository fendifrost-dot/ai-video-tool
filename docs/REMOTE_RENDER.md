# Remote render — Partnership

Two recipes. `lock_v1e` (the default) is the verse chunk runner below. `lock_v2` is the whole-song LOCK_v2 master, in [LOCK_v2](#lock_v2-whole-song-master).

The final Partnership composite is a deterministic Python compositor, not an edge function. On one 16 GB Linux worker it is about 3.4–3.9 seconds a frame (5542 frames, about 6.3 hours), and each worker peaks around 6.6–7.3 GB while it decodes 4K ProRes.

The chunk runner is `render_verse_v9look_v1e_p.py` (sha256 `70cf2a794f78195fb976fd7178d4c2470699600d3ba55f7551d98a6b4d573348`). A state-only pass saves the running state at each chunk start. A chunk that loads that state is bit-identical to a single pass on the same machine (proof: `ptest_v1e/IDENTITY.json` in the lock bundle). The script hardcodes its work tree as `/workspace/partnership/second_half`. Do not edit it to move that path: the sha256 would change.

This runner plans that job. A dry-run is the default. It does not create a VM, a disk, or a bucket.

```bash
python3 scripts/render/remote/remote_render.py --backend gcp --dry-run
```

## Local stage (no AVT credentials)

Use this when the launcher already has the lock tree and it cannot mint `AVT_ACCESS_TOKEN`, `AVT_ANON_KEY`, or `AVT_BATCH_SECRET`. Nothing in this mode reads or writes `project-clips`. The default `--stage-from avt` path below is unchanged.

The transport is `gcloud compute scp` and `gcloud compute ssh`. That matches a service account with only `roles/compute.instanceAdmin.v1` and `roles/iam.serviceAccountUser`. A GCS bucket is not created. A bucket would need `roles/storage.admin` (to create it), `roles/storage.objectAdmin` (to read and write objects), and the `storage.googleapis.com` API. Enabling that API needs `roles/serviceusage.serviceUsageAdmin`. This runner does not call those.

```bash
export GCP_PROJECT=avt-render
# GOOGLE_APPLICATION_CREDENTIALS is the compute-only service account.
# Do not export AVT_ACCESS_TOKEN, AVT_ANON_KEY, or AVT_BATCH_SECRET.

python3 scripts/render/remote/remote_render.py \
  --backend gcp \
  --stage-from local \
  --dry-run \
  --lock /workspace/partnership/second_half/claudia_dx/v1/renders/verse_v9look_v1/LOCK_v2.json \
  --work-root /workspace/partnership/second_half \
  --parity-dir /path/to/linux_stills \
  --zone us-central1-a \
  --cost-ceiling 5
```

`--lock` is the verse lock JSON (`files` rows with sha256). `LOCK_v1e.json` in that folder is valid. The file name is not assumed. The whole-song master is not this flag: it is `--recipe lock_v2` and it reads `SHA256SUMS` plus `MANIFEST_LOCK_v2_inputs.json` from `--lock-dir`. The dry-run prints the plan and does not call `gcloud`, does not read the tree, and does not need an AVT credential. With `GCP_PROJECT` unset the create line shows the literal project placeholder `GCP_PROJECT`.

To run it (this spends money, up to the ceiling):

```bash
AVT_REMOTE_RENDER_CONFIRM=1 python3 scripts/render/remote/remote_render.py \
  --backend gcp \
  --stage-from local \
  --execute \
  --lock /workspace/partnership/second_half/claudia_dx/v1/renders/verse_v9look_v1/LOCK_v2.json \
  --work-root /workspace/partnership/second_half \
  --parity-dir /path/to/linux_stills \
  --zone us-central1-a \
  --output ./final.mp4 \
  --cost-ceiling 5
```

What execute does:

1. Hashes every lock row on the launcher against the lock JSON. A mismatch exits before `gcloud` runs.
2. Creates the `c4-standard-16` and arms the same three-layer teardown. `--max-run-duration` is the shorter of `--max-hours` (default 8) and the cost ceiling at $0.79/h. At the default $5 ceiling that is `22784s`.
3. One ssh, before the copy, runs `sudo mkdir -p` and `sudo chown` of `/workspace` and `/tmp/avt-remote` to the login user, then writes and reads a test file under `/workspace/partnership`. The Debian ssh user cannot create `/workspace`. A failed probe stops the run and writes `prepare_failure.log`; it does not retry a permission error. `/var/avt` stays root mode 700. The copy then sends each lock row to `/workspace/partnership/second_half/<rel>`, the parity stills and the lock file to `/tmp/avt-stage`, and `remote_render.py` / `plan.py` to `/tmp/avt-remote`. A second ssh installs the stills and the lock into `/var/avt` with sudo. The remote path is one shell word, so a name with spaces, `&`, quotes, or parentheses stays that path. A file already on the guest at the lock's byte size is not sent again. `/tmp/avt-env`, `touch /tmp/avt-go`, and `touch /tmp/avt-pulled` stay in `/tmp`, which the login user can write. The guest is released only after `touch /tmp/avt-go`. If a copy fails, the failing argv and the last output lines are written to `prepare_failure.log` beside `--output` before the instance is deleted.
4. The guest hashes the same rows again, then runs the 0-pixel parity gate on `full_sf3290.png`–`full_sf3301.png`, the state pass, the chunks, and the concat. Any differing pixel aborts the full run.
5. The guest writes `timing.json` as root under `/var/avt` (mode 700) and the final file as root under `/workspace`. The launcher sudo-copies both to `/tmp/avt-pull`, scp's that copy, and writes `final.timing.json` beside `--output`. The guest waits up to 30 minutes for `touch /tmp/avt-pulled`, then shuts down. The launcher deletes the instance in `finally`.

Wall time is recorded for create, transfer, setup, parity, state pass, chunks, concat, pull-back, and teardown. The timing file and the stdout block are that record plus the elapsed on-demand cost.

`--cost-ceiling` defaults to `5` dollars at the proposal rate, including when `--spot` is set (Spot is not priced, so the ceiling stays the on-demand number). The dry-run prints one line, `full song vs ceiling:`, with the 2-wide wall and dollars against that cap. 18 GB at 100 Mbit/s is 0.40 h, inside the 0.75 h setup, so the copy does not add a second hour. 100 Mbit/s is 12.5 MB/s, under the 53 MB/s the first execute measured, so the printed hours stay high. Execute refuses to create the VM when the 2-wide upper bound for the span you asked for (`--nf`, default the verse) would exceed the cap. The full song on that band is about **$2.66–$2.96**, under $5. While the VM exists, elapsed cost is checked on the same rate; crossing the ceiling deletes the instance.

The guest still runs `render_verse_v9look_v1e_p.py`. Put that file, the wav, and every other input in the lock. Rows that are not on AVT are expected. They have to be on disk at the lock's relative path under `--work-root`.

## LOCK_v2 whole-song master

`LOCK_v2.md` §6 is a different run from the verse. The frozen scripts in the lock tree are not edited. Content hashes are not baked into this runner: `SHA256SUMS` and `MANIFEST_LOCK_v2_inputs.json` are read at launch, so a later grain-param tweak does not require a code change. Nothing in a dry-run calls `gcloud` or creates a VM, a disk, or a bucket.

`--machine-type` chooses the shape. The project quota is `CPUS_ALL_REGIONS` 32 on demand, so 32 vCPU is the largest that fits. Known shapes, us-central1 on-demand, Linux, no disk, rounded up where the catalog is not already the table rate:

| Machine | vCPU | RAM | $/h | v1e workers | final_render workers |
|---|---:|---:|---:|---:|---:|
| `c4-standard-16` (default) | 16 | 60 GB | 0.79 | 2 | 4 |
| `c4-standard-32` | 32 | 120 GB | 1.59 | 5 | 8 |
| `c4-highmem-32` | 32 | 248 GB | 2.12 | 5 | 8 |

`c4-standard-16` keeps the existing proposal rate. `c4-standard-32` is the catalog $1.58136/h rounded up (2026-11-12). `c4-highmem-32` uses $2.12/h, above both the catalog $2.08542 and a second read of $2.1169. There is no preemptible quota, so `--spot` is refused. v1e workers are `min(RAM/15 GB, vCPU/6 OpenCV threads, 9 chunks)`. On the 32-vCPU machines the CPU cap is 5. `final_render` splits into `floor(vCPU/4)` disjoint ranges of 240-frame chunks, with `.done` markers. The state pass and the 7 lock repros stay one process. The final band's low end is the measured 1.517 s/frame divided by those workers. The high end keeps 70% of that split. Transfer is planned at 30 MB/s, under the measured ~53 MB/s. The boot disk stays 120 GB. The default `--cost-ceiling` is still $5. Pass `--cost-ceiling 15` when you want that headroom; execute still refuses when the selected shape's upper dollars would exceed whatever ceiling you passed. `c4-highmem-32` at $5.10 on the high end is over $5 and under $15.

```bash
python3 scripts/render/remote/remote_render.py \
  --backend gcp \
  --stage-from local \
  --recipe lock_v2 \
  --lock-dir /workspace/partnership/final_lock_v2 \
  --zone us-central1-a \
  --cost-ceiling 5 \
  --dry-run
```

On a machine that does not have the lock tree, that dry-run prints both shapes, for 28.81 GB at 30 MB/s:

```text
machine comparison (wall hours and on-demand dollars, us-central1):
  c4-standard-16: 2.48–3.44 h, $1.96–$2.72 (2 v1e, 4 final, $0.79/h, under $5.00)
  c4-standard-32: 1.64–2.41 h, $2.61–$3.82 (5 v1e, 8 final, $1.59/h, under $5.00)
```

The same two lines at `--cost-ceiling 15` are $1.96–$2.72 and $2.61–$3.82, both under $15. The selected shape then prints its stage band: transfer 0.27 h, install, the hash check, the 7 lock repros and the v1e state pass sequential, the v1e chunks divided by the worker count, final_render at the split above, assemble, and an 8 GB pull-back at the same 30 MB/s. With the manifest on the launcher, the dry-run uses that file's byte total instead of 28.81 GB. Execute refuses before create when the selected shape's upper dollars exceed the ceiling.

To run it (this spends money, up to the ceiling):

```bash
AVT_REMOTE_RENDER_CONFIRM=1 python3 scripts/render/remote/remote_render.py \
  --backend gcp \
  --stage-from local \
  --recipe lock_v2 \
  --lock-dir /workspace/partnership/final_lock_v2 \
  --zone us-central1-a \
  --cost-ceiling 5 \
  --execute \
  --output LOCK_v2_deliverables
```

The faster shape, with the owner's $15 ceiling (the projection itself is $2.61–$3.82):

```bash
AVT_REMOTE_RENDER_CONFIRM=1 python3 scripts/render/remote/remote_render.py \
  --backend gcp \
  --stage-from local \
  --recipe lock_v2 \
  --lock-dir /workspace/partnership/final_lock_v2 \
  --zone us-central1-a \
  --machine-type c4-standard-32 \
  --cost-ceiling 15 \
  --execute \
  --output LOCK_v2_deliverables
```

What execute does:

1. On the launcher, `sha256sum -c SHA256SUMS` in the lock dir, then every manifest row's byte size and sha256. A mismatch exits before `gcloud`.
2. Creates the `--machine-type` (default `c4-standard-16`) with a 120 GB hyperdisk and the same three-layer teardown. `--max-run-duration` stays the shorter of `--max-hours` and the ceiling at that shape's hourly rate.
3. One ssh creates `/workspace`, `/tmp/avt-remote`, and `/tmp/claudia_lockrepro` with `sudo mkdir -p` and `sudo chown -R "$(id -un)":"$(id -gn)"`, then writes and reads a test file under `/workspace/partnership`. That ssh does not wait for the root startup script. A permission failure stops the run before the ~29 GB copy. `/var/avt` is created mode 700 and left owned by root. The copy then sends the lock tree and each manifest path to the same absolute path. Each remote path is one shell word, so a name with spaces, `&`, quotes, or parentheses is not split. A manifest file already on the guest at that row's byte size is not sent again. `/tmp/avt-env` and `touch /tmp/avt-go` stay in `/tmp`. If a copy fails, the argv and the last output lines go to `--output/prepare_failure.log` before the instance is deleted.
4. The guest repeats the hash check. It runs the 7 lock repros one at a time. `repro.json` must say `identical` true. If the VM's x264 cannot reproduce a lock mp4, the raw `frames_rgb24.raw` per-frame md5 must match `reference_md5/lock_<name>_preencode_*.md5`, and only then is `identical` set so `final_render.py` will read the raws.
5. v1e state pass (one process), then the nine RGB chunks at the worker count above (2 on `c4-standard-16`, 5 on either 32-vCPU shape). The guest checks 1911 contiguous md5 lines, frames 3070–3077 and 4975–4980 against `reference_md5/v1e_runner_o8_*.md5`, and the 11 `v1e_work/_stills/full_sf*.png` stills against the chunk md5s.
6. `final_render.py chunks` on the disjoint 240-frame ranges (`floor(vCPU/4)` of them), then `assemble`. Acceptance is per-frame md5 lists: chunk `md5_pre_grain` against the parity result and the P1/P2/P3 frame logs, `md5_final` against the parity grain runs, a seeded 3-frame grain spot check, and ffprobe for 5542 frames, 1920×1080, 24 fps, audio lag 0. Container hashes are not the check.
7. The guest render runs as root. Pull-back sudo-copies `/var/avt/out`, `/var/avt/checks`, `/var/avt/guest.log`, and `/var/avt/timing.json` to `/tmp/avt-pull`, chowns that copy to the login user, then scp's it into `--output` (`PARTNERSHIP_CEASE_DESIST_LOCK_v2_h264_crf14.mp4` and `PARTNERSHIP_CEASE_DESIST_LOCK_v2_prores422hq_pcm24.mov`, plus `checks/`, `guest.log`, and `timing.json`). The timing file is the per-stage wall clock and the on-demand cost.
8. On any failure, pulls `guest.log`, `checks/`, and the serial console text, then deletes the instance.

## What Google Cloud already exists

Audit date 2026-11-22. Searched this repo and the other `fendifrost-dot` repos this session could read: `fendi-control-center`, `fan-growth-pilot`, `boltz-insight-engine`, `continuumcapitalchicago-os`, `pdf-unfurl-magic`, `modest-chic-builder`, `llbgroupinc`, `taxgenerator`, `pixel-perfect-replica`, `artistgrowthhub`, `fendi-fight-plan`, `grok-claude-runner` (tree only; the clone token could not fetch it), plus code search on `laaan-logistics-architects`, `fairway-fixer-18`, `fendi-frost-coming`, `PDF-Relief`, `BuzzGenius`, and `paystub-pal`. There is no repository named `frost-sampler` on the account. GitHub Actions secret *values* were not read. The Actions secrets API returned 403, so the names below are the ones referenced in code, not a live inventory of what is set in GitHub.

**Nothing found is a Compute project, a service account for VMs, Terraform, Cloud Run, Cloud Build, or a GCS bucket this runner can use.** This machine also has no `gcloud` binary and no `GCP_PROJECT` / `GOOGLE_APPLICATION_CREDENTIALS`.

| What | Where | Usable for a CPU render VM? |
|---|---|---|
| Gemini API key name `Frost_Gemini` | Control Center `image-providers-gemini-generate`, `video-providers-veo-generate`, tax/telegram helpers. Calls `generativelanguage.googleapis.com`. | No. An API key for Gemini, not Compute Admin. |
| API key name `Google_Cloud_Key` (and `GOOGLE_API_KEY`) | Control Center Drive read (`ingest-drive-clients`, `process-document`, `drive-sync`, `googleDriveRead.ts`) | No. A Drive/API key. |
| Service-account JSON name `GOOGLE_SERVICE_ACCOUNT_JSON` | Control Center `supabase/functions/_shared/googleDriveUpload.ts` and `googleDriveRead.ts`. Scopes are `drive` and `drive.file` only. | No. Do not point this runner at it. |
| Key name `GOOGLE_CLOUD_KEY` | `fendi-fight-plan` `supabase/functions/google-ai-handler/index.ts`. The code says "vertex" and then calls `generativelanguage.googleapis.com` with an API key. | No. Not Vertex Compute, and not a project id. |
| Billing customer `019D00-2E479F-AFE4FD`, payments profile `5865-0187-4020` | `docs/handoffs/GEMINI_VALIDATION_2026-10-12.md` (from Gmail receipts, 8 Mar 2026 prepaid Gemini credits). The same note says the link from `Frost_Gemini` to that billing account was never proven. | No project id. Not enough to create an instance. |
| Google Ads OAuth names `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID` | `boltz-insight-engine/src/server/google-ads/` | No. Ads, not Compute. |
| YouTube OAuth names `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | `fan-growth-pilot/supabase/functions/youtube-auth` | No. |
| Cloudflare Worker deploy, secret names `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | `fan-growth-pilot/.github/workflows/deploy-worker.yml` | No. A public OG worker, not a render box. |
| `grok-claude-runner` | LaunchAgent + keychain on a Mac. No GCP files in the tree. | No. |
| AVT render contract worker | `docs/RENDER_CONTRACT_AND_BOUNDARY.md` | Designed, not hosted. It is a different, small ffmpeg job (about 2 GB RAM), not this compositor. |
| Fal ffmpeg via Control Center | wardrobe reassembly, scrub proxy | Not a machine we can split chunks across. |

No Modal, RunPod, Fly, Replicate, or Lambda project config turned up as a render host. Replicate is mentioned only as a benchmark note in `docs/research/ALEPH2_VS_GROK_C_BENCHMARK_PROTOCOL.md`.

## Credentials you have to supply

Create or pick a GCP project yourself (the audit did not find one), then:

1. A service account with **Compute Instance Admin** (`roles/compute.instanceAdmin.v1`) on that project. Download its JSON key.
2. Export the names, not by pasting the JSON into chat:

```bash
export GCP_PROJECT="your-project-id"
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/.config/avt/gcp-render-sa.json"
chmod 600 "$HOME/.config/avt/gcp-render-sa.json"
```

3. AVT, only for the default `--stage-from avt`, so the guest can read `project-clips` and write the result back. Use a batch credential (`scripts/_lib/auth.py`) or a short-lived access token. The runner reads `AVT_ACCESS_TOKEN` and `AVT_ANON_KEY`. It does not print them. `--stage-from local` does not read these and does not copy them to the VM.
4. The 12 reference stills from the Linux render, named `full_sf3290.png` through `full_sf3301.png` (the span in `IDENTITY.json`). Pass that directory as `--parity-dir`.

`gcloud` must be installed on the machine that launches the VM. The guest installs its own Python and ffmpeg.

C4 needs Hyperdisk. The create command asks for `debian-13` (the lock recorded ffmpeg `7.1.5-0+deb13u1`) and `hyperdisk-balanced`. If the zone rejects either, create fails and nothing is left running.

## One command (safe)

This is the AVT storage mode (`--stage-from avt`, the default). The command that needs no AVT credential is [Local stage](#local-stage-no-avt-credentials).

```bash
python3 scripts/render/remote/remote_render.py --backend gcp --dry-run
```

That prints workers, a cost ceiling, the `gcloud` create and delete commands, and the input gap. It does not call `gcloud`.

To rent the machine (this spends money):

```bash
AVT_REMOTE_RENDER_CONFIRM=1 python3 scripts/render/remote/remote_render.py \
  --backend gcp --execute \
  --zone us-central1-a \
  --parity-dir /path/to/linux_stills \
  --lock /path/to/LOCK_v1e.json
```

Add `--spot` for a Spot VM. The printed rate stays the on-demand **$0.79/h** (the proposal rate, not a live quote). Spot is not priced here. `--cost-ceiling` (default $5) is a separate dollar stop on that rate.

Optional flags: `--machine-type` (default `c4-standard-16`), `--max-hours` (default 8), `--instance-name`, `--sf0` (default 3070), `--nf` (default 1911, the locked verse). The full-song figure of 5542 frames is only in the cost printout. The locked script's default span is the verse.

## What the guest does

1. Arms `shutdown -h +MAX` and a trap that deletes the env file and shuts the guest down. On a local stage the trap waits up to 30 minutes for the launcher to finish the pull, then shuts down.
2. Installs Python (numpy 2.5.5, scipy 1.18.1, opencv headless) and ffmpeg.
3. `--stage-from avt` (the default): pulls `LOCK_v1e_bundle.tgz` when `--lock` was not passed, and the other lock rows from `project-clips` `…/claudia_dx/lock_v1e/`, then checks every file's sha256 against the lock JSON. `--stage-from local`: the files are already on disk; the guest checks them against the `--lock` you passed and does not contact AVT.
4. Re-renders frames 3290–3301 and compares them to the Linux stills. **Any differing pixel aborts the full run.**
5. Runs a state-only pass, then N chunk processes, and concatenates. The AVT stage uploads to `project-clips/…/claudia_dx/remote_render/<instance-name>/final.mp4`. The local stage leaves `final.mp4` for the launcher to pull.

Workers: `(RAM − 4 GB) / 7.5 GB`. A c4-standard-16 (60 GB) starts 7. The locked script asks OpenCV for 6 threads, so 16 vCPUs keep about 2 of those busy at once. The cost line uses that CPU cap so it does not pretend a 7× speedup.

For 5542 frames at 3.4–3.9 s/frame, 2-wide, plus 0.75 h of setup, the on-demand band is **$2.66–$2.96**. That is the figure the dry-run compares with the ceiling. The older **$6.79–$7.71** number adds a second full decode, run strictly before the chunks. The guest does not do that. It starts chunk 0 beside `--state_only`, and starts each later chunk when its snapshot file appears. The compositor argv is the same, so the pixels are the same. If `--state_only` is as heavy as a full decode it occupies one of the two CPU slots and the wall is one pass, **$4.73–$5.34**, which is over the $5 ceiling by $0.34 at 3.9 s/frame. The locked compositor is not in this repo, and `unused.mp4` is the only sign that the state walk is not a delivered encode, so the gate uses the 2-wide band. The verse itself (1911 frames) is about 1.65–1.79 h on that band. These are ceilings at $0.79/h, not an invoice.

## Teardown

Three layers, all in the dry-run text:

- The orchestrator calls `gcloud compute instances delete` in a `finally` after create has succeeded, including when the guest fails or the wait times out.
- The instance is created with `--max-run-duration` and `--instance-termination-action=DELETE`. The duration is the shorter of `--max-hours` and `--cost-ceiling` at $0.79/h. The default ceiling of $5 arms `22784s`.
- The guest trap runs `shutdown -h now`, and boot also runs `shutdown -h +MAX`. On a local stage the trap first waits up to 30 minutes so the launcher can pull `final.mp4`.
- `--cost-ceiling` (default $5) refuses the create when the projected upper bound would exceed it, and the orchestrator deletes the VM when elapsed on-demand cost would exceed it.

A failed create does not delete, because there is no instance.

## Inputs that are not on AVT

`LOCK_v1e.md` (in the bundle, verified present in storage on 2026-11-22) says two groups never made it off the box:

- Plate memmaps `_plates/S0*_rt.npy` and `*_trench_alpha.npy`, about 6.48 GB. Rebuildable with `plate_prep.py`, and a rebuild may not be bit-identical. Needs a T7 copy.
- The two 4K ProRes deliverables `matte_real/deliver/*song176.000-208.458*prores4444*`, about 11.12 GB. T7 copy recommended.

An AVT-stage GCP `--execute` refuses to create a VM while any lock row is neither on AVT nor already in the work tree with a matching sha256. Copy those files onto the work tree (or upload them under the lock's paths) before spending money. `--stage-from local` does not require an AVT object. It requires each row on the launcher under `--work-root`, with the lock's sha256, and it copies that tree to the guest. The chunk runner itself was marked "box only" in the JSON and is inside `LOCK_v1e_bundle.tgz`, which is on AVT; a local stage copies it only when the lock lists it.

## Mac Studio (Apple Silicon, 32 GB)

No cloud bill. Same sha256 check, same parity gate. 32 GB starts **3** workers (`(32 − 4) / 7.5`).

```bash
bash scripts/render/remote/setup-mac.sh
python3 scripts/render/remote/remote_render.py --backend mac --ram-gb 32 --dry-run
```

`setup-mac.sh` refuses anything that is not macOS arm64. It installs Homebrew `python@3.12` and `ffmpeg`, creates `~/.cache/avt/venv_comp` (numpy 2.5.5, scipy 1.18.1, opencv-python-headless), and creates `/workspace/partnership/second_half` owned by you. The locked script will not look anywhere else.

Put the lock tree on that path (from the T7 copy and from the AVT bundle). Then:

```bash
AVT_REMOTE_RENDER_CONFIRM=1 python3 scripts/render/remote/remote_render.py \
  --backend mac --execute --ram-gb 32 \
  --lock "/workspace/partnership/second_half/claudia_dx/v1/renders/verse_v9look_v1/LOCK_v1e.json" \
  --parity-dir /path/to/linux_stills
```

### How to read the parity result

The gate re-renders song frames 3290 through 3301, the same 12 frames already shown identical between the locked compositor and the chunk runner on the Linux box, and counts pixels that differ from `full_sf3290.png` … `full_sf3301.png`.

- **0 pixels differ — ACCEPTABLE.** The checked frames match the lock. That is the only result that means this machine's output can be the picture. It is a spot check, not a promise about frames that were not compared, and it is the same spot the chunk proof used. A failure here is enough to reject the machine.
- **Any pixel differs — NOT ACCEPTABLE as the master.** Homebrew ffmpeg on Apple Silicon is not ffmpeg `7.1.5-0+deb13u1`, and Apple's libm is not the Intel box's. ProRes decode and the compositor's floats can move. Keep the Mac frames as a preview. Do not concatenate them into the deliverable. Render again on the Intel path (the original Linux worker, or GCP `c4-standard-16`) and require 0 there.

A small diff is still a fail. The lock is bit-identical on one machine. A non-zero count means the machine, the decoder, or the inputs — not a creative choice.

## AWS

`--backend aws` prints an `i7i.4xlarge` stub (16 vCPU, 128 GB, Intel, 16 RAM-sized workers). It does not call AWS and does not look up a price. `--execute` on that backend exits without creating anything.

## Tests

```bash
python3 -m pytest scripts/render/remote/tests/test_remote_render.py scripts/render/remote/tests/test_lock_v2.py -q
```

The tests do not call `gcloud`, AWS, or the network. CI runs them in the Python job.
