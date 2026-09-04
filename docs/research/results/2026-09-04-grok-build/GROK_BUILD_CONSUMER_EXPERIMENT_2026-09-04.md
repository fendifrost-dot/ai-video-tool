# Grok Build experiment — consumer Imagine path vs the AVT product lane

**Date:** 2026-09-04 · **Operator:** Claude (Cowork) at Fendi's direction · **Surface:** grok.com → Build Mode (Beta), Fendi's SuperGrok account · **Spend:** consumer plan credits; **xAI API spend unchanged at $12.80 / $20** · **Not part of the frozen product lane** — no AVT code, prompt, refs or gates were touched.

Evidence labels: **[V]** verified · **[O]** observed · **[G]** Grok's own statement · **[H]** hypothesis · **[R]** recommendation

## Setup [V]

Uploaded to Grok Build in one message: the benchmark source clip `IMG_5633_t75p0_d4p0_1080x1920_h264.mp4` (asset `76fe7438`, 4.02 s), the flat product ref (`2a14a72b…jpg`) and the on-model ref (`onmodel_img5541…png`). Prompt: put this exact jacket on him in the clip (full construction spec: zipped, collar up, band + wordmark wearer's-left, sleeve panels, mastic zip tape / pockets / cuffs, shirt + tie at throat), keep him completely unchanged, output the edited video, then explain the mechanism; if it cannot edit video, say so.

Grok chat: **"Video Edit: Jacket on Self in Clip"** (Fendi's account) — final clip, hero still and contact sheet are downloadable there.

## What Grok Build did [V] (watched step by step; matches its own summary)

1. Opened an agent workspace ("Connected to computer"), probed the clip with ffmpeg, extracted frames, viewed them, picked a sharp still (arms crossed, looking at camera).
2. `imagine_reference_to_image` with three inputs: the source frame (identity / pose / room), the on-model ref, the flat ref. Two candidates.
3. Self-review: *"Wordmark is on the wrong chest and extra navy is bleeding onto the body."* → `imagine_image_to_image` geometry fix: wordmark moved to wearer's-left, torso below the band forced back to mastic. Locked a hero still.
4. `imagine_image_to_video` (1080p, 9:16, 6 s — "that model's shortest useful duration"), then a second `imagine_reference_to_video` pass; extracted review frames from both, compared, exported the better one. Four videos generated in total.
5. On request, built a labelled 2×3 contact sheet (0–5 s) and served the files from its sandbox.

**[G] Grok's own headline:** *"Cannot edit the clip as video-to-video. There is no V2V / per-frame wardrobe lock here, so your original pixels, timing, and audio are not what is in the file. Closest thing I can actually do: identity-locked still swap, then animate that still."*

## Score against the flat reference [V]

Hero still (`grok_build_hero_still_chest.jpg`, `grok_build_ref_vs_hero.jpg`):

| Item | Result |
|---|---|
| Mastic body, wide navy band terminating at the armholes | **Correct** |
| SAINT LAURENT wordmark — legible, house typeface, wearer's-left, ~½ band height | **Correct** (first pass had it on the wrong chest; fixed in pass 2) |
| Fully zipped, stand collar up | **Correct** (collar inner reads mastic rather than navy — minor) |
| Mastic self-colour zip tape + small gold pull | **Correct** |
| Mastic welt pockets, mastic cuffs | **Correct** (Grok: "soften slightly in motion") |
| Navy sleeve panel | Present, runs down the inside of the sleeve; appears to reach the cuff rather than stopping above it — minor |
| Shirt + tie only at the throat | **Correct** |
| **Identity** | Recognisably Fendi (face, beard, glasses, cap) — **but a regeneration, head turned to the side**, not the source frame's pixels or pose |
| **Performance / camera / audio** | **Not preserved.** Synthesized 6 s "talking beat", generator's own audio, not the 4.02 s take |

Contact sheet 0–5 s (`grok_build_contact_sheet_0-5s.jpg`): garment stays consistent across the clip; motion is a plausible talking-head with crossed arms, not his.

**[D] Verdict under the benchmark rule:** a cinematic recreation of the performer is a hard fail → **FAIL for the product lane.** Garment construction, however, is the closest to zero-deviation of anything produced in this project: every V2 generation defect (A collar, B zip, D wordmark, E both-sides, F pinstripe, I pockets, J cuffs) is right in one pass.

## Why this matters for Architecture C [H] [R]

- The consumer **Imagine `reference_to_image`** path (source frame + on-model + flat) preserved a recognisable identity *and* rendered construction correctly. The API **`/v1/videos/generations`** lane (B1/B2, 2026-08-30) rendered construction correctly but **replaced the person**. The edits lane (`/v1/videos/edits`, V1/V2) preserved the person but could not render construction. This is the first observation of both at once, on an image model.
- That is exactly the **hero-keyframe / anchor** piece of Architecture C (locked piece #1: "anchor identity is the sole blocker"). If the anchor can be produced this way, the deterministic layer + SAM-3 masks composite the garment back onto Fendi's **real** frames, and the "recreation" problem never arises.
- [R] Question for ChatGPT / Cursor before any spend: does xAI expose the Imagine image-edit-with-references model through the API (image generation / edit endpoint with multiple reference images)? If yes, a single gated call on the canonical still `2aa1a44c` with the two refs is the right next experiment for the anchor. If no, this stays a consumer-only observation.
- Grok's own iteration loop (generate → inspect → "wrong chest / navy bleed" → image-to-image fix) is the same defect list and the same fix order we arrived at by hand. Useful as an independent confirmation of the defect register, nothing more.

## Hard gates [V]

No paid xAI API call · V2 active, V3 inactive · no sleeve stage · no temporal · no repo code changes · no Lovable agent code work. Evidence in `docs/research/results/2026-09-04-grok-build/`.
