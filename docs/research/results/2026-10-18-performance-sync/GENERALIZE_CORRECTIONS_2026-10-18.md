# Can the per-clip ±1–2 frame performance-sync corrections be generalized? (18 Oct 2026)

Brief (Fendi, 18 Oct: "Que it up"): the open blocker was "performance-sync ±1–2f corrections stay provisional per
clip; not generalized". Measure the offsets across the finished clips and, only if there is a consistent and
explainable rule, build it into the sync/render path.

**Answer: no, and nothing was changed in code.** No rule is supported. Three findings:

1. There are no corrections to generalize. `shot_asset_assignments.slip_seconds` is 0 on every row in every
   project, and no Cut clip has been moved off its sync by more than frame quantization.
2. Every deterministic stage of the chain is already accurate to under a frame, so no offset is coming from the
   encoder, the fps, the trim or the duration.
3. Whatever offset is left lives in the generated articulation. The only $0 way to measure it (mouth opening against
   the vocals) has a noise floor of about ±6–8 frames on the real take, which is known to be in sync. A ±1–2 frame
   rule cannot be measured with it, let alone justified.

**Spend: $0.** Existing files, local ffmpeg and MediaPipe only. Read-only DB queries; no AVT writes. Labels follow
`CLAUDE.md`. Numbers: `generalize_measurements.json` (this folder).

## 1. Corrections that exist today

| Where | Correction | Status |
|---|---|---|
| DB, board Lyric sync (`shot_asset_assignments.slip_seconds`) | none: 0 rows ≠ 0, all projects | VERIFIED |
| DB, Cut `2976b498` (imported v1 cold open), the 16 lip-sync spots | in-point vs the clip's own sync: −0.035 … +0.023 s (−0.84 … +0.55 f) | VERIFIED. This is frame-grid quantization, not a correction (§3). |
| Trace §5 (this folder): E1 v3 on c033 +1 f, E2 on c034 0 … +1 f | RECOMMENDATION only, never written | These are the "±1–2 f" in the blocker. |
| Box edit v2 (`ysl_ice_on_cut`, 17 Oct): one global −6 f slip on the 14 montage lip-sync spots, chosen by eye | box EDL only, never in AVT | Superseded in v4/v5: the real take and the Pro lip-sync replaced those spots. |
| `performance_syncs.drift_ppm` | 0 on all 176 YSL rows (175 `derived`, 1 `manual` 0.8538) | VERIFIED |

## 2. Measured clips (YSL `764a63d2`), lag in frames at 24 fps

Sign: + means the audio feature arrives after the mouth, so the picture is early. "self" = the clip's mouth against
its own audio track; "take" = the real take's mouth against the vocals over the same song window.

| Clip / group | Provider / model | fps · frames | Timing source | Measured | Applied |
|---|---|---|---|---|---|
| **Real take** (control) `IMG_5633` → hero | camera | 59.94 → 24 grid | GCC-PHAT sync 0.8538 (23/30 windows, 0.2 ms spread); box v3 bleed check 2–19 ms | mouth vs vocals, 19 × 2.5 s windows: median +0.3, IQR −5.2 … +6.4, **sd 7.7**; 8 × 10 s windows: sd 6.4 | none |
| **Lip-sync lane**, 11 of 21 outputs (c009 c011 c013 c016 c017 c023 c025 c027 c028 c036 c047) | Fal `sync-lipsync/v2` | 24 · 97 (4.042 s), AAC 44.1 kHz | vocal-stem slice cut at the montage's derived sync | **embedded audio vs the song at the sync: 0.00 ms on 11/11** (GCC-PHAT at 48 kHz). self: −1.1, −9.1, +5.5, −4.1, −0.4, −12 (edge), −6.1, −8.6, +9.4, +1.3; c047 not tracked. r 0.1–0.6 | none (all marked unusable by Fendi on 17 Oct: the pass alters his face) |
| Take over the same 12 lip-sync windows | camera | — | as above | −6.0 … +7.5 (r −0.01 … 0.53) | — |
| **Seedance restage** E1 v3 `ce365795` (c033) | Higgsfield Seedance 2.5 `reference_to_video` | 24 · 241 (10.042 s), no audio | vocal slice at the placement sync 53.8 | vs vocals, 2.5 s windows: −7.3, −8.6, −8.8, −9.9 (r ≤ 0.36). Trace lip closures: median −0.085 s (−2 f) | none (+1 f recommended) |
| **Seedance restage** E2 `ad2faff9` (c034) | same | 24 · 241, no audio | vocal slice at 55.275 | windows −4.1, −9.7, +12 (edge), +6.7. Trace lip closures: median −0.075 s (−1.8 f), IQR 0.065 s | none (0 … +1 f recommended) |
| **Montages** in the Cut (c009–c034, 13 clips; box measurement 17 Oct) | Higgsfield Seedance montage | 24 · 97, no audio | no audio drove the mouth; sync derived from the reference window | env peak +3.4, +12, −10, +5.1, +5.8, −0.9, −12, −9.6, +3.5, −3.1, −9.5; c013/c030 not tracked. vs the take's mouth: −12 … +12 | none in AVT (box v2 −6 f, superseded) |
| Dressed takes c033 `5a81d308`, c034 `3a31a320` (trace §1) | Genjutsu object-swap | 59.94, conformed 89 → 240 f | inherits the take's sync | frame map vs source: within 20–30 ms, sd 13 ms | none needed |

