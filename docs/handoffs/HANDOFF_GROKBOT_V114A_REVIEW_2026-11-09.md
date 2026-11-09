# REVIEW — Grokbot v1.14 A (first half VFX pass), 9 Nov 2026

**From:** Claude (this repo's AVT session) · **For:** Fendi (decisions) and the three Grokbot agents (the next push)
**Input:** `ysl_v1.14_A_preview_phone` as Fendi uploaded it on 9 Nov. Filed in AVT next to v1.12 (project-exports `…/previews/ysl_v1.14_A_grokbot_c008-c047_1080x1920.mp4`).
**Brief it answers:** `HANDOFF_GROKBOT_VFX_FIRST_HALF_2026-11-09.md`, plus Fendi's own notes to Grokbot that night (which take precedence where they overlap).

Every claim below is labelled. VERIFIED = measured on the file. OBSERVED = seen on a frame strip, not measured.

---

## 1. The mechanical checks (VERIFIED)

| Check | Expected | v1.14 A | Result |
|---|---|---|---|
| Frames | 1735 | 1735 | PASS |
| Length | 72.30 s | 72.29 s | PASS |
| Size | 1080x1920, 24 fps | 1080x1920, 24 fps | PASS |
| Audio bytes identical to v1.12 | md5 `4227cfbc…` | md5 `a91b6b95…` | re-encoded, NOT byte-identical |
| Audio alignment to the album master | offset 13.79 s at every window | 13.792 s at 1, 10, 20, 30, 40, 50, 60, 68 s; corr 0.986–0.997 | PASS (same song, same sync; only the encode differs) |
| Untouched frames vs v1.12 | identical | median PSNR 41.4 dB, min 32.0 | re-encode noise only; nothing moved |
| Frames changed (PSNR < 32 dB vs v1.12) | only the briefed slots | **465 frames in 20 ranges**, several outside the brief | see §2 |

Per-frame PSNR against v1.12 is the change log; Grokbot's own change log was not delivered with the file.

## 2. Change log derived from the pixels (VERIFIED ranges, OBSERVED content)

| Frames | File (s) | Slot | What changed (OBSERVED) | In the brief? |
|---|---|---|---|---|
| 119–140, 147–166 | 4.96–6.96 | c011/c012 | sewing machine dropped; sheep earlier; **new shot of him standing in the sheep field** (6.12–6.92) | No. Not in v1.12. Fendi has never judged this clip. Mouth at rest (OBSERVED). |
| 217–275 | 9.04–11.50 | c013 | "putting you back into the car scene": man with the camera, close (9.33–10.25), then him in the back seat (10.33–11.25) | Fendi's note. **RED FLAG, see §3.** |
| 326–334 (every other frame) | 13.58–13.96 | c015 tail | single-frame flicker before c016 | not asked; harmless at thumbnail size |
| 342–377 | 14.26–15.74 | **c016** | **nothing changed** | Brief asked step-print + light leak. NOT DONE. |
| 384–387 | 16.00–16.17 | c017 | 1-frame white flash on the cut in, 3 frames after | Brief asked whip push-in + flash. Flash only. PARTIAL. |
| 644–666 | 26.83–27.79 | c023 | mirror / stacked panels on the carousel and on him | DONE as briefed. |
| 753–754 | 31.38–31.46 | c025 | 2 frames | Brief asked freeze + stutter + grain. Not visible. NOT DONE. |
| 786–797 | 32.75–33.25 | c027 | ARRIVALS board skewed / tracking wobble for 12 frames | Brief asked VHS over the whole slot. PARTIAL. |
| 834–944 | 34.75–39.38 | c028, c029, c030 | **block effect** (picture-in-picture rectangles) across the fox, the window shots and Lower Wacker | Fendi's note ("stretch the block effect across the airport window shots"). Replaces the brief's strobe (c028) and datamosh (c030). |
| 1240–1299 | 51.67–54.17 | c037/c038 | penguin on the platform replaced by: his face close → him + penguin split → garment close-up (stripe/logo) → split → him close | Fendi's note ("garment close-ups and split screens in place of the penguin run"). Mouth at rest (OBSERVED). |
| 1310–1363 | 54.58–56.83 | **c039** | the FINAL "PERFECT!" platform shot becomes a two-panel split with his close-up on the left | Fendi's note, same item. **This alters a FINAL**; Fendi decides whether that is what he meant. Mouth at rest (OBSERVED). |
| 1370–1398 | 57.08–58.29 | **c040** | him close in the hallway → split with the platform → garment close-up → penguin | Fendi's note again. **The dice game is NOT here** (PR #469 landed after this build started). |
| 1405–1439 | 58.53–60.00 | c041 | unchanged | correct |
| 1480–1515 | 61.67–63.17 | c043 (+5 frames of c044) | 2-frame white flash on the cut in, then a bottom strip of another plate under him, running 5 frames into the runway | Brief asked flash + hold + light leak. Flash DONE; the strip is a different idea and it spills into c044. |
| 1606–1632 | 66.92–68.04 | **c046** | **the arms-out pose is gone**; he stands calm in the car (c045's handles), then the phone inserts, him calm, the bear | DONE (option A). Clean cut, mouth at rest (OBSERVED). |
| everything else | | c008–c010, c014, c018–c022, c024, c026, c031–c036, c042, c044 (bar 5 f), c045, c047 | unchanged | correct |

Performance takes c009 and c041: unchanged (VERIFIED). No intro (VERIFIED, frame 0 is c008).

## 3. RED FLAG: the car scene (file 9.33–10.25 s, song 23.13–24.05 s)

The man holding the camera is talking: open, moving mouth on frames at 9.41, 9.58, 9.66, 9.83 s (OBSERVED on a 12 fps face strip). The c013 board note says the face at 1.5–2.3 s of that clip "is the cameraman", not him, and the 5 Nov slot was chosen to keep him out. He is dressed and bearded like Fendi and reads as Fendi at phone size. `docs/SHOT_RULES.md`: no generated version of him moving his mouth. **Fendi decides**: if that man reads as him, Grokbot moves the c013 window back to the 5 Nov one (mouth at rest) or cuts the close and keeps only the back-seat shot (10.33–11.25, mouth at rest).

## 4. What Fendi has to decide (nothing else moves until he does)

1. **Car scene** (§3): keep, or fall back to the mouth-at-rest window.
2. **The sheep-field shot of him** (6.12–6.92): a clip he has never judged, placed by Grokbot. Keep or drop.
3. **c039 as a split**: the FINAL he called PERFECT now has his close-up over it. Was that the intent of "split screens in place of the penguin run", or should the split stay on c037/c038/c040 only?
4. **c046 option A** (pose cut): accept, or wait for option B (the staged hit) before choosing.
5. **The dice game**: still to go into c040 per PR #469. That means c040's current garment/split treatment moves or goes.

## 5. For Grokbot's next push (v1.15), after Fendi answers §4

- c040 ← `6f4edd50` source frames 0–35 (the dice game), per `HANDOFF_GROKBOT_VFX_FIRST_HALF_2026-11-09.md` "put the dice game back".
- c016: the step-print + light leak was not applied. Apply it or say why not.
- c025: the freeze + stutter was not applied. Apply it or say why not.
- c027: the VHS pass covers 12 frames of the board only; the brief asked for the whole slot.
- c017: the push-in pair is missing; the flash alone is fine if the Director prefers it, say so.
- c043: pull the bottom strip back so nothing spills into c044 (frames 1511–1515 must match v1.12).
- Deliver the change log with the file (slot, frames, treatment). The PSNR table above is what I had to build in its place.
- Deliver B. Fendi was promised A and B.

## 6. Status

| | State |
|--|--|
| v1.14 A checked mechanically | DONE, PASS (frames, length, sync) |
| v1.14 A judged by Fendi | NOT DONE |
| v1.14 B | NOT DELIVERED |
| Dice game in c040 | NOT DONE |
| Spend this review | $0 |

Nothing in this document is approval. Fendi's words on each item in §4 are the approval.
