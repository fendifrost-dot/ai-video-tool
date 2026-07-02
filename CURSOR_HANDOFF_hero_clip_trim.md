# Cursor Handoff — Produce a ≤45 MB 4K Hero Clip (unblock the sharp still WITHOUT a backend upgrade)

**Date:** 2026-06-29
**From:** Fendi + Claude
**To:** Cursor — produce one trimmed clip on Fendi's Mac. No AVT code changes required for this task.
**Division of labor:** Cursor produces the clip (local ffmpeg). Claude then owns the AVT side end-to-end: upload → scrub → capture 4K hero frame → composite the sharp, identity-locked face.

## 0. Why this task exists (the blocker, confirmed)
- The AVT Cloud backend is on the **Pico (Free) Supabase tier**, which **hard-caps the global Storage upload size at 50 MB**. Confirmed by Lovable; not raisable on Free.
- Per-bucket `file_size_limit` on `project-references` / `project-clips` is already 4 GB, and resumable TUS ingest is deployed — but those are necessary-but-not-sufficient: the 50 MB global cap overrides them on every upload path (including TUS), so the full 1.67 GB master (`IMG_5508.mov`) cannot be ingested without a paid backend upgrade.
- BUT the sharp hero still does not need the full master. `captureFrame.ts` grabs the hero frame at the video's native resolution — so a short 4K clip under 50 MB yields a full-4K hero frame through the existing scrub-and-capture UI, no upgrade and no code change.

## 1. Objective
From the 4K master, produce ONE trimmed clip that is genuinely 4K (native resolution preserved) and ≤ 45 MB, centered on the hero pose. HARD REQUIREMENT: DO NOT downscale resolution — control size via duration + CRF + dropping audio only.

## 2. Source file
/Users/gocrazyglobal/Library/Mobile Documents/com~apple~CloudDocs/FENDI FILES/VIDEO/MODEST Member Only shots/IMG_5508.mov
⚠️ iCloud cloud-only placeholder possible. If ffmpeg errors ("Resource deadlock avoided"), force download first: `brctl download "<path>"` (or open in Finder/QuickTime), wait for full download, then trim.

## 3. Find the hero moment
Look: Fendi in his room, grey cap, thin wire-frame glasses, 3/4 turned to his right, head tilted slightly up, cream/white "MODEST" varsity jacket. The old proxy captured it ~2.15s into hero_src_clip.mp4, but the master's timestamp differs. Dump thumbnails to locate: `ffmpeg -i IMG_5508.mov -vf fps=1 -q:v 3 /tmp/thumbs/frame_%04d.jpg` — pick timestamp T. If unsure, ask Fendi.

## 4. Produce the clip (≤45 MB, keep 4K)
`ffmpeg -ss <T-4> -i IMG_5508.mov -t 10 -c:v libx265 -crf 24 -preset medium -tag:v hvc1 -an -movflags +faststart hero_clip_4k.mov`
Tune to ≤45 MB by raising -crf (24→26→28) and/or lowering -t. H.264 fallback if HEVC decode issues: `ffmpeg -ss <T-4> -i IMG_5508.mov -t 8 -c:v libx264 -crf 26 -pix_fmt yuv420p -an -movflags +faststart hero_clip_4k.mp4`

## 5. Verify (all three)
- Size ≤45 MB: `ls -lh hero_clip_4k.mov`
- Native 4K dims (NOT downscaled): `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 hero_clip_4k.mov`
- Hero pose in-window: `ffmpeg -ss 4 -i hero_clip_4k.mov -frames:v 1 /tmp/hero_check.jpg`

## 6. Hand off + next
Drop the verified clip in MODEST or upload it into the AVT project as a source/reference video (lands in project-clips/project-references; under 50 MB so it ingests on Pico). Tell Claude it's ready + the approx hero timestamp. Claude then: Hero Frame Studio → scrub → capture at native 4K → Grok garment-truth + identity + deterministic full-face/eyewear composite → deliver the sharp identical still for sign-off. No AVT code changes needed.

## 7. Do-not
- Do NOT downscale resolution to hit size (CRF/duration/audio only).
- Do NOT re-encode the whole 1.67 GB master — just the short trim.
- Do NOT upload the full master (413s on the 50 MB Pico cap).
- No AVT/Supabase code, migrations, or deploys for this task.

## 8. Scope note
Unblocks the STILL only (free). Full-length sharp MOTION over the real master still needs the paid backend upgrade (Pico → Pro-tier, billed separately from workspace Pro, Settings → Cloud & AI balance); once upgraded, Claude sets the global limit ≥2 GB and re-ingests the real 4K. Not part of this task.
