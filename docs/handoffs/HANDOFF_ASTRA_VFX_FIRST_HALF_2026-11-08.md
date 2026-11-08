# HANDOFF — Astra: VFX pass on the YSL first-half preview (v1.12)

**Date:** 8 Nov 2026 · **For:** ChatGPT Astra (Fendi pastes this in). **Fallback:** the same brief goes to Claudia (After Effects) tomorrow afternoon if Astra cannot execute it.
**Status of this pass:** NOTHING APPLIED. This document is a brief, not a report. Every treatment below is a RECOMMENDATION / HYPOTHESIS until Fendi sees it.

---

## 0. Paste-ready instruction for Astra

> You are given one video: the YSL first-half preview **v1.12** (1080x1920 portrait, 24 fps, 1735 frames, 72.30 s, audio attached). Keep every cut, every frame boundary and the audio exactly where they are. Apply the editorial VFX treatments listed in §4 and §5 inside the frame ranges given, nothing outside them. Do not regenerate, repaint, retime or AI-reinterpret the man's face or body: he must never be shown moving his mouth, and no face-altering pass of any kind. Deliver (a) the full re-export at the same spec, (b) a short before/after of each treated range, (c) a list of exactly which frames you changed and how. If you cannot do a treatment, say which one and why, do not substitute something else silently.

---

## 1. What Fendi said (verbatim, 8 Nov)

> "I like it so far but the b roll shots with the mastic jacket all look the same what vfx can we implement to liven it up and not make me look awkward because right now it's borderline cringy. Especially the last b roll shots where I'm kind of dancing that one needs to either be cut out or an effect needs to happen before I bust out into the dance move to not look crazy"

Two problems, two fixes:

| # | Problem | Where | Fix class |
|---|---------|-------|-----------|
| 1 | Eight b-roll slots in the mastic YSL jacket read as the same shot (he stands, camera drifts, cut). | c016, c017, c023, c025, c027, c028, c030, c043 | Give each slot a *different* rhythmic/graphic treatment so they stop reading as a carousel. |
| 2 | c046: he goes into an arms-out "dance" pose in the train car; reads as awkward. | c046 (preview 66.89–68.85 s) | Either cut the pose, or stage a *hit* before it so the pose reads as a deliberate accent on the beat. |

---

## 2. The source

| | |
|--|--|
| File | Grokbot preview **v1.12** (the file Fendi uploaded as `ysl_v1.12`) |
| Spec | 1080x1920, 24 fps, 1735 frames, 72.30 s, audio attached (VERIFIED by ffprobe on the copy Fendi uploaded) |
| Content | Slots **c008–c047** only. There is **NO intro**: c001–c007 are scrapped and must never come back. |
| Time map | **preview seconds = song seconds − 13.80** (the picture starts at c008 = song 13.80 s). Frame = round(preview s × 24). |
| Audio | Untouched. The audio track in the deliverable must be bit-identical to the source. |

### Where the file lives (filed 8 Nov, $0)

The preview is **not** in the repo (the repo is public and never carries footage of him or the song). It is in AVT, project YSL (`764a63d2-93cd-44f3-905f-292f14ab2f51`), bucket `project-exports`:

| Copy | project_assets id | Path under the owner prefix `3ca10935-8c3d-4479-9a0c-8bfe8050840c/764a63d2-…/previews/` | Size | sha256 (first 16) |
|------|-------------------|------|------|------|
| **Full-res 1080x1920** (render the deliverables from this one) | `4ef3c805-cceb-466b-ac76-4a71a92f6252` | `ysl_v1.12_grokbot_c008-c047_1080x1920.mp4` | 24,262,586 B | `696676a1ce56509a` |
| **Proxy 720x1280** (for ingest where 24 MB is too large) | `ad709a00-74c5-46df-8976-8a1f260cbd59` | `ysl_v1.12_grokbot_c008-c047_proxy_720x1280.mp4` | 13,542,395 B | `4b918b338cbf8f91` |

Both copies have **exactly 1735 frames at 24 fps and byte-identical audio** (audio md5 `4227cfbc3fd73c05f0e8944827edb349` on both, VERIFIED with ffmpeg), so every frame number in §3–§5 applies to either file. Plan on the proxy if you must; **render the final from the full-res copy.**

How to get a copy out of AVT: the owner downloads it from the app, or an agent with the AVT MCP calls `avt_signed_url` with bucket `project-exports` and the path above (a time-limited link; never paste it into a chat or a document).

