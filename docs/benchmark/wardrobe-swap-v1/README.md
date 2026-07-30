# Wardrobe Video-Swap Benchmark Set — `wardrobe-swap-v1`

Canonical short-clip benchmark for the **LOCKED** garment-swap architecture
([`docs/VIDEO_SWAP_ARCHITECTURE.md`](../../VIDEO_SWAP_ARCHITECTURE.md)). Prepared
**locally with ffmpeg** from the T7 master to bypass Fal's inability to ingest the
~2 GB 4K HEVC / HLG-HDR / Dolby-Vision master. This is the reusable set the three
lanes benchmark against for the §7 kill criterion.

> Path safety: everything here lives under `/Volumes/T7` (media) or this repo (text).
> No iCloud, no recursive walks.

---

## 1. Where the artifacts live

**Heavy media (T7 — the 4K frames + proxy are far too large for git):**

```
/Volumes/T7/AVT VIDEO CLIPS/benchmark/wardrobe-swap-v1/
├── proxy/IMG_5633_t75p0_d4p0_h264.mp4   # H.264 processing-friendly proxy (~15 MB, 240 frames)
├── frames/frame_00000.png … frame_00239.png   # 16-bit PNG near-lossless, 240 frames, ~7.1 GB
├── manifest.json                        # full manifest (source + range + per-frame timestamps)
├── ffprobe_master.json                  # raw ffprobe of the master
├── ffprobe_proxy.json                   # raw ffprobe of the proxy
├── source_pts_times.txt                 # 240 true master pts_times in [75.0, 79.0)
└── README.md                            # copy of this file
```

**Text pointers (this repo — small, versioned):**

```
docs/benchmark/wardrobe-swap-v1/
├── README.md            # this file (authoritative handoff)
├── manifest.json        # copy of the manifest
├── ffprobe_master.json
├── ffprobe_proxy.json
└── source_pts_times.txt
```

---

## 2. The master (ffprobe summary)

`/Volumes/T7/AVT VIDEO CLIPS/YSL VIDEO FILES/IMG_5633.mov` — **1,975,591,193 bytes**

| Property | Value |
|---|---|
| Video codec | **HEVC** Main 10 (`hvc1`), 10-bit `yuv420p10le` |
| Coded dims | 3840×2160 |
| Rotation | **−90** (display matrix) → displays **2160×3840 portrait** |
| Color | primaries **bt2020**, transfer **arib-std-b67 (HLG)**, matrix **bt2020nc**, range **tv** |
| HDR | HLG BT.2020 10-bit **+ Dolby Vision** (dv_profile 8, bl_compatibility 4, RPU present, no EL) |
| Frame rate | `r_frame_rate` **60000/1001 ≈ 59.94 fps** (avg 428100/7141 ≈ 59.949; time_base 1/600) |
| Duration | 190.33 s, 11416 frames, ~82.8 Mbps |
| Audio | AAC LC, 48 kHz, stereo, ~156 kbps |

This exact combination (HEVC + 10-bit + HLG + Dolby-Vision + 2 GB) is what Fal
can't ingest — hence the local proxy.

---

## 3. Chosen range — **start 75.0 s, duration 4.0 s (75.0 → 79.0)**

Frame-accurate (input `-ss 75.0` with accurate_seek + re-encode). The window
holds **240** source frames; first frame's true pts is **75.011667 s**, last is
**78.998333 s**.

**Why this range (deliberately hard, per §7 kill criterion):** one continuous
shot, **no scene cut**, containing —

1. **Arm folded across the chest** — the camo garment is occluded by the forearms.
2. **A forward torso bend** with head-down and **arm-over-arm self-occlusion**
   (~76–78 s) — the hardest sub-window: rotation + occlusion + a pose change.
3. **Unfold + re-cross** of the hands over the garment.

Torso rotation + arm-crossing-chest + garment occlusion + pose change in 4 s. The
camera is **locked-off** (near-static tripod), so subject motion is the entire
stressor — chosen over any static frontal shot. (Subject wears a camo
short-sleeve shirt w/ US-flag + shoulder patches — that shirt is the garment
region under test.)

---

## 4. The proxy clip

