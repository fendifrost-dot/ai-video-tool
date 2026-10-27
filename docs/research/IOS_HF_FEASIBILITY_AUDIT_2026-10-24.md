# iOS and Hugging Face feasibility audit

**Status:** DRAFT for Fendi's review. This document authorizes nothing. No app code, edge function, SQL, publish, or redeploy was changed. No paid GPU job was run.

**Class:** A (documentation only), per `docs/ARCHITECTURE_REVIEW.md`. Any later wiring of a model, a new client auth path, storage, or the locked wardrobe pipeline is Class C and needs architecture, product, and security sign-off before merge.

**Evidence date:** 24 October 2026.

| Repo | Commit audited | When |
|---|---|---|
| AVT `fendifrost-dot/ai-video-tool` `main` | `f0ff0bffbd28f6db062bbdc38fdf6642b1603300` | 2026-10-23 22:12 -0500 |
| Frost Sampler `fendifrost-dot/pixel-perfect-replica` `main` | `29f21e04148b7bf12e6fda1d1288826905595462` | 2026-10-23 16:14 -0500 |

Sampler was cloned read-only into the audit VM (`git clone --depth 1`). Access succeeded. The clone contains a local `.env`; that file was not opened and nothing from it is in this report.

**Labels used below:** **VERIFIED** (cited from a file, Hub card, or provider page read in this audit) / **OBSERVED** (seen, not proven) / **HYPOTHESIS** (needs a named test) / **DECISION** (intentional, with a reason) / **RECOMMENDATION** (proposed). A model benefit on Fendi's footage is **UNTESTED** until a representative clip is run and reviewed. None of the four models below was run.

Canonical product locks that this audit does not reopen:

- Clothing swaps on a real performance take keep his real face, mouth, and hands. The method is Genjutsu as an intermediate, then `scripts/edit/body_only_swap.py` puts only the garment back. Whole-frame Dress output is not the final picture. Source: `docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`.
- Full-length production video swap stays keyframe plus propagation. Independent per-frame try-on is diagnostic only. Source: `docs/VIDEO_SWAP_ARCHITECTURE.md` and the lock in `CLAUDE.md`.
- A benchmark is derived from a versioned selection, not from this note. Source: `docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md`.

---

## 1. Current architecture audit

### 1.1 AVT

**VERIFIED.** AVT is a Lovable-managed film-production app. Control plane: Lovable project `bd21b544-c7b8-4780-bdde-391ac9d4bfa8`, live `aivideotool.lovable.app`, database project ref `qoyxgnkvjukovkrvdaiq`. Frontend publish and edge-function redeploy are different steps. Source: `.deployment/manifest.yml`.

**Stack.** TanStack Start + React 19 + Tailwind 4, Vite 7, Cloudflare Workers (`src/server.ts`). Backend is Postgres, Storage, and Deno edge functions under Lovable. Package manager is npm. There is no iOS target, no Capacitor/React Native project, and no Swift package in this repo.

**Auth.** The browser signs in with Google or a magic link through `@lovable.dev/cloud-auth-js` (`src/integrations/lovable/index.ts`, `src/routes/auth.tsx`). Server functions attach the Supabase session (`src/start.ts` → `attachSupabaseAuth`). Row-level security is the data boundary. The MCP server `avt-mcp` does not take a user JWT: a machine credential minted in Settings is exchanged by `batch-token-proxy` for an ordinary user session, and every later read or write runs as that user. Fal is not held on AVT. Fal calls go through Control Center (`COMPOSE_LOOK_CC_URL` + `SWITCHX_PROXY_SECRET`), repo `fendifrost-dot/fendi-control-center`, project ref `wkzwcfmvnwolgrdpnygc`.

**Routes that matter for a phone client.** File routes under `src/routes/` cover projects (setup, shots, storyboard, swap, timeline, treatment, hero frame, video, review, runs, scorecards, export, continuity, assets, editor), artists and looks, products, collections, design studio, library, and settings. The production objects a phone would have to stay in sync with already exist as tables in `src/integrations/supabase/types.ts`:

| Concern | Tables already in the schema |
|---|---|
| Project and variations | `video_projects`, `video_variations`, `variation_scenes` |
| Shots and board | `shots`, `shot_overrides`, `shot_asset_assignments`, `storyboards`, `storyboard_nodes` |
| Generated and imported media | `project_assets`, `artist_assets` |
| Continuity and wardrobe | `continuity_entities`, `character_features`, `artist_looks` |
| Song placement | `performance_syncs`, `lyric_lines`, `song_analyses` |
| Jobs and approval | `provider_jobs`, `clip_reviews`, `edit_sequences`, `edit_renders`, `export_packages` |

**DECISION already in the product:** approval state lives on assets and reviews. A phone app that invents a second approval store would fork the board.

**Engines, and where they actually run.**

| Job | Where it runs | What this audit confirmed |
|---|---|---|
| Dress a clip | Edge `dress-clip` → Control Center Higgsfield Genjutsu object-swap | Whole-frame result is filed unselected, conformed to the clip. List price in source: **$0.681 per started second at 720p**. A 4.04 s clip bills 5 s → **$3.405**. `dryRun` spends nothing. |
| Put the garment back over the real face | Offline `scripts/edit/body_only_swap.py` | MediaPipe `selfie_multiclass_256x256.tflite` (labels: background, hair, body skin, face skin, clothes, accessories) and `face_landmarker.task`. Protected pixels must print a difference of 0. **Not in the Dress button.** |
| Replace generated-him with the real take | Offline `scripts/edit/replace_him_in_clip.py` | Face landmarker, with a manual `clip_face` box when the landmarker misses a profile or a cap. Hole fill is `cv2.inpaint` (Telea), row-wise fill, or a median plate. Optional `--grain` and `--soften` (both default 0) exist because the take reads cleaner than the generated clip. |
| Lip sync to the song | Edge `lipsync-shot` | Model constant `fal-ai/sync-lipsync/v2`. List price **$3 per minute** (`LIPSYNC_USD_PER_SECOND = 3/60`). Vocals come from a Demucs Fal job once per song, ceiling **$0.30** in source, stored as a project asset. |
| Still mask | Edge `sam3-segment-proxy` | Masking only. Calls Control Center `switchx-restyle` → `fal-ai/sam-3/image`. Prompt examples in the function: "clothing", "jacket", "face". Returns a stored mask image. This is the still lane, not the offline video compositor. |
| Hero outfit appearance | `grok-image-garment-proxy` and related Grok image functions | xAI image edit. Separate from the video-edit research adapter. |
| Propagation / reassembly | `wardrobe-video-*-proxy`, `temporal-propagate-proxy` | Kept as infrastructure. The locked doc says this per-frame lane is diagnostic, not the full-length production path. |
| Automated reconstruction QA | `src/lib/eval/videoQaEvaluator.ts` | `evaluateVideoQa`, contract `lane-e2-video-qa-v1`. Scores rasters supplied by the reconstruction lane. It does not decode an MP4 itself and it does not score Dress, body-only, or replace-him shots. |

