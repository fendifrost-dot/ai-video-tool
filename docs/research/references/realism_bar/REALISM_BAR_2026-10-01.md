# The realism and quality bar — Fendi's reference reels, measured

Opened 2026-10-01. Fendi paused acceptance of generated video ("we need a better judge on what gets accepted quality wise … clear references to judge from before we accept any videos") and sent five Instagram reels as the bar. This file records what they are, what they share in numbers, what our gate says about them, and what changed in the pipeline as a result. The clips themselves are not stored in the repo (they are other people's work); the 3×3 frame grids here are research evidence only.

## 1. The references

| # | Reel | Creator | What it is | Frame · fps |
|---|---|---|---|---|
| 1 | instagram.com/reel/Dd47UimqzzV — "crocodile teeth" | DAVIDCHI SINATRA, "made in @higgsfield.ai" | Fendi: "a perfect example of the video realism and quality I was speaking of." A '90s-film hip-hop video: grills in a side mirror, a fur coat, a rainbow-striped Caprice, a church, a fire escape, a hydrant flood with fish — every shot a staged scene, the artist absent from most | 1024×768 (4:3) · 24 |
| 2 | instagram.com/reel/DczSCsng4ID — "peace out" | same | same language: fisheye grills, a nun with a candle, a bathtub of cash on the street, a welder's torch in a kitchen | 1024×768 · 24 |
| 3 | instagram.com/reel/DdSgtoTqH89 — "hood archive" | same, "powered by @higgsfield.ai" | kids chasing a pickup at golden hour, a child in a gold crown and chains in a diner, a baptism in a paddling pool, a nun shooting dice | 1024×768 · 24 |
| 4 | instagram.com/reel/DdfTNH2KyVM — "money talk$" | same | cash in a microwave, a pastor with a bill counter, ironing money, a child asleep in a duffel of bills | 1024×768 · 24 |
| 5 | instagram.com/reel/DZzBfSyh8hY | Joshua Hoole (VFX artist), "Enhanced Seedance 2.0 Fast @higgsfield.ai" | a workflow breakdown with the prompts on screen — the written recipe (§3) | 540×960 (screen recording) |

Common ground across 1–4: 4:3 at 24 fps; film grain; low-key exposure that never clips white; rich, warm, slightly green-shifted colour (Kodak-negative feel); wide and fisheye lenses up close, long lenses for portraits; practical light sources in frame (candles, windows, torches, flares); period production design (cars, appliances, wardrobe) and extras in every shot; one idea per shot, cut fast; the performer appears in a minority of shots. The realism is a *cinematography* bar, not a provider bar.

## 2. Measured

`scripts/qa/look_fingerprint.py build` over reels 1–4 → `look_bank.json` (the bank the gate's look axis uses):

| metric | mean ± std | meaning |
|---|---|---|
| grain | 0.97 ± 0.18 | 3×3-median residual in flat regions — film grain, same band as our real masters (1.04) |
| sat | 110.8 ± 10.2 | mean HSV saturation — rich; our real closet cuts sit at 58 |
| luma | 55.6 ± 7.7 | mean grey — low key; our closet cuts sit at 158 |
| contrast (p95−p5) | 135 ± 16 | compressed tonal range — soft shoulder; closet cuts 224 |
| hi_clip | 0.000 | no pixel ever reaches 245 — highlights roll off, never clip |
| lo_crush | 0.09 ± 0.04 | 4–16 % of pixels at or below 10 — deep blacks are allowed |
| warm (Lab b−128) | +5.7 ± 1.8 | warm bias |
| tint (128−Lab a) | −5.9 ± 1.7 | slightly magenta/red, not green (the green cast in reel 5 is that prompt's "cookhouse") |
| aspect · fps | 1.33 · 24 | 4:3, cinema rate |

Our clips scored against the bank (`look_scores_our_clips.json`, look_distance = RMS z over the tonal metrics; ≤ 2.0 = ON_BAR):

| clip | look_distance | furthest from the bar |
|---|---|---|
| real S06 closet cut | 5.46 | luma, contrast, sat (bright, flat, desaturated phone footage) |
| Genjutsu S06 swap (conformed to the source) | 5.87 | same — it inherits the source's look |
| Kling 2.5 arctic room | 5.03 | luma, warm, tint (bright, cold) |
| Grok arctic room | 4.38 | warm, luma, tint |
| Kling 2.5 rims-street plate | 2.82 | sat, grain (noisy, desaturated) |
| DoP V2 lyric B-roll | 2.74 | contrast, sat, luma |
| DoP turbo v3 (test 7) | 2.43 | contrast, warm, sat |
| camera engine push (S11 on the stage plate) | 1.69 | luma, warm, tint |
| Runway gen4.5 rims-street plate | 1.26 | warm, sat, tint |
| **S11 real take over the Runway rims plate (living plate)** | **1.06** | sat, warm, tint |

The finding that matters: the clips furthest from the bar are the real closet takes and anything built on them; the closest are the living plate and the Runway night street. The bar is lighting, exposure and grade before it is any model.

## 3. The written recipe (reel 5, transcribed from the on-screen prompts)

System preamble used on every shot: *"You are a world-class Cinematographer and Master Gaffer. Your goal is to generate images that are indistinguishable from 35mm or 70mm motion picture film. Optics: always default to Arri Alexa 65 or Panavision Millennium DXL2 sensors. Use specific focal lengths (e.g. 35mm for environmental shots, 85mm for portraits). Lighting: implement Rembrandt lighting, negative fill, or motivated lighting. Ensure high dynamic range with soft highlight roll-off and deep, textured shadows. Color science: apply a custom Kodak Vision3 5219 film emulation. Prioritize perfect skin tones (natural texture, no plastic look) and a professional color grade with rich micro-contrast."*

Shot prompts are plain scene descriptions with references named by number ("the two guys from reference image 2"), closed with the look sentence: *"24fps film grain. Cinematic, gritty, found footage aesthetic. Handheld camera work — raw, unstable, documentary-style. Harsh overexposed sunlight. Long shadows. Mood is chaotic, rebellious, and surreal. No clean or polished shots. Always feels like it was captured in the moment."* A second scene: *"One shot, dynamic handheld camera tracks the intense close-quarters action. Moody cinematic lighting with steam and haze filling the room."*

Both are now data in `config/look_presets.json` (`film_bar_v1`, `handheld_doc_v1`) and `scripts/broll/run_broll_batch.py --look-preset` wraps every prompt with them. Seedance 2.0 is a Higgsfield-hosted model (not yet in CC's catalogue allowlist; adding it is one data line once its path and fields are read from the OpenAPI).

## 4. What our judge says about the references

`refs_judge.json`: gpt-6-astra judge on reels 1–4 → PASS 0.04, 0.07, 0.08, 0.10 ($0.20). The judge agrees with Fendi on realism — it also passed the Kling street plate he would reject, which is why the look axis exists: realism (judge) and look (bank distance) are reported side by side by `realism_gate.py --look-bank`, never folded together.

## 5. Levers, in order of effect

1. **Generate to the bar.** The preamble + shot suffix as data on every world/plate/B-roll prompt (done). The next world run uses `--look-preset film_bar_v1` and is scored on both axes.
2. **Light the performance to the bar.** The closet takes cannot be graded into low-key film — `scripts/edit/grade_to_bank.py` moves S06 from 5.9 to 3.1 and it reads as a dark flat take (`grade_to_bank_before_after.jpg`). The living-plate route (real take over a bar-look plate) lands at 1.06 because the plate carries the lighting; a plate-aware relight of the performer is the deterministic step that closes it. Shooting the next performance takes low-key, with practical sources, is the step that removes the problem.
3. **Finish to the bar.** `grade_to_bank.py` at strength 0.7 with the saturation cap as the last pass on any clip that is already lit right (Kling plate 2.8 → 1.1, living plate 1.06 → 0.56), plus 4:3 centre crop when the cut is 4:3.
4. **Frame.** 4:3 is a creative decision for Fendi; the bank records it, the gate reports `aspect_in_bank` without judging it.

## 6. Open

- The calibration page (claude.ai artifact `9kjDbkyon1Mn5awbEKL72m`) holds the five references in its bank and 26 clips to rate; Fendi's ratings tune the realism thresholds and decide whether look_distance ≤ 2.0 is the right line.
- Brief fidelity (did the clip render what the scene card said) is the third axis still unmeasured; it needs the scene card as input to the judge.
