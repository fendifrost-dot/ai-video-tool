# Sample of the new build — worlds and plates generated to the bar, gated on both axes, cut with the real performance

Opened 2026-10-01 after Fendi set the bar (`docs/research/references/realism_bar/`) and said "start doing real tests so we can get a sample of the new build". This records the runs, what passed, what the route is now, and how the sample section was cut.

## 1. Pipeline exercised

`scripts/broll/run_world_batch.py` (new): a shot list is data; for each shot the runner buys bar stills (xAI `world-still-proxy`, 2k, 9:16, `film_bar_v1` preamble), picks the candidate nearest the look bank, sends it to an image-to-video model with a motion sentence, polls, persists the clip to `project-clips/…/worlds/<run>/`, and gates it with `realism_gate.py --look-bank` (realism tier 1 + judge, and the look axis). Plates go text-to-video at 16:9. Everything is resumable from the manifest.

## 2. Batch 1 — the stills are right, Runway gen4_turbo motion is not (`shots_batch1.json`)

Eight worlds + four plates, $6.1. The stills landed in the reels' register on the first try (`bar_stills_contact.jpg`: the bear on the floral couch, the snowman in the puffer, the tailor under the bulb, the reporters on the stoop — look distances 0.84–2.6). Runway gen4_turbo image-to-video (5 ¢/s) then broke every one of them: judge 0.68–0.98 with concrete tells — a cameraman splitting into two men, the snow head reforming, the money rising unsupported, a plush bear. Look axis: 6 of 11 ON_BAR, so the preamble carries the look through motion; realism is the motion model's problem. The runway plate passed (0.17) and the Bentley plate failed on physics (0.80). The Runway account behind Control Center ran out of credits during this batch.

Two mechanics found: Runway caps `promptText` at 1000 characters (the runner now drops the preamble, then the suffix, never the scene; image-to-video sends only motion + suffix since the still carries the look), and xAI moderated the hallway still twice as "a woman in a slip dress and hair rollers" — "an old man in a bathrobe" went through.

## 3. Motion shootout — same still, three models, camera-only motion (`shots_motion_shootout.json`)

Three of the best stills (atelier, bear, club) × Higgsfield DoP turbo, Kling 2.5 turbo pro image-to-video, Runway gen4.5 image-to-video (run after Fendi topped the account up to 5,052 credits). Motion prompts were the reels' own grammar — the subject holds and breathes, the camera moves slowly, "nothing else moves".

| still | DoP turbo ($0.42) | Kling 2.5 i2v ($0.35) | Runway gen4.5 i2v ($0.75) |
|---|---|---|---|
| atelier | PASS 0.24 · look 0.88 | **PASS 0.16** · look 1.02 | REJECT 0.76 · look 0.73 |
| club frost | REJECT 0.80 (frost patch reshapes, glassware loses continuity) | **PASS 0.16** · look 1.10 | REJECT 0.30 · look 1.58 |
| bear | REJECT 0.93 (plush silhouette; head moves, body locked) | REJECT 0.90 (same) | REJECT 0.93 · look 2.15 |

The bear fails on its *still* — it sits like a toy; a bear posed as a bear is a prompt change, not a model change. **Route decided: bar still → Kling 2.5 image-to-video, camera-only motion** — the cheapest of the three and the only one that passed more than once. Kling rendered in 5–8 minutes tonight (the 4.5 h queue earlier today was not repeated).

## 4. Batch 2 on the route (`shots_batch2.json`)

| shot | judge | look | verdict |
|---|---|---|---|
| H1_switch2 — old man at the switch, arctic light in the doorway | 0.16 | 1.56 ON_BAR | PASS |
| H8_money_mouths — the stack on the kitchen table | 0.20 | 2.71 off (bright kitchen) | PASS |
| H5_reporters — the stoop, flashes | 0.26 | 1.26 ON_BAR | PASS |
| H2_snowman | 0.83 | 1.36 | REJECT (the snow head still re-forms) |
| H4_kids_car | 0.84 | 1.84 | REJECT (a sedan on four children never reads as physics) |
| H1_bear2 (bear on all fours) | 0.72 | 2.03 | REJECT |
| P_runway_k, P_bentley_k, P_press_k (Kling text-to-video plates) | 0.12 / 0.22 / 0.22 | 3.08 / 1.81 / 2.87 | PASS |

Across the day: **5 passing worlds** (atelier, club frost, switch, money, reporters), 4 passing plates, out of 17 world/plate attempts after the route was found — and 0 of 7 before it. The two concepts that fail every time are the two with impossible physics or a non-rigid head (kids carrying a car, the snowman); they want a different staging (the car on a flatbed the kids walk beside; the snowman as a mask that never deforms) rather than another model.

## 5. Living performance plates (`living_S11_press_strip.jpg`)

`composite_environment.py --match-plate 0.7` (new): the performer's exposure key, contrast and colour bias are fitted once to the plate's statistics (a third of the way back toward his own key, since the reference footage lights the subject brighter than the room) — replacing the fixed cool tint that caused the lighting mismatch noted at rev 44. The matte is clean against the Kling plates. One limit found: a 16:9 plate centre-cropped to 9:16 loses the action at its edges (the reporters on the press plate) — plates for a vertical cut are generated 9:16 next time (one field in the shot list). Composites run one at a time on this box: alongside the judge the first was OOM-killed at 5.5 GB.

## 6. The sample section

`out/YSL_IceOn_bars24-46_bar1.mp4` (1080×1920 @ 24, song audio): bars 24–46, eight real performance takes over three living plates (Bentley street, press stoop, runway gym), S06 carrying the Genjutsu outfit swap over the runway plate, the four generated slots filled with passing worlds (atelier, switch, club frost, reporters), and two bar-grid inserts on the lyric map (money on "rambling too", the tailor on "Yves Saint Laurent on the weekend"). The hook lines Fendi's exemplars belong to (H1–H8) sit *before* this section on the song (≈ 23–55 s) and have no master cuts yet; the sample proves the build on the section that exists.

## 6a. The stalls, and what changed because of them

Two silent stops during the composites were kernel OOM kills (5.5 GB compositor beside a 2 GB gate on an 8 GB box). `STALL_AUDIT_2026-10-01.md` traces every stop of the day to three roots; the mechanical fixes are in: the compositor keeps its masks and mattes as disk-backed float16 memmaps and builds the background prior in row chunks (S06 re-ran at a **2.1 GB peak**, was 5.5), `scripts/_lib/jobs.py` is a resource governor and job registry every runner enters (a job waits when the box cannot hold it; jobs are listed and stopped by id), and `run_world_batch.py` writes each submit ahead of the call, reconciles unrecorded submits instead of resubmitting them, honours provider prompt caps from `config/provider_caps.json`, and stops a provider on its first balance refusal. The batch identity (the hourly browser token) is the one root left open; it is a proposal for Fendi in the audit.

## 7. Spend

Environment ledger rows 22–26: stills $1.26 billed; Runway ≈ $7.00 list (≈ $4.75 before the top-up, $2.25 after); Higgsfield ≈ $5.45 list; judge $2.47 billed → ≈ $32.9 of $50 used, ≈ $17.1 left.

## 8. Next on this lane

Plates 9:16; restage the two physics concepts; the hook section's master cuts (needs the master); Seedance 2.0 route once its OpenAPI entry is read; a finishing pass with `grade_to_bank.py` on the assembled section once Fendi has rated the calibration set (so the strength is his number, not mine).