Source clips for every slot exist in AVT (asset ids in `HANDOFF_GROKBOT_FIRST_HALF_v2_2026-11-07.md`) but Astra does **not** need them: every treatment below works on the preview itself. Do not ask Fendi to re-export clips.

---

## 3. Timecodes (preview = the file you have)

| Slot | Song (s) | **Preview (s)** | **Frames (0-based)** | What's on screen |
|------|----------|-----------------|----------------------|------------------|
| c008 | 13.80–15.28 | 0.00–1.48 | 0–35 | opening shot, mouth shut |
| c009 | 15.28–16.75 | 1.48–2.95 | 36–70 | PERFORMANCE: his real take, rapping at the wall. **Do not touch.** |
| **c016** | 28.06–29.54 | **14.26–15.74** | **342–377** | mastic: wet-floor sign → him by the lockers |
| **c017** | 29.54–31.51 | **15.74–17.71** | **378–424** | mastic: hallway → him leaning on the lockers |
| **c023** | 40.85–42.33 | **27.05–28.53** | **649–684** | mastic: carousel → him at the carousel |
| **c025** | 43.80–45.28 | **30.00–31.48** | **720–755** | mastic: lone suitcase → him on the chrome rail |
| **c027** | 46.75–48.23 | **32.95–34.43** | **791–825** | mastic: ARRIVALS sign → him under the board |
| **c028** | 48.23–50.19 | **34.43–36.39** | **826–872** | mastic: fox at the window → him in profile turning to camera |
| **c030** | 52.16–54.13 | **38.36–40.33** | **921–967** | mastic: Lower Wacker → him calm at the pillar |
| c041 | 72.33–73.80 | 58.53–60.00 | 1405–1439 | PERFORMANCE: his real take, bucket hat. **Do not touch.** |
| **c043** | 75.28–76.75 | **61.48–62.95** | **1476–1510** | mastic: the corner → him at the station entrance |
| c044 | 76.75–78.72 | 62.95–64.92 | 1511–1557 | runway on the platform, no him |
| c045 | 78.72–80.69 | 64.92–66.89 | 1558–1604 | walrus → open door → him standing calm inside the train car |
| **c046** | 80.69–82.65 | **66.89–68.85** | **1605–1651** | **the "dance": arms-out pose in the train car**, then phone inserts, then him calm |
| c047 | 82.65–86.10 | 68.85–72.30 | 1652–1734 | polar bear outside the liquor store, no him |

OBSERVED on the preview (6 fps strip, 66.0–69.5 s): the arms-out pose is **already at full extension on the first frame of c046 (66.9 s)** and holds to about 67.9 s; 68.0–68.6 s are dark phone-hands inserts; 68.67 s him calm; 68.85 s the bear. The "wind-up" Fendi feels is the **hard cut** from him standing calm (end of c045) straight into the fully extended pose. So the fix is at the cut point 66.89 s / frame 1605, not inside the pose.

The scene-change detector put cut points at preview 66.92, 68.54, 68.58, 68.62, 68.88 s, which matches the above.

---

## 4. c046 — pick one (deliver both A and B so Fendi can choose)

**A. Cut it.** Remove frames 1605–~1630 (the pose, ~1.05 s). Fill by extending c045 forward with a slow push-in on his calm frame (speed-ramp or 2x frame-blend of its last 12 frames) and/or bringing the bear (c047) in early. The phone inserts and the calm frame at 68.0–68.85 can stay. Slot boundaries elsewhere do not move; total length stays 1735 frames.

**B. Stage the hit so the pose is intentional.** At frame 1604/1605:
1. freeze the last calm frame of c045 for 6–8 frames (0.25–0.33 s) on the beat,
2. 2-frame white (or hard-contrast) flash on the downbeat,
3. step-print / stutter the first 12 frames of the pose (hold every 3rd frame) so the arms "snap" into position instead of being discovered mid-move,
4. optional: 4–6 frame datamosh or RGB-split smear on the snap, then clean for the hold.
The pose then plays as a punctuation mark, not a dance. No frame of his face is regenerated; these are time and overlay effects only.

**C (not recommended, included for completeness): leave it.** Fendi has said it needs to change.

Audio is untouched in all options; the beat grid comes from the track itself (detect tempo from the audio, cut on downbeats; do not guess BPM).

---

## 5. The eight mastic slots — one distinct treatment each

The rule: no two adjacent mastic slots get the same treatment, and nothing touches his face/mouth. Rhythmic cuts and overlays only.

