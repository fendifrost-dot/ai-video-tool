# HANDOFF — Grokbot: VFX pass on the first half (c008–c047), v1.12 → v1.13

**Date:** 9 Nov 2026 · **From:** Claude (this repo's AVT session) · **For:** the three Grokbot agents (Director, Claudia, AVT agent)
**Builds on** `HANDOFF_GROKBOT_FIRST_HALF_v2_2026-11-07.md` (the slot list, package layout and rules all still hold).
**Supersedes** `HANDOFF_ASTRA_VFX_FIRST_HALF_2026-11-08.md`: the same brief was given to Astra and Astra did not deliver. Nothing from that attempt exists; start from your own v1.12 timeline.
**Status of this pass:** NOTHING APPLIED by anyone. Every treatment below is a RECOMMENDATION until Fendi sees it.

---

## What Fendi said about v1.12 (verbatim, 8 Nov)

> "I like it so far but the b roll shots with the mastic jacket all look the same what vfx can we implement to liven it up and not make me look awkward because right now it's borderline cringy. Especially the last b roll shots where I'm kind of dancing that one needs to either be cut out or an effect needs to happen before I bust out into the dance move to not look crazy"

So v1.12 is **liked**: the slot order, the clips, the sync and the intro-less open all stay. This pass changes two things and nothing else:

| # | Problem | Slots | Fix class |
|---|---------|-------|-----------|
| 1 | The eight b-roll slots in the mastic YSL jacket read as one repeated shot (he stands, camera drifts, cut). | c016, c017, c023, c025, c027, c028, c030, c043 | One *different* rhythmic/graphic treatment per slot so they stop reading as a carousel. |
| 2 | c046: he goes into an arms-out "dance" pose in the train car and it reads as awkward. | c046 | Either cut the pose, or stage a *hit* on the cut so the pose reads as a deliberate accent on the beat. |

---

## You have an advantage Astra did not: the timeline and the handles

You built v1.12 from the board clips, so you can apply these **per slot, on the source clips, inside your own project**, instead of on a flattened render. Every montage render is 720x1280, 24 fps, 97 frames (4.04 s); the slot uses 35–47 of those frames and the rest are handles. That matters for c046 (below).

If you prefer to work on the flattened preview, it is filed in AVT (project-exports, `…/previews/`): full-res `ysl_v1.12_grokbot_c008-c047_1080x1920.mp4` (asset `4ef3c805`, 1735 frames) and a 720p proxy (asset `ad709a00`). Both have identical audio. Preview seconds = song seconds − 13.80.

---

## Timecodes

Song seconds are the truth. Preview seconds and preview frames are for checking against the v1.12 file. "Slot frame" is relative to the slot's first frame (frame 0 = the slot's first frame = source frame 0 for every slot here except c047).