## 3. Candidate causes, each checked

| Hypothesis | Test | Result |
|---|---|---|
| AAC priming (1024 samples, 21–23 ms) or an edit-list offset | Decode the lip-sync outputs' AAC with ffmpeg, which honours the edit list, and correlate with the song at the stored sync | **Ruled out:** 0.00 ms on 11/11, and video/audio `start_time` 0.000 on all. The render takes the song from the WAV, never from a clip's AAC. |
| fps rounding of the start frame | Every generated clip is 24/1 CFR (97 or 241 f). Board in-point = shot start − (sync + slip), derived on every read. Cut in-points vs sync. | Up to ½ frame by construction, where `derived` syncs are ms values off the 1/24 grid (e.g. 15.852). One spot (c033, −0.84 f) came from the box `build_v1.py` rounding the timeline-in and the in-point separately: a box-only scratch tool, not repo code. Below one frame, and no constant sign. |
| Clip start trim / handles | Dress cut with handles vs the dressed take's sync | Holds within 20–30 ms (trace §1). |
| Duration / clock drift | `drift_ppm`; hero vs original fit | 0 ppm everywhere; slope 0.99997, residual 1 ms. No sign of drift inside a 4–10 s clip that the data can show. |
| Provider latency (a constant per model) | The lip-sync outputs: the provider got exactly the right audio (0.00 ms), so any constant would show in self-lag | −12 … +9.4 f with weak r, while the same metric spans −6 … +7.5 f on the in-sync take over the same windows. **Not distinguishable from noise.** |
| The generated performance itself | Montages, restages | Spread per clip and per phrase (−12 … +12 f), with no constant. Matches the 17 Oct finding in `_shared/lipsync.ts` ("no single offset fits"). |

**Root cause of the reported ±1–2 f: none found, because no ±1–2 f offset could be measured.** The deterministic
chain (sync → dress → placement → render) holds to under one frame (VERIFIED). The rest is model articulation: it
changes clip by clip and phrase by phrase, and at full-body framing it can't be resolved below about ±6 frames
without a human looking.

## 4. Decision and recommendation

- DECISION: no generalized correction. A constant built from E1 v3/E2's −2 f lip-closure medians would rest on two
  clips, from one route, whose own metric spreads ±0.2 s on footage proven in sync. It would move every
  camera-clocked clip (the take, the dressed takes, the composites, all correct today) off sync.
- Keep corrections per clip and by eye: the board's Lyric sync (`slip_seconds`, + = picture later) and the Cut's
  "Adjust footage timing" (the opposite sign, trace §7). Both exist and both work today.
- If a per-route rule is wanted later, the $0 evidence that could support one is an **audio-driven route measured
  at close-up**: a face of ≥ 200 px, at least five clips, judged by eye at ±1 frame (the trace §4 A/B playback), with
  the take's own lag over the same windows subtracted. Only a route whose clips agree within ±1 frame across those
  five deserves a per-provider default. It belongs as a column on the route (e.g. a `mouth_offset_frames` default
  applied when a new assignment gets its `slip_seconds`), never in `performance_syncs`, which must stay the
  camera/song truth.
- Small and separate (not done here): the EDL importer in `_shared/editModel.ts` labels `lipsync_pending` rows
  `mouth: "camera"`. In the imported YSL Cut those rows are Seedance montages (generated mouths), so the Cut
  under-warns on exactly the clips whose mouth is the model's. Worth a one-line review.

## 5. Reproduce (box)

Clips came via `avt_signed_url`. Scripts are in `/workspace/avt_sync_gen` (`xc_audio.py`, `mouth_ls.py`, `lag_ls.py`,
`lag_sd.py`), venv `/workspace/.venv-lips` (MediaPipe FaceLandmarker), vocals `htdemucs` stem of song 10–65 s, and
the real-take mouth series `/workspace/ysl_lipsync_slip/raw_mouth_songgrid.json` (hero 59.94 fps sampled on the
24 fps song grid at sync 0.852).