`proxy/IMG_5633_t75p0_d4p0_h264.mp4`

| Property | Value |
|---|---|
| Codec / container | **H.264 High**, mp4, **faststart** (moov before mdat) |
| Pixel format | `yuv420p` (**8-bit** — see color note) |
| Dims / orientation | **2160×3840, upright** — rotation −90 **baked in** (autorotate); display-matrix tag removed |
| Frame rate | 60000/1001 (matches source exactly) |
| Frames / duration | **240** / ~4.00 s |
| Color | primaries **bt2020**, transfer **arib-std-b67 (HLG)**, matrix **bt2020nc**, range **tv** — **carried through, NOT tonemapped** |
| Size | ~15 MB |
| Audio | AAC 128k (trimmed range) |

Encode:
```
ffmpeg -y -ss 75.0 -i "$SRC" -frames:v 240 \
  -map 0:v:0 -map "0:a:0?" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset medium \
  -color_primaries bt2020 -color_trc arib-std-b67 -colorspace bt2020nc -color_range tv \
  -c:a aac -b:a 128k -movflags +faststart OUT.mp4
```

**Orientation note (important):** the source's −90 display matrix is **baked into
the pixels** (upright 2160×3840) and the rotation tag removed. This deliberately
neutralizes the historical *sideways-frame* footgun — engines that ignore rotation
metadata still get an upright person.

**Color / gamma note:** No tonemap and no gamma remap. Primaries/transfer/matrix
are preserved as source. Bit depth was reduced **10-bit → 8-bit** for the proxy
(H.264 processing-friendliness) — that is a quantization, **not** a gamma shift.
The frame sequence keeps ~10-bit via 16-bit PNG.

---

## 5. The frame sequence (canonical near-lossless reference)

`frames/frame_00000.png … frame_00239.png` — **240** frames.

- Format **PNG `rgb48be` (16-bit, near-lossless — preserves source 10-bit)**, 2160×3840, upright.
- Zero-padded 5-digit, index 0 == range start.
- **1:1 aligned with the proxy** (same source frames, same accurate seek).
- Per-frame **true master source timestamps** are in `manifest.json → frames[]`
  (`sourceTimestamp` = master pts_time; `offsetFromStart` = seconds since frame 0).
  These are read straight from the master's pts_times (1/600 time_base), **not**
  recomputed from a nominal fps — robust to VFR.

Extract:
```
ffmpeg -y -ss 75.0 -i "$SRC" -frames:v 240 -map 0:v:0 -an -pix_fmt rgb48be \
  -start_number 0 frames/frame_%05d.png
```

---

## 6. Caveats (read before using)

- The proxy/frames **preserve HLG/BT.2020** (no tonemap). Engines that ignore
  color tags render it as flat SDR (the standard "HLG on SDR" look) — **expected,
  not a gamma bug**.
- This box's ffmpeg lacks `libzimg` (zscale) and `libplacebo`, so a proper
  **HLG→BT.709 SDR tonemapped** variant was **not** produced. If a lane needs true
  SDR input, generate it explicitly on a zimg-enabled ffmpeg — **document it, never
  swap silently.**
- Dolby-Vision "Multiple RPUs / skipping" decode warnings are **benign** (the
  RPU/EL layer is dropped; the base HLG layer is used).

---

## 7. Handoff — running the three lanes on this proxy (live agent)

You (a live agent with Lovable publish/redeploy + upload) run the lanes; the
benchmark-prep agent does **not** deploy. All three lanes read the proxy after you
upload it as a `project_assets` video row.

### 7.0 One-time upload
Upload `proxy/IMG_5633_t75p0_d4p0_h264.mp4` as a video `project_assets` row for the
test user (bucket per `bucketForAssetType`, typically `project-clips`). Note its
`assetId`. Pick the wardrobe `character_features` row to swap in → `wardrobeFeatureId`
+ `artistId`. The 16-bit PNG frames + `manifest.json` are the ground-truth reference
for scoring (identity / construction / stripe / occlusion / flicker).

### 7.1 Lane C — Decart Lucy batch v2v (temporal-consistency benchmark)