| Slot | Song (s) | Preview (s) | Preview frames | Slot length | Source asset | What's on screen |
|------|----------|-------------|----------------|-------------|--------------|------------------|
| c009 | 15.28–16.75 | 1.48–2.95 | 36–70 | 35 | `b06b32f9` | PERFORMANCE, his real take. **Do not touch.** |
| **c016** | 28.06–29.54 | 14.26–15.74 | 342–377 | 36 | `19885553` | mastic: wet-floor sign → him by the lockers |
| **c017** | 29.54–31.51 | 15.74–17.71 | 378–424 | 47 | `24e0ecf1` | mastic: hallway → him leaning on the lockers |
| **c023** | 40.85–42.33 | 27.05–28.53 | 649–684 | 36 | `8705741e` | mastic: carousel → him at the carousel |
| **c025** | 43.80–45.28 | 30.00–31.48 | 720–755 | 36 | `f75de040` | mastic: lone suitcase → him on the chrome rail |
| **c027** | 46.75–48.23 | 32.95–34.43 | 791–825 | 35 | `f1716179` | mastic: ARRIVALS sign → him under the board |
| **c028** | 48.23–50.19 | 34.43–36.39 | 826–872 | 47 | `75cd814a` | mastic: fox at the window → him in profile turning to camera |
| **c030** | 52.16–54.13 | 38.36–40.33 | 921–967 | 47 | `a45df650` | mastic: Lower Wacker → him calm at the pillar |
| c041 | 72.33–73.80 | 58.53–60.00 | 1405–1439 | 35 | `6f4edd50` | PERFORMANCE, his real take. **Do not touch.** |
| **c043** | 75.28–76.75 | 61.48–62.95 | 1476–1510 | 35 | `583d61e1` | mastic: the corner → him at the station entrance |
| c044 | 76.75–78.72 | 62.95–64.92 | 1511–1557 | 47 | `97f95c9a` | runway on the platform, no him |
| c045 | 78.72–80.69 | 64.92–66.89 | 1558–1604 | 47 | `f17bee00` | walrus → open door → him standing calm inside the train |
| **c046** | 80.69–82.65 | 66.89–68.85 | 1605–1651 | 47 | `221961f4` | **the "dance"**: arms-out pose, then phone inserts, then him calm |
| c047 | 82.65–86.10 | 68.85–72.30 | 1652–1734 | 82 | `41d5c1da` | polar bear outside the liquor store, no him (src_in 0.614) |

**OBSERVED on v1.12 (6 fps strip, preview 66.0–69.5 s):** the arms-out pose is **already at full extension on c046 slot frame 0** and holds to about slot frame 24 (~1.0 s); slot frames ~26–41 are the dark phone-hands inserts; ~42–46 him calm; then the bear. The "wind-up" Fendi feels is the **hard cut** from him standing calm (last frame of c045) straight into the fully extended pose. The fix is at the c045→c046 cut, not inside the pose.

---

## c046: deliver both A and B so Fendi can choose

**A. Cut the pose.** Drop c046 slot frames 0–~25 (the pose). Fill the 47-frame slot from **c045's own handles**: c045's source has 50 unused frames after its slot (source frames 47–96). If he keeps standing calm in those frames (HYPOTHESIS, check the source), run c045 straight through the c046 slot as one continuous shot, and keep c046's phone inserts + calm tail (slot frames ~26–46) or drop them, Director's call. If c045's handles do not hold, speed-ramp / frame-blend c045's last 12 frames across the gap, or bring the bear (c047) in early. Slot boundaries elsewhere do not move; the cut stays 1735 frames from c008.

**B. Stage the hit so the pose is intentional.** At the c045→c046 cut (song 80.69 s):
1. freeze the last calm frame of c045 for 6–8 frames (0.25–0.33 s), landing on the beat,
2. 2-frame white (or hard-contrast) flash on the downbeat,
3. step-print the first 12 frames of the pose (hold every 3rd frame) so the arms **snap** into position instead of being discovered mid-move,
4. optional: 4–6 frames of datamosh / RGB-split smear on the snap, then clean for the hold.
The pose then plays as punctuation, not a dance. Time and overlay effects only; no frame of him is regenerated.

Cut on the track's downbeats (take the beat grid from the audio, do not guess BPM). Audio is untouched in both.

---

## The eight mastic slots: one distinct treatment each

Rule: no two adjacent mastic slots get the same treatment, and nothing touches his face or mouth. Rhythmic cuts and overlays only.

