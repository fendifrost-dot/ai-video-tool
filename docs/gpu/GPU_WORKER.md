# Local GPU worker (ComfyUI on the M1)

Class C. This change is not merged and not deployed. SQL is applied in the Lovable SQL editor on `qoyxgnkvjukovkrvdaiq`. Publish is not an edge redeploy.

PRs #482 and #483 are already on `main`. This branch is based on that `main`. The GPU lane uses the same `edit_renders` queue, `edit_render_workers` secret, and `effect_presets` row. It does not add a second job table.

## Migration

`supabase/migrations/20261113160000_gpu_worker.sql`

Apply it after `20261113140000_worker_capability.sql`. It adds `job_kind` `gpu`, worker `lane` (`edit` or `gpu`), ComfyUI columns on `effect_presets`, `claim_gpu_job`, and it makes `claim_edit_render` skip GPU rows. `cost_usd` stays 0.

Redeploy, after the SQL is applied:

- `avt-mcp` (server 1.8.0)
- `gpu-worker-api`
- `edit-render-worker-api` (a GPU secret is refused there; the select reads `lane`)

## What the Mac runs

Target: Apple M1, 8 GB unified memory. macOS keeps a share of that, so a job is planned against **5 GiB usable**. ComfyUI is pinned to **v0.45.3**, launched with `--lowvram --fp32-vae --reserve-vram 2`, listening on `127.0.0.1` only.

Evidence labels: model and node names below were **OBSERVED** in the wave-2 packs on 13 Nov 2026. Whether a small tier fits in 5 GiB is a **RECOMMENDATION** from those names plus public checkpoint sizes. Nothing here was run on the M1.

| Tier | On this M1 | Why |
|---|---|---|
| RVM MobileNet, SAM 2 small/tiny, BiRefNet at 1024 (one frame), Depth Anything V2 small, RAFT-small at ≤720p, low-res inpaint at 512 with the face mask excluded | Likely or tight | Weights are small. Inpaint is tight and refused unless `mask_excludes_face_and_mouth` is true. |
| PlateTrack planar track (`PlateTrackPlanar`) | Hardware yes, queue no | CPU OpenCV. License is reference-only (MIT only inside `pyproject.toml`). |
| SAM 2 base-plus, Depth Anything V2 ViT-L | No | The paint-out and mattes graphs name `sam2_hiera_base_plus` and `depth_anything_v2_vitl_fp32`. Both need more than 5 GiB once a video state is loaded. |
| SAM 3, SeedVR2, Flux, Qwen Image, LTX 2.3/2.5 22B, Wan 2.1/2.2 14B, Wan Animate | No. Bigger machine or Cloud. | 14B and 22B weights do not fit. MPS is not their path. |

## Wave-2 packs (classified, not vendored)

Read from bucket `project-references`, project `87fc3244-de44-45a3-b2ba-7fe54222dc90`, prefix `3ca10935-8c3d-4479-9a0c-8bfe8050840c/87fc3244-de44-45a3-b2ba-7fe54222dc90/vfx-reference-packs/`. The zip bytes stay in Storage. They are not in this repo. Licenses are mixed. Several have no LICENSE file.

| Asset | Pack | Verdict on this M1 |
|---|---|---|
| `ef7c7891-f1ef-4b6c-9021-8d8095c2f8c0` | Comfy Compositing (157079995 bytes) | The graphs that were opened (Time-To-Move, background replacement, paint-out, sky, character swap, skin detailer, SeedVR2, LTX HDR, Qwen, Ethereal, alpha) name Wan 14B, LTX 22B, Flux, Qwen, or SAM 3. **Needs a bigger machine.** Character swap and Skin Detailer are also **refused for his face and mouth**. |
| `9fa07ba7-0455-4d12-8365-4bc3382f58a5` | Doug Hogan VFX workflows | Clean plate, sky, deaging, and frame adjustments name LTX 22B or Wan Animate. **Needs a bigger machine.** Deaging is **refused for his face and mouth**. Sky and the Seedance demo include Gemini or Seedance partner nodes, which this worker will not call. Mattes uses SAM 3 plus Depth Anything V2 large, so that graph does not run here. A mask-only graph on SAM 2 small is the substitute. |
| `811bfcd4-87de-48a5-b57e-7d343f5b0ed9` | PlateTrack | `face_replace.json` contains `PlateTrackFace` and is **refused**. `test_track_stab.json` is planar track, which the M1 can run, and it stays **reference-only** because the license is unclear. |
| `1a1fe9c8-795c-4e89-b116-8ccf24d66ee8` | `wave2-catalog.json` | The index. `face_mouth_rule` matches the worker gate. |

Hyenas performer protection: `generative_face` and `generative_mouth` must be false. `touches` is `none` or `read`. Character-swap, Skin Detailer, Deaging, and PlateTrack face replace cannot be registered. An inpaint or paint-out graph must set `mask_excludes_face_and_mouth` true.

Comfy Cloud is a disabled adapter. `COMFY_CLOUD_ENABLED=1` is ignored. There is no HTTP client and the cost is $0.

## Install on the Mac

The checkout of this repo can stay on the internal disk. ComfyUI, the venv, models, cache, and scratch go only to `/Volumes/T7/AVT_GPU_Worker`. The installer refuses any other root and any iCloud path. It does not delete or rewrite anything else on the T7.

1. Mount the T7 at `/Volumes/T7`.
2. Install Python 3.12 (python.org) and Node 22 or newer.
3. From the repo: `bash workers/gpu/install-mac.sh`
4. The script writes `~/.secrets/avt_gpu_worker.env` mode 600 and does not print the secret.
5. With an AVT machine credential (Settings → Machine credentials), register the worker. The secret in that file is the worker secret, not the machine credential:

```text
avt_worker_register
  label: m1
  secret: <the value of AVT_WORKER_SECRET>
  os_name: macOS
  tool_versions: { "comfyui": "0.45.3", "python": "3.12" }
  capability_manifest: {
    "lane": "gpu",
    "device": "mps",
    "memory_bytes": 8589934592,
    "usable_bytes": 5368709120,
    "mps": true,
    "cuda": false,
    "comfyui": true,
    "comfy_cloud": false,
    "models": [],
    "nodes": []
  }
```

`avt_gpu_worker_list` then shows that row. After ComfyUI is up, the worker heartbeat fills `models` and `nodes` from what is actually on the T7.

6. `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/app.avt.gpu-worker.plist`

Model weights are not downloaded. Put only the small checkpoints under `/Volumes/T7/AVT_GPU_Worker/models` (SAM 2 small, BiRefNet, RVM, Depth Anything V2 small, RAFT-small). Leave Wan, LTX, Flux, Qwen, SeedVR2, and SAM 3 off this disk.

Register a runnable graph with `avt_gpu_workflow_register` (API-format JSON, license, performer flags). Queue with `avt_gpu_job_submit`. `dry_run` defaults to true. A live submit needs `dry_run: false` and `assigned_worker`. Cost is $0.

## Large finalize

`avt_upload_asset` mode `finalize` used to download the object and then refuse past 200 MB. The 157 MB Comfy Compositing zip failed first, with `WORKER_RESOURCE_LIMIT`. Finalize now refuses to download anything over 32 MB. Put `sha256` in the upload's `x-metadata` and pass the same `expected_sha256`. The hash is taken from metadata and the body stays in Storage. GPU outputs use `gpu-worker-api` complete, which checks one byte and records the worker sha256. It does not download the file.