| Slot | Frames | Treatment (RECOMMENDATION) |
|------|--------|----------------------------|
| c016 | 342–377 | **Step-print** the reveal: hold every 2nd frame for the first 12 frames after the sign, then clean. Light leak top-right on the cut in. |
| c017 | 378–424 | **Whip-out / push-in pair:** 4-frame fast push-in on the downbeat, snap back. Subtle 1-frame flash on the push. |
| c023 | 649–684 | **Mirror / stack panel:** split the frame into 2 vertical panels with the carousel mirrored, him centred; resolve to full frame on the next beat. |
| c025 | 720–755 | **Freeze + stutter:** freeze at the moment he settles on the rail (8 frames), then 3-frame stutter forward. Film-grain boost +20 % on the freeze only. |
| c027 | 791–825 | **VHS / scanline pass** for the whole slot (tracking bar, slight chroma bleed). Different texture = breaks the sameness. (The ARRIVALS sign is misspelled on the plate; Fendi: "if that can't be fixed it's not a big deal". A VHS blur over the board is acceptable, re-rendering it is not.) |
| c028 | 826–872 | **Strobe on the turn:** he turns to camera; strobe 2-on/2-off for 8 frames during the turn, then clean. Hard contrast grade for the strobe frames only. |
| c030 | 921–967 | **Slow datamosh / block smear** on the Lower Wacker lights for the first 10 frames, resolving cleanly on him. Keep him clean. |
| c043 | 1476–1510 | **Flash cut + hold:** 2-frame white flash on the cut in, then a 6-frame hold on him, then normal. Light leak bottom-left. |

If a treatment cannot be done, skip that slot and say so; do not reuse a neighbour's treatment on it.

---

## 6. Hard rules (non-negotiable)

1. **Never show him moving his mouth.** No generated lip-sync, no face-altering pass, no AI regeneration of him. Time effects (freeze, stutter, step-print, speed-ramp) and overlays (flash, leak, VHS, strobe, split, datamosh) only.
2. **c009 and c041 are his real performance takes.** Do not touch a frame of them.
3. **No intro.** Nothing before c008. If anything from "the men running out the store" appears, it is wrong.
4. **Slot boundaries stay.** Every slot in §3 keeps its frame range. Total stays 1735 frames / 72.30 s. (Exception: §4 option A, which is contained inside c045–c046.)
5. **Audio untouched.** Same track, same offset. The picture is cut to the song, not the song to the picture.
6. **Nothing outside the listed frames changes.** Spot checks will diff untreated frames against the source.
7. **No replacing any FINAL.** Every slot's content is approved; this pass is treatment, not re-shoot.

---

## 7. Deliverables and how they will be checked

| Deliverable | Check (do this before handing back) |
|-------------|-------------------------------------|
| `ysl_v1.12_vfx_A.mp4` (c046 cut) and `ysl_v1.12_vfx_B.mp4` (c046 hit) | 1080x1920, 24 fps, **1735 frames, 72.30 s**. `ffprobe -count_frames` must say 1735. Audio stream md5 identical to the source (`ffmpeg -i X -map 0:a -f md5 -`). |
| Per-slot before/after strips for the 9 treated ranges | One image each, 6 fps, timecode burned in. |
| Change log | Table: slot, frames changed, treatment, parameters. Frames outside §3's bold rows and §4 must be absent from it. |
| Anything skipped | Named, with the reason. |

An expected-value check that catches a half-done job: **frame 1605 in version B must not be the same pixels as frame 1605 in the source** (the hit changes it); frame 1000 (inside c031, untreated) **must be identical** in both versions and the source.

---

## 8. What is and is not done

| | State |
|--|--|
| Preview v1.12 reviewed, timecodes derived, diagnosis | DONE (this doc) |
| Any VFX applied | **NOT DONE.** Not by Claude, not by Grokbot. |
| Fendi's pick between A and B | NOT DONE. Deliver both. |
| Second half of the song (c048 →) | Separate round, not part of this brief. |

Mark nothing in this document as verified. Verification is Fendi watching the re-export.

## 9. If Astra cannot do it

Hand this same file to Claudia tomorrow afternoon. The After Effects version of every treatment is standard (Time Remap / Posterize Time for step-print and stutter, Freeze Frame, CC Light Sweep or a leak plate for leaks, Mirror + split for panels, a VHS preset or Noise HLS + Venetian Blinds for scanlines, Datamosh via a frame-displacement plug-in or a 3-frame pixel-sort). Same frame ranges, same rules, same deliverables.
