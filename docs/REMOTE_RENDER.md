# Remote render — Partnership, lock v1e

The final Partnership composite is a deterministic Python compositor, not an edge function. On one 16 GB Linux worker it is about 3.4–3.9 seconds a frame (5542 frames, about 6.3 hours), and each worker peaks around 6.6–7.3 GB while it decodes 4K ProRes.

The chunk runner is `render_verse_v9look_v1e_p.py` (sha256 `70cf2a794f78195fb976fd7178d4c2470699600d3ba55f7551d98a6b4d573348`). A state-only pass saves the running state at each chunk start. A chunk that loads that state is bit-identical to a single pass on the same machine (proof: `ptest_v1e/IDENTITY.json` in the lock bundle). The script hardcodes its work tree as `/workspace/partnership/second_half`. Do not edit it to move that path: the sha256 would change.

This runner plans that job. A dry-run is the default. It does not create a VM, a disk, or a bucket.

```bash
python3 scripts/render/remote/remote_render.py --backend gcp --dry-run
```

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

3. AVT, so the guest can read `project-clips` and write the result back. Use a batch credential (`scripts/_lib/auth.py`) or a short-lived access token. The runner reads `AVT_ACCESS_TOKEN` and `AVT_ANON_KEY`. It does not print them.
4. The 12 reference stills from the Linux render, named `full_sf3290.png` through `full_sf3301.png` (the span in `IDENTITY.json`). Pass that directory as `--parity-dir`.

`gcloud` must be installed on the machine that launches the VM. The guest installs its own Python and ffmpeg.

C4 needs Hyperdisk. The create command asks for `debian-13` (the lock recorded ffmpeg `7.1.5-0+deb13u1`) and `hyperdisk-balanced`. If the zone rejects either, create fails and nothing is left running.

## One command (safe)

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

Add `--spot` for a Spot VM. The printed dollars stay the on-demand ceiling of **$0.79/h** (the proposal rate, not a live quote). Spot is not priced here.

Optional flags: `--machine-type` (default `c4-standard-16`), `--max-hours` (default 8), `--instance-name`, `--sf0` (default 3070), `--nf` (default 1911, the locked verse). The full-song figure of 5542 frames is only in the cost printout. The locked script's default span is the verse.

## What the guest does

1. Arms `shutdown -h +MAX` and a trap that deletes the env file and shuts the guest down.
2. Installs Python (numpy 2.5.5, scipy 1.18.1, opencv headless) and ffmpeg.
3. Pulls `LOCK_v1e_bundle.tgz` and the other lock rows from `project-clips` `…/claudia_dx/lock_v1e/`, then checks every file's sha256 against `LOCK_v1e.json`.
4. Re-renders frames 3290–3301 and compares them to the Linux stills. **Any differing pixel aborts the full run.**
5. Runs a state-only pass, then N chunk processes, concatenates, uploads to `project-clips/…/claudia_dx/remote_render/<instance-name>/final.mp4`.

Workers: `(RAM − 4 GB) / 7.5 GB`. A c4-standard-16 (60 GB) starts 7. The locked script asks OpenCV for 6 threads, so 16 vCPUs keep about 2 of those busy at once. The cost line uses that CPU cap so it does not pretend a 7× speedup.

For 5542 frames at 3.4–3.9 s/frame, 2-wide, plus 0.75 h of setup, the on-demand ceiling printed by the dry-run is **$2.66–$2.96** if snapshots already exist, and **$6.79–$7.71** if the state-only pass is a second full decode. The verse itself (1911 frames) is about 1.65–1.79 h without that second pass. These are ceilings at $0.79/h, not an invoice.

## Teardown

Three layers, all in the dry-run text:

- The orchestrator calls `gcloud compute instances delete` in a `finally` after create has succeeded, including when the guest fails or the wait times out.
- The instance is created with `--max-run-duration` and `--instance-termination-action=DELETE`.
- The guest trap runs `shutdown -h now`, and boot also runs `shutdown -h +MAX`.

A failed create does not delete, because there is no instance.

## Inputs that are not on AVT

`LOCK_v1e.md` (in the bundle, verified present in storage on 2026-11-22) says two groups never made it off the box:

- Plate memmaps `_plates/S0*_rt.npy` and `*_trench_alpha.npy`, about 6.48 GB. Rebuildable with `plate_prep.py`, and a rebuild may not be bit-identical. Needs a T7 copy.
- The two 4K ProRes deliverables `matte_real/deliver/*song176.000-208.458*prores4444*`, about 11.12 GB. T7 copy recommended.

A GCP `--execute` refuses to create a VM while any lock row is neither on AVT nor already in the work tree with a matching sha256. Copy those files onto the work tree (or upload them under the lock's paths) before spending money. The chunk runner itself was marked "box only" in the JSON and is inside `LOCK_v1e_bundle.tgz`, which is on AVT.

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
python3 -m pytest scripts/render/remote/tests/test_remote_render.py -q
```

The tests do not call `gcloud`, AWS, or the network. CI runs them in the Python job.