Status of code: **built and guardrailed.** `wardrobe-video-lucy-proxy` +
`_shared/lucyV2v.ts` (16/16 unit tests pass). It is **off until env is set** and
**fails loud** — it never silently swaps engines:

- `LUCY_V2V_FAL_MODEL` unset → **500 `missing_LUCY_V2V_FAL_MODEL`**.
- a `/realtime` slug → **500** (WebRTC can't be driven by submit/poll).
- an unknown Lucy slug → **500 not a known batch Lucy model**.

**Model id + payload + transport (definitive):**
- Model id: **`decart/lucy-edit/fast`** (recommended default; cheapest). Also valid:
  `decart/lucy-edit/dev`, `decart/lucy-edit/pro`, `decart/lucy-restyle`.
- Transport: **standard Fal queue submit/poll** (`queue.fal.run/<model>`) — fully
  compatible with CC `fal-run` + `fal-queue-poll`. **NOT** realtime/streaming.
- Payload (CC `fal-run`): `{ action:"fal-run", model, input:{ prompt, video_url,
  resolution?("720p", pro/restyle only), seed?(restyle only) } }` → result
  `{ video:{ url } }`.
- **Honest boundary:** batch Lucy is **prompt-driven** (garment described in TEXT,
  no garment image) → it **regenerates** garment pixels and **violates** the
  pixel-preservation hard rule. Lane C is a **temporal-consistency benchmark** —
  expected to **fail** the construction/stripe half of the kill criterion and
  (uniquely) **pass** the flicker half. The only image-accurate Lucy path is
  realtime-WebRTC (`decart/lucy2-vton/realtime`), deliberately not wired.

**Steps to enable Lane C:**
1. **CC allowlist — DONE.** `decart/lucy-edit/{fast,dev,pro}` + `decart/lucy-restyle`
   are merged into the `switchx-restyle` `fal-run` ALLOWED set
   (`fendi-control-center` PR #15, `main`).
2. **Redeploy `switchx-restyle`** on Control Center (Lovable → Edge Functions).
   *(Publish ≠ edge redeploy.)*
3. **Set AVT edge secret** on the AVT Lovable project (`qoyxgnkvjukovkrvdaiq`):
   ```
   LUCY_V2V_FAL_MODEL=decart/lucy-edit/fast
   ```
   (optional `LUCY_V2V_RESOLUTION=720p` — only honored for `pro`/`restyle`.)
   AVT already has `COMPOSE_LOOK_CC_URL`, `SWITCHX_PROXY_SECRET`, Supabase keys.
4. **Redeploy `wardrobe-video-lucy-proxy`** on AVT.
5. Trigger via the in-app **Lane C** runner (`runLaneCRoundtrip`, dispatches
   `wardrobe-video-lucy-proxy`). To edit only the benchmark range, pass a
   `serverExtract` range + `targetFps` (it seek-trims first, then Lucy edits the
   trimmed clip). Output lands in `project-exports/<user>/<asset>/lucy/<session>.mp4`;
   `lucy_status` → `ready`, repro metadata under `lucy_repro`.

### 7.2 Lane B — still-VTON keyframe mapper
- Env-selected via **`FRAME_SWAP_FAL_MODEL`** on the Phase-2b
  `wardrobe-video-swap-proxy` (fal-run) path. Recommended:
  `fal-ai/kling/v1-5/kolors-virtual-try-on` (already allowlisted on CC).
- Diagnostic per-frame VTON; feeds keyframes into Lane A propagation. **Do not**
  scale independent per-frame VTON to full length (arch §1).

### 7.3 Lane A — Grok keyframe + propagation
- Approve Grok hero keyframes, then **propagate** the approved garment across the
  240 frames. **No Fal optical-flow/warp endpoint exists** — propagation must be a
  custom RAFT/EbSynth worker **off Fal** (`_shared/propagation.ts` stays "disabled"
  as the honest steady state, not a missing-model-id gap).

### 7.4 Score against the kill criterion (§7)
On the 4 s result, judge: **Fendi's identity · exact jacket construction · stripe/
logo placement · natural occlusion — without flicker/morphing.** Use the 16-bit PNG
frames as the pixel-truth reference. If a lane can't hold all four, **stop and
redesign before scaling** (arch §7).
