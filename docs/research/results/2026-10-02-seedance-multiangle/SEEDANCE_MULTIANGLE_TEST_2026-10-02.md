# Seedance 2.5 reference-to-video — one performance take, new angles, new environments

Fendi, 2026-10-02: "Seedance has a function where you can take one clip and create multiple angles and depth so this can help with blending performance shots with new environments — we need to test that with the new test." Two paid runs, both from the same 4 s trim of the real S11 take (closet, camo shirt, bars 24–46), through Control Center's `video-providers-higgsfield-model` in the new `reference_to_video` mode (`seedance-2.5-reference`, `/bytedance/seedance-2.5/reference-to-video`), 720p, 9:16. Evidence beside this file; clips in `project-clips/…/seedance/` (`T1_bentley_multiangle.mp4`, `T2_angle_only.mp4`, `SEEDANCE_multiangle_sidebyside.mp4`).

## The two runs

| | T1 — new angle **and** new environment | T2 — new angle, same room |
|---|---|---|
| inputs | `@Video1` = S11 4 s · `@Image1` = a frame of the Bentley street plate (`P_bentley_k`) | `@Video1` = S11 4 s, no image |
| asked for | low three-quarter angle, slow push-in, him beside the car under the streetlight; keep face, wardrobe, every lip movement | tighter right-side angle, chest-up, 50 mm, slow drift; same room, **clear-lens glasses**, same mouth movements word for word |
| duration | 5 s out of a 4 s source | 4 s = source |
| judge (gpt-6-astra) | **PASS 0.06** — "reads as photographed nighttime performance footage"; wardrobe construction, wet car, headlight bloom, stable geometry through the push-in | **PASS 0.06** — "ordinary photographed indoor footage", no tell |
| tier 1 stats | REVIEW (noise_hf, warp_err) | REJECT (ai_smooth, drift_1s, face_jitter — the tight handheld face; the statistics disagree with the judge, as they did on the real reels) |
| look axis | 2.22 OFF_BAR (sat −4.6 z: the bar reels are far more saturated) | 3.71 OFF_BAR (closet lighting — same as the real closet takes, 5.5) |
| identity vs source (ArcFace) | **0.21** (REVIEW line is 0.40; the Genjutsu swap scored 0.18) | **0.09** — the same man |
| lip motion vs source, 30 fps | corr 0.56 at a stretched clock (retime ≈ 0.7: a 4 s performance spread over 5 s) | **corr 0.66 on the source clock** (retime 1.00, offset 0.00) |
| what changed that shouldn't | glasses rendered as **tinted** (night + headlights); face lit from below; mouth opens about 60 % as much as the source | nothing visible: cap, clear glasses, flag patch, shoulder patch, beard, the shoe shelf and hangers behind him |
| cost | ≈ $4.16 list (input seconds are billed too) + $0.08 judge | ≈ $3.70 list + $0.08 judge |

`T1_lips_src_vs_result.jpg` / `T2_lips_src_vs_result.jpg` put the source face next to the result face at matched times; `*_identity_lips.json` carry the numbers (`scripts/qa/reference_fidelity.py`, new: identity + lip-motion fit against a source, sampled at 30 fps — at 8 fps a rap line aliases and the fit says nothing).

## What this means for the build

1. **Seedance 2.5 is the multi-angle tool.** It takes a real take and gives back the same man, the same wardrobe, the same room (or a new one) from a camera we never had — and the realism judge cannot tell it from footage. Neither Genjutsu nor any image-to-video route does this; it is the missing piece between the eight real takes and the generated worlds.
2. **Ask for the source's duration.** 4 s → 4 s landed on the song clock (the lip motion correlates 0.66 with no retime). 4 s → 5 s came back stretched and would need a retime that the gate's `match_grade.py --retime` can fit but that costs lip accuracy. The runner sends `duration = round(source seconds)`.
3. **Lip-sync is close, not locked.** 0.66 is "the same performance", not frame-identical — fine for a cutaway of one bar, a profile, a low angle, him turning away, and for the walk-in/walk-out beats around a line; not yet for a full line of on-mic close-up, which stays on the real take (or the living composite). The test for any new angle before it is cut on a sung line: `reference_fidelity.py` corr ≥ 0.6 on the source clock and identity ≤ 0.25.
4. **Say what must not change.** T2's prompt named the clear-lens glasses and the patches and got them; T1's did not name the glasses and got sunglasses. The runner's prompt template lists the wardrobe constants from the look's reference set and the phrase "clear-lens glasses, not tinted" whenever the look has glasses.
5. **The environment blend works at the bar.** T1 is the first clip of the day where the real performer sits inside a generated world with no matte, no plate grade and no edge — the model lit him for the street. The living-composite route (`composite_environment.py`, 10 min per take on this box) remains the frame-accurate option for on-mic lines; Seedance is the cheap, fast option (≈ 6 min at the provider, $4) for everything around them.
6. **Cost shape.** $0.4622 per second at 720p, source seconds included: trim the source to the bar being covered (4–5 s), never send the whole take. 1080p is $1.14/s and is for the final pick only.

## Next on this lane

A `seedance_ref` route in `run_world_batch.py` (shot kind `angle`: source cut id + angle sentence + optional world still → `reference_to_video`, duration = source, prompt from the template in 4, fidelity check in 3); hook-section master cuts so the lines Fendi's exemplars belong to have a source take; one 1080p render of the best angle once the section is locked.