| Slot | Slot frames | Treatment (RECOMMENDATION) |
|------|-------------|----------------------------|
| c016 | 0–35 | **Step-print the reveal:** hold every 2nd frame for the first 12 frames after the sign, then clean. Light leak top-right on the cut in. |
| c017 | 0–46 | **Whip push-in pair:** 4-frame fast push-in on the downbeat, snap back. 1-frame flash on the push. |
| c023 | 0–35 | **Mirror / stack panel:** split into 2 vertical panels with the carousel mirrored, him centred; resolve to full frame on the next beat. |
| c025 | 0–35 | **Freeze + stutter:** freeze the frame where he settles on the rail (8 frames), then 3-frame stutter forward. Grain +20 % on the freeze only. |
| c027 | 0–34 | **VHS / scanline pass** over the whole slot (tracking bar, slight chroma bleed). The ARRIVALS sign is misspelled on the plate; Fendi: "if that can't be fixed it's not a big deal". Blur it under the VHS pass, do not re-render it. |
| c028 | 0–46 | **Strobe on the turn:** he turns to camera; strobe 2-on/2-off for 8 frames during the turn, then clean. Hard contrast on the strobe frames only. |
| c030 | 0–46 | **Datamosh / block smear** on the Lower Wacker lights for the first 10 frames, resolving clean on him. Keep him clean. |
| c043 | 0–34 | **Flash cut + hold:** 2-frame white flash on the cut in, 6-frame hold on him, then normal. Light leak bottom-left. |

Claudia's After Effects equivalents: Time Remap / Posterize Time (step-print, stutter), Freeze Frame, CC Light Sweep or a leak plate (leaks), Mirror + split (panels), a VHS preset or Noise HLS + Venetian Blinds (scanlines), a frame-displacement plug-in or 3-frame pixel sort (datamosh). If a treatment cannot be done, skip that slot and say so; do not reuse a neighbour's treatment on it.

---

## Rules that hold (non-negotiable)

1. **Never a generated him with his mouth moving** (`docs/SHOT_RULES.md`). No face-altering pass, no AI regeneration of him. Time effects and overlays only.
2. **c009 and c041 are his real performance takes.** Not a frame of them changes.
3. **No intro.** Nothing before c008. If "the men running out the store" appears, it is wrong.
4. **Slot boundaries stay.** Every slot keeps its song time. Total stays 1735 frames / 72.30 s from c008 (exception: c046 option A, contained inside c045–c046).
5. **Audio untouched.** Same track, same offset. Picture cuts to the song, never the song to the picture.
6. **Nothing outside the listed slots changes.** Untreated frames will be diffed against v1.12.
7. **No replacing any FINAL or ACCEPTED clip.** Every slot's content is approved; this pass is treatment, not re-shoot. Do not pull a different render of any slot from the board.

---

## Deliver and verify before you report

| Deliverable | Check |
|-------------|-------|
| `ysl_v1.13_A.mp4` (c046 cut) and `ysl_v1.13_B.mp4` (c046 hit) in `project-exports/…/canonical/` | 1080x1920, 24 fps, **1735 frames, 72.30 s** from c008. `ffprobe -count_frames` says 1735. Audio stream md5 identical to v1.12 (`ffmpeg -i X -map 0:a -f md5 -` → `4227cfbc3fd73c05f0e8944827edb349`). |
| Before/after strip for each of the 9 treated slots | One image each, 6 fps, timecode burned in. |
| Change log | Table: slot, frames changed, treatment, parameters. Nothing outside the bold slots and c045–c046 appears in it. |
| Skipped treatments | Named, with the reason. |

Expected values that catch a half-done job: in version B, **preview frame 1605 must differ** from v1.12's frame 1605 (the hit changes it). **Preview frame 1000** (inside c031, untreated) **must be pixel-identical** in A, B and v1.12.

---

## What is and is not done

| | State |
|--|--|
| v1.12 reviewed, timecodes derived, diagnosis | DONE (this doc, from the v1.12 file Fendi uploaded) |
| Any VFX applied | **NOT DONE**, by anyone. Astra's attempt produced nothing. |
| Fendi's pick between A and B | NOT DONE. Deliver both. |
| Second half (c048 →) | Separate round. c048–c066 and c085–c090/c092/c093 have no clip; c067–c084, c091, c094–c100 hold 15 Oct placeholders he has never judged. |

Mark nothing in this document as verified. Verification is Fendi watching A and B.

## Report back

The two files and their paths, the frame-count and audio-md5 results, the change log, and which slots you skipped. If c045's handles do not hold him calm for option A, say what you used instead.