**Provider registry in the app** (`src/lib/providers/registry.ts`): Runway, Veo, Grok, Higgsfield, Pika, Fal, Manual. Gemini, OpenAI, Firefly, and Frame.io names fall through to Manual. Hugging Face is not a provider.

**Wallet evidence from merged PRs, not a live balance.** PR #367 records a c033 reshoot crop swap at $3.405. PRs #363, #364, and #366 record Higgsfield refusing calls because the API balance was too low ($0 spent on those attempts). That is history as of 23 October 2026. This audit did not read the wallet.

### 1.2 Frost Sampler

**VERIFIED.** The repo is reachable and is the Lovable app described as Frost Sampler. Live URL in `MCP_SETUP.md`: `https://frost-sampler.lovable.app`. `supabase/config.toml` records `project_id = "udcsmssprxmoooazlufn"`. That id is not AVT's. The app is a TanStack Start + React 19 PWA (`public/manifest.webmanifest`, `display: standalone`, name "Frost Sampler"). It is an iPhone Home Screen web app. It is not a native Swift/UIKit/SwiftUI target.

**What the current app already does** (`FRONTEND_HANDOFF.md`, `src/lib/frost/`):

- Import a song or recording (anything the browser can decode). Original bytes stay in IndexedDB.
- Waveform from real samples, pinch zoom, chop markers, transient / equal / beat auto-slice.
- Source BPM suggestion separate from project BPM. Beat markers can be dragged.
- 4 banks × 16 pads. Fit by WSOLA time-stretch or classic repitch. Quantize and swing are non-destructive.
- Live playback and offline export share `timing.ts` and `voice.ts`. Export is 24-bit stereo mix plus aligned per-pad WAVs.
- Built-in drums are synthesized (`kits.ts`), so kit projects stay small.
- AI chop suggestions are opt-in, sent to a same-origin server route, validated, and applied as one undoable edit (`src/lib/ai`, `src/routes/api.ai-slices.ts`).

**Audio engine.** `src/lib/frost/engine.ts` is Web Audio (`AudioContext`, `latencyHint: "interactive"`). It sets `navigator.audioSession.type = "playback"` so iOS Safari 16.4+ can ignore the ring/silent switch, and it replaces a stuck context on the next tap. The UI is required to talk to audio only through `src/lib/frost/services.ts`, so an engine can be swapped without rewriting chop math.

**Cloud and MCP.** Device storage is the working copy. After the owner types a key, `src/lib/frost/sync.ts` syncs with `POST /api/cloud`. The server checks `FROST_MCP_KEY` before any cloud read or write (`src/lib/cloud/key.server.ts`). The cloud row is one `projects` table (JSON project, schema version, audio path list) plus a private audio bucket reached by short-lived signed URLs. Conflicts merge item by item (`merge.ts`); the phone wins only where both sides touched the same thing. MCP at `/mcp` (`src/lib/mcp/tools.ts`) can list and edit projects, chops, pads, patterns, song order, and export settings. MCP cannot play, render, or run the device check. Those stay on the phone's audio engine.

**Auth shape.** There is no per-user account in the product path. One owner key guards both the phone and the assistants. The Lovable template still has Supabase auth helper files; the product docs do not use them for sign-in.

**Two docs in the same commit disagree, and both were read.**

| Document | What it says |
|---|---|
| `README.md` | "No backend or account required." |
| `AGENTS.md`, `MCP_SETUP.md`, `roadmap.md` | Private cloud sync and a key-gated MCP are implemented. The roadmap's remaining owner step is to put `FROST_MCP_KEY` in Lovable secrets and paste it into the app. |
| `DEVICE_PROOF.md` | The workflow was verified in headless Chromium on Linux. The same file says it has **not** run on iOS Safari, and feature work should wait for that proof. |

**OBSERVED.** The requester describes a working iPhone app with Cloud sync. The code for Home Screen install, cloud sync, and MCP is on `main`. The repo's own device-proof checklist still says the iPhone pass has not been recorded. This audit did not install the PWA on a phone, so it does not certify on-device latency, export memory, or silent-switch behavior.

**Known limits written by the app, not measured here:** WSOLA gets grainy at large ratios; long exports render one `OfflineAudioContext` per track and may hit iOS tab memory; there is no service worker, so the Home Screen icon needs a network load even though audio stays on device; gate length is not edited as a note length.

### 1.3 What the 23 October Hugging Face note got right

The attached note (`hf_deep_dive_2026-10-23`) is a short pointer, not a full model card. Checked against this repo and the Hub:

| Note claim | Audit result |
|---|---|
| MediaPipe selfie multiclass + face landmarker are the offline masks | **VERIFIED** in `body_only_swap.py`, `recolor_cap_jeans.py`, `replace_him_in_clip.py`, `verify_scene.py`. |
| Landmarker misses profile / capped faces | **VERIFIED** as a designed fallback: `clip_face` box "when the landmarker misses it (profile, cap)". PR #365 added a windowed 3× search for a small face in `verify_scene.py`. |
| Multiclass misses shoes | **VERIFIED** that the six labels include clothes and accessories and do not include a shoe class. A measured "shoes dropped on shot X" was not re-scored in this audit. Dress's default piece when none is passed is footwear (`dress-clip` header). |
| OpenCV Telea and row fill | **VERIFIED.** `--fill` is `rows` (default), `median`, or `inpaint`. The inpaint help text says the first version smeared a ghost outline. |
| Hand-tuned grain | **VERIFIED** as optional flags `--grain` and `--soften`, default 0, added in #378. They are not a learned grain model. |
| Higgsfield dress ≈ $3.405, wallet blocked some runs | **VERIFIED** as source list price and as merged PR history (#363, #364, #366, #367). Live balance unknown. |
| Lip-sync redraws the whole face | **Not verified from repo comments.** The wired model is `fal-ai/sync-lipsync/v2`. Whether that edit is mouth-only or full-face on a Fendi take is **UNTESTED** here. The face redraw that the canonical recipe proves is Genjutsu's, and body-only put-back exists to undo it. |
| No automated shot QA; issue #105 | **Partly stale.** Issue #105 is still **OPEN** ("Lane E2 — Video-level automated evaluator"). `evaluateVideoQa` is already merged and tested for reconstruction frame packs. It does not score wardrobe swaps or replace-him. A shot QA for those lanes is still absent. |
| `Wan-AI/Wan2.2-Animate-14B` | **VERIFIED** on the Hub. Apache-2.0. Updated 5 Nov 2025 on the card read here. |
| `facebook/sam3` | **VERIFIED**, gated, license `other`. AVT already calls SAM 3 through Fal for stills. See §1.4. |
| `lixiaowen/diffuEraser` | **VERIFIED** the Hub card says Apache-2.0 (updated 20 Jan 2025). That tag does **not** clear the stack. The GitHub README says ProPainter is the prior model and must be complied with or replaced. ProPainter is S-Lab 1.0, non-commercial unless the authors permit it. See §8. |
| `Qwen/Qwen3.8-27B` | **VERIFIED** the id exists (about 27.8B, Apache-2.0, several Inference Providers listed). It is a multimodal LM. It is not a shot QA system, and this audit does not recommend dropping it in front of issue #105. |

### 1.4 SAM 3 mask work already in the repo

**VERIFIED.** `sam3-segment-proxy` is on `main` and is the still-mask path (Fal `fal-ai/sam-3/image` via Control Center). Architecture C still repair already has a fail-closed SAM 3 occlusion path in the research record. `src/lib/eval` can score caller-supplied SAM-3-shaped mask continuity with `sam3LiveFetch=false`.

**VERIFIED.** On 24 October 2026 this audit listed open PRs and remote heads. There was **no open PR and no remote branch** whose name indicated a new flag-gated SAM 3 replacement for the MediaPipe video masks. Open work nearby is PR #353 (showroom headlight-halo tests, not yet run on the shot).

**DECISION for this audit:** do not open a second SAM 3 integration from this document. The still path already calls Fal SAM 3. Offline video compositing still uses MediaPipe, which has no shoe class and needs a manual box on profile faces. A flagged comparison of those video masks on named frames is the right next experiment (§8). If the other Claude Code effort opens that PR, that PR owns the code. Any "1–2 days" or "cents per clip" figure for SAM 3 is a **HYPOTHESIS**. This audit did not measure either.

---

## 2. Hugging Face model comparison

Prices below are published list rates read on 24 October 2026. They are not invoices. No job was submitted.

Hugging Face Inference Providers did **not** list Wan-Animate, LatentSync, or SAM Audio as a one-call serverless model on the cards read here. `Qwen/Qwen3.8-27B` did. The video and audio models need a Space, a third-party host, or a GPU you operate.

### 2.1 Exact names

| Asked name | Hub result |
|---|---|
| `Wan-AI/Wan2.2-Animate-2-14B` | **Exists.** Card updated 9 Aug 2026. Apache-2.0. This is a newer model (direct driving video into a DiT, plus a distilled checkpoint). It is not a rename of the September 2025 model. |
| `Wan-AI/Wan2.2-Animate-14B` | **Also exists.** Apache-2.0. September 2025 character animation **and replacement**, with a separate pose/preprocess stage (`--use_flux` on the animation preprocess). This is the checkpoint behind today's Fal and Replicate "Wan 2.2 Animate" routes found in this audit. |
| `ByteDance/LatentSync-1.6` | **Exists.** Weights card: `openrail++`. Code repo `bytedance/LatentSync`: Apache-2.0. 1.6 is the same architecture as 1.5, retrained at 512×512 (card and GitHub, June 2025). |
| `facebook/sam-audio-large` | **Exists. Gated.** License on the card: `other`. Upstream GitHub license file is the **SAM License**, last updated 19 November 2025. |
| `audio-cpp/SAM-Audio-GGUF` | **Exists.** Community conversion of the gated Meta checkpoints (small, base, and large; F32, BF16, Q8_0). License field: SAM License. Base model: `facebook/sam-audio-large`. |

### 2.2 Comparison

| | Wan-Animate-2 14B | Wan2.2-Animate-14B | LatentSync 1.6 | SAM Audio large | SAM Audio GGUF |
|---|---|---|---|---|---|
| Repo | `Wan-AI/Wan2.2-Animate-2-14B` | `Wan-AI/Wan2.2-Animate-14B` | `ByteDance/LatentSync-1.6` | `facebook/sam-audio-large` | `audio-cpp/SAM-Audio-GGUF` |
| License | Apache-2.0. Card text says generated content is yours and use must follow the license. No US exclusion found on the card. | Apache-2.0. Same public wording. | Weights OpenRAIL++ (commercial use with use restrictions). Code Apache-2.0. Official `requirements.txt` pins `insightface==0.7.3`. InsightFace **code** is MIT; InsightFace **pretrained packs are non-commercial research** unless separately licensed (InsightFace README, read this audit). | SAM License. Royalty-free right to use, modify, and distribute, under trade controls, privacy law, and a ban on military, nuclear, espionage, and illegal-weapons uses. Redistribution must keep the SAM License. Gated download. | Same SAM License, plus Apache-2.0 for the bundled Google T5 encoder. Conversion of gated weights raises a review question under the license's reverse-engineering clause. A lawyer should read that before any commercial dependency on this repo. |
| Hardware (from the publisher) | Quick start is tuned for **8× A800 at 720p**, and they also tested **480p on 2× A800**. Distilled path: 10 steps, guidance 1.0. Not an iPhone model. | Single-GPU path exists (`offload_model`, `convert_model_dtype`) and an 8-GPU FSDP path. This audit did not measure VRAM. Third-party VRAM calculators were not treated as evidence. | GitHub: **18 GB** minimum for 1.6 inference, **8 GB** for 1.5. Training pipeline resamples video to 25 fps; inference frame-rate behavior was not measured. | Official README: Python ≥ 3.11, CUDA recommended. GGUF author's RTX 5090 measurement of **large F32**: about **17.8 GiB** peak, warm RTF ~0.10 on a 15 s clip (text prompt, one candidate). Ranking and span prediction cost more and were not in that timing. | Same weights. Metal is listed next to CUDA and Vulkan in audio.cpp. That is desktop Metal. No Core ML / Neural Engine conversion is published on the card. Large Q8_0 on that 5090 test: about **9.4 GiB**. Still not an iPhone model. |
| How you would call it | Self-host (`Wan-Animate-2` repo or Diffusers `WanAnimate2Pipeline`) or a community Space. **No Fal or Replicate route for Animate-2 was found.** A public Gradio Space is not a production API. | Fal today: `fal-ai/wan/v2.2-14b/animate/move` and `.../replace`. Replicate has a Wan 2.2 Animate animation model. Those are this older checkpoint. AVT would call Fal only through Control Center, the same way Dress and lip sync already do. | Self-host, or Fal `fal-ai/latentsync` (page read this audit). **The Fal page does not say 1.5 vs 1.6.** Treat the hosted checkpoint as unknown until the provider states it. Spaces exist. | Accept the gate, then self-host `facebookresearch/sam-audio`. Community Spaces exist and have no SLA. Not an Inference Providers one-liner. | `audiocpp_cli` on a Mac or a CUDA/Vulkan box. Do not embed the GGUF in an App Store binary. |
| Published cost | GPU rental only. No per-second API price found for this checkpoint. | Fal bills **frames ÷ 16** as a "video second": **$0.08 / $0.06 / $0.04** at 720p / 580p / 480p. A 5 s 60 fps 720p example on Fal's own page is **$1.50**. Arithmetic on a 4.04 s, 59.94 fps, 720p AVT clip is about **242 frames → 15.1 billed seconds → about $1.21**, versus Dress at **$3.405**. That comparison is list-price arithmetic, not a quality result. | Fal page: **$0.20** up to 40 seconds, then **$0.005** per second. A 4 s lip-sync at the current Sync price is about **$0.20**. Similar money, unknown pixels. Self-host is GPU time. | GPU time after access is granted. No Fal price found. | Same. Author's small Q8_0 figure (~6.8 GiB, RTF ~0.045 on 15 s) is the practical size if a later test is allowed. |
| What a test could prove | Whether a reference still plus a driving take keeps identity, garment construction, and scene integration **without** a pose extractor. Authors claim that. **UNTESTED** on Fendi. | Whether animation mode copies motion onto a still, or replacement mode swaps a person into a plate. Both **generate a new picture**. Replacement is the closer cousin of Genjutsu, and it still redraws the person. **UNTESTED.** | Whether a song vocal moves the mouth while the rest of the take stays put, at 512 px on the face, on a 59.94 fps performance with profile frames and a cap. **UNTESTED.** | Whether a text prompt isolates a vocal, a drum, or an instrument well enough to chop. Meta's own table rates large at 4.49 / 5 on pro instruments and 3.60 / 5 on speakers (their listeners, not our songs). | Whether Q8_0 matches F32 on a real song. The GGUF card's cosine vs F32 on one office recording was about 0.9996. That is one clip, not a music test. |
| Fit to AVT locks | A generated character video can only enter as an **intermediate**, the role Genjutsu has today, and only if body-only put-back still prints 0 on the protected face. It does not replace put-back. Motion preservation is the thing to test. Wardrobe accuracy is **UNTESTED** and is the kill criterion already written for any new swap engine. | Same. Fal's replace blurb says it keeps scene lighting and color. That is the provider's claim. It is not a pixel-preservation proof. | Belongs on the **lip-sync lane** (`lipsync-shot`), where the mouth is supposed to follow the song. It does not belong on the clothing-swap lane, where the mouth must stay the take. InsightFace's non-commercial packs block a commercial self-host until the detector is replaced or licensed. | Optional vocal or instrument split. AVT already stores a Demucs vocal stem. Replacing that working path needs a blind comparison. | Same model, more portable runtime. Still a server or a Mac, not the phone. |
| Fit to Sampler | No. Sampler does not generate video. | No. | No. | **This is the one product gap among the four.** Sampler has no instrument isolation. A consented server job could return a stem for chopping. Playback, BPM, and pads stay local. | Same, if the license review passes. Latency of a 15 s separation on a 5090 is already under 2 s in the author's text-only test, which is fine as an offline import step and irrelevant to pad latency. |

### 2.3 What this audit will not claim

- Wan does not "solve" identity, wardrobe, or flicker. Both Wan models synthesize frames. The kill criterion in `CLAUDE.md` still applies: on a 2–4 s test, identity, jacket construction, stripe/logo placement, occlusion, and flicker either hold or the experiment stops.
- LatentSync does not "solve" the face-preserving swap. It is a mouth generator. The paper and the 1.6 card aim at a masked mouth at higher resolution than 1.5. Softness at 512 px and full-face bleed are the things a test would look for. The prior note's statement that today's Sync pass redraws the whole face is **UNTESTED** in this audit; a test should score both models against the original face, not against each other alone.
- SAM Audio does not fix masks, grain, or lip sync.
- `facebook/sam3` and `facebook/sam3.1` stay out of a new design. SAM 3 stills already have a Fal path. SAM 3.1 is also gated, license `other`, and was not needed to answer this brief.

---

## 3. Native iOS implementation plan

**RECOMMENDATION.** Two separate SwiftUI apps, if they are built at all. They do not share a database, a key, or a navigation stack. AVT's phone app is a client of the existing production system. Sampler's phone app is the instrument, and the existing Lovable cloud stays the sync store.

### 3.1 AVT iOS

**Role.** Review, approve, and capture. The phone shows the same project, variation, shot, asset, continuity row, and provider job the web app shows. Render jobs keep running in Lovable edge functions and Control Center. The phone polls `provider_jobs` and opens signed URLs. It does not run Genjutsu, Grok, Wan, SAM, FFmpeg, or `body_only_swap.py`.

**Suggested surfaces, in dependency order:**

1. Sign-in that ends in the same Supabase user the web app uses, so RLS keeps working.
2. Project list → active variation → shot list, with the asset already marked selected and its approval state.
3. Playback of the shot's clip and of an unselected Dress / lip-sync / replace candidate, side by side.
4. Approve / reject writing the existing review and asset fields. No new status enum.
5. Optional camera or Files ingest through the existing `upload-asset` function, filed as a project asset the web board already understands.
6. Job progress for a Dress or lip-sync the user started on the web. Starting a paid job from the phone is a later decision; `dryRun` already exists on those functions and should stay the default in any prototype.

**Sync rule.** The phone is not a second source of truth. Writes go to the existing tables. Offline mode, if it exists, is a cache of signed media plus a queue of review decisions, replayed in order. Continuity text, garment links, and timeline versions stay online-first because a silent overwrite there is expensive.

**Auth risk (HYPOTHESIS).** The web helper is `@lovable.dev/cloud-auth-js` with a same-origin callback. A native app would need `ASWebAuthenticationSession` (or an equivalent) against that same Lovable/Supabase auth, then a stored session. This audit did not prove that the managed callback accepts a custom URL scheme. That spike is read-only until it works on a device: sign in, read one project the user owns, fail closed on a project they do not own.

### 3.2 Sampler iOS

**Role.** The instrument. Essential audio runs on device with `AVAudioEngine`. Import, waveform, chops, BPM, 16 pads, record, and 24-bit export do not require the network. Cloud sync and MCP stay the Lovable app's `/api/cloud` and `/mcp`. The native app is another client of that key-gated API, using the same project JSON (`SCHEMA_VERSION` in `types.ts`) and the same merge rules.

**Engine mapping:**

| Current module | Native fate |
|---|---|
| `types.ts`, `timing.ts`, `ops.ts`, `merge.ts`, `wav.ts`, `analysis.ts`, `stretch.ts` | Port as pure Swift, with the existing Vitest cases rewritten as XCTest fixtures. These modules do not touch the DOM. |
| `voice.ts`, `engine.ts` | Reimplement on `AVAudioEngine` / `AVAudioPlayerNode` / `AVAudioTime`. The service interface in `services.ts` is the contract. |
| `render.ts` | Offline render into 24-bit WAV via `AVAudioFile`, then the system share sheet (Files, AirDrop) for LUNA / Pro Tools. |
| `persist.ts` | Local store (files on disk, not IndexedDB). Cloud remains optional. |
| `kits.ts` | Keep synthesized drums. Do not ship a sample library. |
| AI chops and SAM Audio | Server calls the user explicitly starts. Results come back as suggested markers. They never write a pad until the user applies them. |

**Session behavior to design in from the start:** silent switch (play even when the hardware switch is on silent), interruption by a phone call, backgrounding, and a tap path that does not wait on SwiftUI state. The web engine already special-cases these because iOS Safari requires a gesture to start audio. `AVAudioEngine` can do better, and it should be measured rather than assumed.

**Export contract to keep:** mix and per-pad stems share one frame count, 24-bit, 44.1 or 48 kHz, aligned at 00:00:00, so a DAW session at the project BPM lines them up. The Chromium device check's numeric expectations (frame counts, ≤ 1.5 sample hit error, stems sum to the mix) are the acceptance numbers to re-implement, not new numbers.

**Beat tracking stays optional.** Pads, chops, BPM fit, and export run offline with the code already in `timing.ts` and `analysis.ts`. `CPJKU/beat_this` (MIT, copyright 2024 Institute of Computational Perception, JKU Linz) is a candidate to benchmark beside the current onset suggestion, including a Core ML conversion. It is not a dependency of the instrument. Detail in §8. SAM Audio, if it is ever tried, is a consented server stem. It is gated, and the SAM License needs a commercial read before shipping. It does not sit on the pad-trigger path.

### 3.3 What neither app should become

- A second render farm, a second database, or a Hugging Face account baked into the client.
- A wrapper that only shows the website in a `WKWebView`. That duplicates nothing useful and still fails Sampler's audio limits.
- A place where wardrobe pixels are regenerated on device.

---

## 4. Reuse versus rewrite

| Piece | Reuse | Rewrite or leave |
|---|---|---|
| AVT schema, RLS, storage buckets, edge functions, MCP, provider jobs | **Reuse unchanged.** The phone is a client. | Do not reimplement Dress, lip sync, SAM 3 stills, or Grok on iOS. |
| AVT web UI (Radix, Tailwind, TanStack Router) | Leave it. It is the full production UI. | A native review UI is a new, smaller surface. Porting all 50 routes is a rewrite with no product gain. |
| Face-preserving compositor and replace-him | Keep the Python until it is inside the existing worker on purpose. | Do not port OpenCV/MediaPipe to Swift as part of "making an iOS app". |
| `evaluateVideoQa` | Reuse for reconstruction. | A shot QA for Dress / body-only is new work under issue #105's spirit, and it is server-side. Do not block iOS on it. |
| Sampler pure timing, WAV, onset, stretch, project ops, merge | **Port.** Tests already describe the behavior. | Do not invent a second chop format. |
| Sampler Web Audio engine and React UI | Keep the PWA running. | Replace the engine with `AVAudioEngine` only after the Home Screen proof says the web engine misses taps, drifts, or dies on export. The handoff itself lists that fork. |
| Sampler cloud, MCP, key check, signed audio URLs | **Reuse.** Native calls the same routes. | Do not add Supabase client writes from the phone. The server is the only writer today, on purpose. |
| AI slice route | Reuse the consent and validation rules. | The native app can call it. It is not the audio engine. |
| Wan, LatentSync, SAM Audio | None of this code exists in either app. | Add a server adapter only after a footage or song test and a license check. iOS does not host these models. |

**RECOMMENDATION.** The reusable core of Sampler is already isolated. The reusable core of AVT is the database and the edge functions. Native work is a client in both cases. Rewriting either backend would duplicate a system that already matches the brief.

---

## 5. Cost and infrastructure

**No new infrastructure is justified by this audit.**

| Layer | Keep | Do not add |
|---|---|---|
| AVT app and jobs | Lovable publish, Lovable edge redeploy, Control Center for Fal, xAI for Grok image | A GPU box, a Hugging Face dedicated endpoint, a second Supabase project, an on-device video model |
| Sampler | The existing Lovable app as the sync/MCP host. IndexedDB (or, later, on-device files) as the working copy | A second cloud, user accounts, a public audio bucket |
| iOS distribution | Apple Developer Program, TestFlight, two bundle ids | A shared binary that embeds both products |
| Secrets | Stay in Lovable. AVT machine credentials stay in Settings. Sampler keeps one `FROST_MCP_KEY`. | Keys in the app binary, keys in git, keys in this document |

**List-price picture for one ~4 s, 720p performance clip** (arithmetic on published rates, quality ignored):

| Step | Published rate | About |
|---|---|---|
| Dress, Genjutsu, 720p | $0.681 per started second; 4.04 s bills as 5 s | **$3.405** (in source, and in PR #367) |
| Body-only put-back | Local pixels | **$0** |
| Lip sync, Sync v2 | $3 per minute | **~$0.20** for 4 s |
| Vocal stem, once per song | Source ceiling | **≤ $0.30** |
| Fal Wan 2.2 Animate (older checkpoint only) | $0.08 per billed second at 720p, frames÷16 | **~$1.21** at 59.94 fps. Cheaper on the sticker. Wrong thing to buy until a test shows the garment and the face survive put-back. |
| Wan-Animate-2 | No public per-second price found. Official path is multi-A800 | A rental, not a savings, unless volume is high enough to keep the GPUs busy. This production does not have that volume on the evidence in the ledger notes. |
| Fal LatentSync | $0.20 up to 40 s | **~$0.20**, same order as Sync. Checkpoint version on Fal unverified. |
| SAM Audio | Self-host GPU | Worth it only as an occasional stem, not as an always-on service. |

**Hugging Face credits, checked 24 October 2026.** The Inference Providers pricing page fetched that day (`https://huggingface.co/docs/inference-providers/en/pricing`) lists **Free users: None**, **PRO: $2.00 per month** for Hugging Face compute services, **Team or Enterprise: $2.00 per seat**. PRO is not unlimited inference. The public pricing page (`https://huggingface.co/pricing`) advertises the same $2 PRO credit and does not advertise a free-user inference credit. A search snippet of an older or alternate copy of the docs said free users receive $0.10 "subject to change"; the page fetched for this audit does not say that. This audit did not open a billing dashboard, so an individual account can still differ from the doc. None of Wan-Animate, LatentSync, or SAM Audio is an Inference Providers route on the cards read here, so those credits would not pay for them anyway.

**DECISION.** Do not rent GPUs and do not switch Dress to Wan to save the difference between $3.405 and ~$1.21. The $2 is smaller than one rejected full-frame redraw. Wan is sequenced after a mask and compositing baseline on the same clips (§8). A single approved short test, paid once, is the only spend this report contemplates, and it is not approved here.

**Class C reminder.** Pointing `dress-clip` or `lipsync-shot` at a new model changes providers, money, and the locked picture pipeline. That is not an iOS task and not a docs follow-up.

---

## 6. Prioritized milestones

Order is technical dependency. No calendar estimate.

1. **Sampler Home Screen proof, on the app that already exists.** Run `DEVICE_PROOF.md` §2 and §3 on a real iPhone. Record the copied device-check report, the model, the iOS version, missed taps, silent-switch, reopen, and export time. This milestone changes no code. It decides whether a native engine is even the next build.
2. **AVT auth spike, read-only.** Prove a native session can become the same Supabase user as the website and can read one owned project. Stop if the Lovable callback cannot return to the app.
3. **AVT review client.** Shot list, play the selected asset, play one unselected candidate, write the existing approval fields. Still no new generation.
4. **Sampler native engine, only if milestone 1 fails for an audio reason.** Port the pure modules. `AVAudioEngine` playback and 24-bit export. Cloud sync against the existing `/api/cloud`. Acceptance is the same numeric device check, on device.
5. **Label the defects, then compare masks.** On 3–5 already-rendered YSL frames, write down which failures are segmentation (shoe, dark rim, profile miss, double edge, mask flicker) and which are generation (garment identity, glasses, mouth timing, light). Keep MediaPipe. A flag-gated SAM 3 pass on those same frames is the comparison, owned by the other effort if that PR opens. Record runtime and cost on that run. Do not treat a guessed "cents per clip" as a budget.
6. **Compositing baseline before any new generator.** Score the current put-back (`--choke`, `--despill`, row fill versus Telea) on those same frames. DiffuEraser is a candidate only after the ProPainter license is replaced or permitted (§8). It is not commercially cleared by the Apache tag on the Hub card.
7. **Wan only after steps 5 and 6, and only against the existing Higgsfield outputs.** Name the checkpoint: `Wan-AI/Wan2.2-Animate-2-14B` is the model ChatGPT linked; Fal's published price is for `Wan2.2-Animate-14B`. Compare both, if either is run, to the Higgsfield intermediate plus body-only put-back. The face proof still has to print 0. LatentSync stays on the lip-sync lane, scored against `fal-ai/sync-lipsync/v2` for pixels outside the mouth.
8. **Sampler beat-tracking benchmark, after the pads already work offline.** On songs already imported in Frost Sampler, compare `CPJKU/beat_this` (PyTorch, and a Core ML build if one is produced) with the current onset suggestion and with tapped markers. Record latency and battery. A miss does not change the pad engine. SAM Audio large stays off that path until the gate is accepted and a consented stem test exists.

The iOS client milestones (1–4) can wait if the Home Screen Sampler and the website already cover review. The mask baseline (5–6) is still the first AVT experiment, and it does not require a phone app.

---

## 7. Blockers and acceptance tests

### Blockers

1. **No footage test has been run.** Every quality sentence about Wan, LatentSync, and SAM Audio on this production is **UNTESTED**. Shipping any of them into Dress or lip sync is blocked on a representative clip and on Class C review.
2. **Wan-Animate-2 has no production host in the current Fal/Replicate routes.** Those routes are the older Animate-14B. Using a public Space as the backend is blocked (no SLA, shared quota, model can change).
3. **LatentSync commercial self-host is blocked** until InsightFace's non-commercial packs are removed or licensed, and until OpenRAIL++ use restrictions are accepted in writing. The Fal route's checkpoint version is unverified.
4. **SAM Audio is gated.** Access has not been requested by this audit. The GGUF redistribution needs a legal read before commercial use. On-device Core ML does not exist for it.
5. **Native AVT auth is unproven** against the Lovable managed callback.
6. **Sampler on-device proof is not in the repo**, even though the PWA and cloud code are on `main`. A native rewrite before that proof is blocked by the app's own `DEVICE_PROOF.md`.
7. **SAM 3 video masks:** no flag-gated PR was open on 24 October 2026. This audit still does not open one. The still path already exists. A later flagged comparison is blocked until someone names the frames, and until runtime and cost are measured rather than estimated. `facebook/sam3` remains gated, license `other`; the gated license file was not downloaded.
8. **Issue #105 is open**, and a reconstruction evaluator already exists. A new "auto QA" project that ignores `evaluateVideoQa` would duplicate it. Shot-level QA for wardrobe is a real gap and is not an iOS feature.
9. **Spend freeze for this task.** Higgsfield has already refused calls for balance (PRs #363–#366). This audit does not ask anyone to top up a wallet.

### Acceptance tests (proposed, none executed)

**Sampler, current PWA (milestone 1).** On an iPhone, Export → Run device check: three exports, 24-bit, frame counts 269891 at 48 kHz or 247962 at 44.1 kHz, hit error ≤ 1.5 samples, stems sum to the mix at ≤ −80 dBFS, pad edges clean, reopen sample-exact. Then the manual pass in `DEVICE_PROOF.md` §3, including the silent switch and a DAW polarity check. A FAIL is recorded as measured. Thresholds are not edited to pass.

**Sampler, native, if built.** The same numbers, plus: 16 pads triggered from two thumbs with no dropped hit in a 30 s test at the measured output latency; an interruption (call or lock) resumes silent until the next tap and then plays; export of a 4-bar ×4 mix plus stems shares one frame count; airplane mode playback of a project that was already on disk succeeds; cloud merge matches `merge.test.ts` when the phone and MCP both edit.

**AVT native, if built.** Signed-in user reads only their rows. A shot opened on the phone shows the same selected asset id as the website. Approving on the phone changes the same field the website reads, and a second device sees it after refresh. A `dryRun` Dress returns a plan and creates no `provider_jobs` row. Killing the app mid-playback does not create a job.

**Any model test, if later approved.** 2–4 s of a real performance take, original pixels retained for the face from the brows down, the beard, the mouth, and the hands (max absolute difference 0 on that mask, same proof `body_only_swap.py` prints). Garment construction and logo compared to the product still. No flicker across the cut. Identity recognizable to Fendi. A written fail stops the experiment. The run records model id, revision, prompt, seed, resolution, and cost. It is a go/no-go, not a certified benchmark, until `docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md` is followed on purpose. A director looking at the clip is a separate acceptance from that score.

**Defect baseline, before Wan.** For each of 3–5 named frames: asset id, timecode, and one label from the segmentation list or the generation list in §8. SAM 3, if run, is compared on those frames only, with MediaPipe still available behind a flag. The sheet records wall time, hardware, and dollars. A blank cost cell is a failed record, not a guess.

**beat-this, if benchmarked.** On at least two real songs, beat times versus the app's current suggestion and versus a hand-tapped grid. Core ML build reports model file size, compute units, and time per 30 seconds of audio on one iPhone. The pad engine's device check still passes with beat-this turned off.

---

## 8. ChatGPT's review, and where this audit agrees

Source, read only, not commented on: [fendi-control-center issue #77](https://github.com/fendifrost-dot/fendi-control-center/issues/77), posted 24 October 2026 by `fendifrost-dot`, titled as ChatGPT's independent assessment of Grok's Hugging Face deep dive. No production change and no paid test is authorized there either. Items about LLB, Continuum, Modest, Boltz, and ACE-Step are outside the two repos this audit was asked to cover. They were not verified here.

### 8.1 Segmentation defects and generation defects

**Agree with ChatGPT.** SAM 3 is a mask model. It does not repaint a jacket, move a mouth onto a vocal, or relight a shot. Grok's short note listed MediaPipe misses, Telea fill, grain, a $3.405 dress run, lip-sync, and missing shot QA in one list. That list mixes two causes. This audit splits them as follows.

| Defect ChatGPT named | Class | Evidence already in AVT | What a new mask can and cannot do |
|---|---|---|---|
| Missing shoe | Segmentation | **VERIFIED** the MediaPipe multiclass file has six labels and no shoe class (`FACE_PRESERVING_CLOTHING_SWAP.md`). A scored "shoe missing on frame N" was not re-measured here. | A better mask can include the shoe in the put-back. It cannot invent a shoe the generator failed to draw. |
| Black surrounding area / dark rim | Segmentation or composite edge | **VERIFIED** `--choke` exists because the matte's outer band carries the take's wall and floor, "a dark rim on a light garment" (`replace_him_in_clip.py`). The recipe records a navy fringe where the original cap is larger than the swapped cap. | A tighter matte can shrink the rim. A black halo painted by the generator inside the garment is a generation defect. |
| Double silhouette / ghost outline | Compositing | **VERIFIED** the Telea help text says the first inpaint "smeared a ghost of his outline"; row fill was added later. | A mask does not choose the fill. DiffuEraser would be a fill experiment, still **UNTESTED**, and not commercially clear (§8.3). |
| Profile face, small face | Segmentation | **VERIFIED** `clip_face` is the manual box "when the landmarker misses it (profile, cap)". PR #365 added a 3× window for a small face in `verify_scene.py`. | SAM 3 might track those frames. That is a **HYPOTHESIS** until the same frames are scored. |
| Edge flicker | Split it | **VERIFIED** the approved body-only recipe holds each Genjutsu frame for about 2.7 source frames (clothes at 22.25 fps on a 59.94 plate). Mask-to-mask jitter was not measured. | Held generative frames flicker even with a perfect mask. Mask jitter is a separate measurement (frame-to-frame IoU). |
| Wardrobe identity, stripes, logos | Generation | **VERIFIED** the recipe: "the garment itself is still Genjutsu's rebuild." | A mask selects pixels. It does not redraw the jacket. |
| Glasses | Do not assign yet | **VERIFIED** body-only keeps his own glasses because they sit inside the protected face; the outfit's glasses reference has no effect on that final. | If the glasses are the take's, the mask is doing its job. If a whole-frame Dress file shows different glasses, that file is the generative intermediate. |
| Mouth timing | Generation, and only on the lip-sync lane | **VERIFIED** body-only keeps the take's mouth. `lipsync-shot` then runs `fal-ai/sync-lipsync/v2` when the mouth is supposed to follow the song. | SAM 3 does not set phoneme timing. LatentSync would be compared on this lane only. |
| Lighting | Grade / composite | **VERIFIED** `replace_him_in_clip.py` applies one per-channel gain from the generated face to the real face. The showroom write-up says his light stays fixed while the plate shifts. | A segmentation model does not match light. |

**Agree with ChatGPT's warning.** Nothing in the repo proves that masking causes most of the visible failures. The shoe-class gap and the profile fallback are real. The jacket, the mouth-to-song pass, and the light gain are real too. A before/after on named frames is the only way to weigh them.

**Disagree with treating SAM 3 as the first thing to build.** ChatGPT ranks a SAM 3 benchmark first among models, and also says to keep MediaPipe behind a flag. The second half is the part this audit adopts. The still proxy already calls `fal-ai/sam-3/image`. No video-mask PR was open. The first work is the labeled baseline on frames that already exist, at $0. The SAM 3 run is the comparison after those frames are named. Grok's fuller dive, as ChatGPT describes it, estimated "1–2 days" and "cents per clip." Those numbers are **not** in the short note attached to this audit, they were **not** measured here, and they stay hypotheses. `facebook/sam3` is gated. Its license file was not downloaded (the card says `other`). There is no guarantee in the card of feet, profile faces, or zero flicker.

### 8.2 Wan after the baseline, compared with Higgsfield

**Agree with ChatGPT on order.** Wan is a generator. It comes after the mask and compositing baseline, and the comparison set is the Higgsfield runs that already exist (Dress list price $3.405 for the 4.04 s case; PR #367 records one such charge). Wan does not get to skip body-only put-back. ChatGPT's sentence is right: do not assume it can redress the body and keep the original face unless a test shows that. The face proof remains max difference 0 on the protected pixels.

**Disagree on the name being one model.** ChatGPT's link is `Wan-AI/Wan2.2-Animate-2-14B` (Apache-2.0, August 2026, direct driving video). Fal and Replicate routes found in this audit serve `Wan-AI/Wan2.2-Animate-14B` (Apache-2.0, September 2025). A cost comparison that uses Fal's $0.08 per billed second is a comparison to the older checkpoint. Animate-2 had no Fal price and no Fal route in this audit. Grok's short note named the older repo. Both names are real. A test log has to say which one ran.

### 8.3 Licenses Grok summarized, checked at a specific version

| Model | Exact version read | What the license actually says | Versus Grok's short note | Versus ChatGPT |
|---|---|---|---|---|
| MiniMax H3 | `MiniMaxAI/MiniMax-H3`. Community license date **2 August 2026**. Licensor **Nanonoble Pte. Ltd.** | Applicable territory is worldwide **except the EU, the UK, South Korea, and the United States**. A separate license is how those territories are supposed to get access. Section IV: yearly revenue above **US$20 million** needs prior written authorization even inside the allowed territory. Section V.4: use of the works **or their outputs** outside the applicable territory is not authorized, and hosted services count as use. The encoder note in the same file says the encoder is Qwen3-VL-32B under Apache-2.0. That does not lift the territory clause. | **Agree that the US is excluded from the community grant.** The note understated the exclusion (EU, UK, and South Korea as well) and did not mention the $20 million clause. | **Agree** that a categorical line is not enough. The text above is the category, with the version and the entity. A US production calling Fal's MiniMax-H3 route (the Hub card lists fal-ai as a provider) is the case the territory clause is about. This audit does not give a legal opinion. It does say the community license is the wrong grant for that use. |
| MatAnyone | `pq-yang/MatAnyone` v1.0.0. `LICENSE` is **S-Lab License 1.0**, copyright 2023 S-Lab. | Redistribution and use for a **non-commercial purpose**. Commercial use: contact Peiqing Yang, Shangchen Zhou, and Chen Change Loy. | **Agree** it is non-commercial by default. | **Agree** it is not "no commercial path exists." The path is written permission. |
| MatAnyone 2 | Code `pq-yang/MatAnyone2` `LICENSE.txt`. Weights `PeiqingYang/MatAnyone2`. Same **S-Lab License 1.0** text. Hub README has no license key; the GitHub file does. | Same non-commercial default. A June 2026 GitHub comment from a project author tells a Core ML porter to keep that restriction. | **Agree** MatAnyone2 is in the same license family as v1. | Same as v1. A third-party iPhone port does not make the weights commercial. |
| LTX-2.5 | Hub: `Lightricks/LTX-2.5`, gated, license `other`, card updated 11 Oct 2026. The gated `LICENSE` blob returned **401**, so it was not read from the Hub. The text that was read is `github.com/Lightricks/LTX-2` file `LICENSE-2_x`, **LTX-2.x Community License, 11 August 2026**, which says it covers LTX-2.5 versions released since that date. Licensor **Lightricks Ltd.** | Worldwide grant, subject to Attachment A, **except** entities with annual revenue of at least **$10,000,000**. Revenue is aggregated across subsidiaries, affiliates, and companies under common Control (more than 50% ownership or the power to direct management). Those entities need a paid license from `licensing@ltx.io` for any use that is not the defined non-commercial purpose (personal hobby, or internal evaluation that does not earn revenue, touch end users, or train a commercial model). | The attached short note **does not mention LTX-2.5**. | **Agree.** It is not universally forbidden. It is also not "free for every company." This audit does not know the revenue of the using entity, and it does not recommend LTX-2.5 for the wardrobe lane. |
| DiffuEraser | Hub `lixiaowen/diffuEraser`, tag `apache-2.0`, updated 20 Jan 2025. Code `lixiaowen-xw/DiffuEraser`, README on `master`. | Apache-2.0 **except third-party components**. README: ProPainter is the prior model; comply with ProPainter's license or replace it. Required weights include `propainter/ProPainter.pth` plus `stable-diffusion-v1-5`. | The short note did not mention ProPainter. | **Agree.** The top-level Apache tag is not a commercial clearance. |
| ProPainter | `sczhou/ProPainter` `LICENSE` on `master`. **S-Lab License 1.0**, copyright 2023 S-Lab. | Non-commercial unless Dr. Shangchen Zhou and Prof. Chen Change Loy permit commercial use. | Not in the short note. | This is the transitive block ChatGPT asked for. |

`stable-diffusion-v1-5` is on DiffuEraser's download list. This audit did not re-read that model's license file. It is a second uncleared dependency. Replacing ProPainter and leaving SD 1.5 unexamined would repeat the mistake.

### 8.4 Sampler: offline instrument, beat-this, SAM Audio

**Agree with ChatGPT.** The 16 pads, waveform chop, BPM fit, and 24-bit export stay on device. The web app already does this in `src/lib/frost/` with no network on the trigger path. A native port, if milestone 1 says the PWA misses taps or dies on export, keeps that offline. Cloud sync stays optional.

**beat-this.** **VERIFIED** `CPJKU/beat_this` is MIT (copyright 2024 Institute of Computational Perception, JKU Linz). The official interface is PyTorch (`beat_this.inference`, checkpoints such as `final0`). **No official Core ML model is in that repo.** A third-party iOS app (`palmier-io/palmier-pro`) documents a 6.6 MB FP16 `small0` conversion: raw 22,050 Hz mono, 30-second chunks, beat and downbeat logits, with a parity check against upstream on a click track. That shows a conversion is possible. It does **not** show accuracy on these songs, battery cost, or that Frost Sampler should replace `suggestTempo`. iPhone execution inside this product is **UNTESTED**. ChatGPT is right to call iPhone execution unverified.

**SAM Audio large.** **Agree with ChatGPT.** `facebook/sam-audio-large` is gated. The license read from `github.com/facebookresearch/sam-audio` is the SAM License (19 November 2025): a commercial grant with trade-control and acceptable-use limits, not Apache-2.0. Shipping it, or the `audio-cpp` GGUF of it, needs that review. It is an optional stem, not the pad engine.

### 8.5 Shot QA

**Agree** that an LLM looking at a frame is not ground truth, and that ghost outlines, black contamination, flicker, a frozen mouth, missing accessories, and delivery specs are the checks worth adding. **Disagree** that this work starts from zero. `evaluateVideoQa` (`lane-e2-video-qa-v1`) already scores reconstruction packs. Issue #105 is still open because that scorer does not cover Dress, body-only, or replace-him. Extend that contract, or write a sibling one. Do not claim either equals a director's acceptance. ChatGPT's gate matches `docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md`: a preliminary score is not approval.

---

## Sources read for this audit

- AVT: `.deployment/manifest.yml`, `src/start.ts`, `src/routes/auth.tsx`, `src/integrations/lovable/index.ts`, `src/integrations/supabase/types.ts`, `src/lib/providers/registry.ts`, `src/lib/eval/videoQaEvaluator.ts`, `supabase/functions/dress-clip/index.ts`, `supabase/functions/lipsync-shot/index.ts`, `supabase/functions/_shared/lipsync.ts`, `supabase/functions/sam3-segment-proxy/index.ts`, `supabase/functions/avt-mcp/index.ts`, `scripts/edit/body_only_swap.py`, `scripts/edit/replace_him_in_clip.py`, `docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`, issue #105, open PR list, `git ls-remote` for mask-related heads.
- Sampler: `README.md`, `AGENTS.md`, `FRONTEND_HANDOFF.md`, `DEVICE_PROOF.md`, `MCP_SETUP.md`, `roadmap.md`, `package.json`, `public/manifest.webmanifest`, `supabase/config.toml`, `src/lib/frost/services.ts`, `src/lib/frost/engine.ts`, `src/lib/mcp/tools.ts`, `src/lib/cloud/key.server.ts`, `src/integrations/supabase/types.ts`. Commit `29f21e0`.
- Hub cards and READMEs: `Wan-AI/Wan2.2-Animate-14B`, `Wan-AI/Wan2.2-Animate-2-14B`, `ByteDance/LatentSync-1.6`, `facebook/sam-audio-large`, `facebook/sam-audio-small`, `audio-cpp/SAM-Audio-GGUF`, `facebook/sam3`, `facebook/sam3.1`, `lixiaowen/diffuEraser`, `Qwen/Qwen3.8-27B`.
- License pages: `github.com/facebookresearch/sam-audio` LICENSE (SAM License, 19 Nov 2025); `github.com/bytedance/LatentSync` requirements and Apache-2.0 code license; InsightFace README on pretrained-model non-commercial terms.
- Provider pages: Fal Wan 2.2 Animate move and replace pricing; Fal `fal-ai/latentsync` pricing. No job was sent.
- ChatGPT review: `fendifrost-dot/fendi-control-center` issue #77 (read 24 Oct 2026, no comment posted).
- Licenses read in full or in the granting sections: `MiniMaxAI/MiniMax-H3` LICENSE (2 Aug 2026); `pq-yang/MatAnyone` LICENSE and `pq-yang/MatAnyone2` LICENSE.txt (S-Lab 1.0); `sczhou/ProPainter` LICENSE (S-Lab 1.0); `Lightricks/LTX-2` `LICENSE` and `LICENSE-2_x` (11 Aug 2026; the gated Hub LICENSE blob for `Lightricks/LTX-2.5` returned 401); `lixiaowen-xw/DiffuEraser` README license section; `CPJKU/beat_this` LICENSE (MIT).
- Hugging Face pricing pages fetched 24 Oct 2026: `https://huggingface.co/docs/inference-providers/en/pricing` and `https://huggingface.co/pricing`.
