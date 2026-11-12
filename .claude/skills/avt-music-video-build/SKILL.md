---
name: avt-music-video-build
description: Build a montage music video in AVT from song to delivered cut, the way the YSL "Ice On" first half was built and judged (15 Oct – 9 Nov 2026). Use for any new video on Fendi's footage, any Grokbot handoff, any review of a delivered cut, and whenever an agent asks "how do we build the next video". Carries the lessons that cost us rolls, the shot-intent rules for performance shots in moving scenes, the Gemini-over-Grok still policy, the handoff format and the verification commands. Companion to avt-clothing-swap (the tool set and the face-preserving swap) and avt-capability-scan (what to look for in new tools).
---

# Building the next video in AVT

For Claude, Grokbot's three agents (Director, Claudia, AVT agent), Cursor, and anyone else who touches a shot.
Read it whole before the first paid call. Where this page and a recipe page disagree, the recipe page is older:
this page carries what we learned after it.

Companion pages: `.claude/skills/avt-clothing-swap/SKILL.md` (every `avt_*` tool, the paid functions, costs, the
face-preserving swap), `docs/SHOT_RULES.md` (locked), `docs/recipes/README.md` (which method when),
`docs/recipes/MONTAGE_MUSIC_VIDEO_WORKFLOW.md` (the song-to-board steps), `docs/STORYBOARD_INTENT.md` (what each
shot has to say before it is built), `docs/capability/GAPS.md` (what the tools cannot do yet and what we are looking for).

## 0. Rules that never bend

1. **His mouth on lyrics is his real footage.** A generated him never moves his mouth. No lip-sync, no face-altering
   pass. `docs/SHOT_RULES.md` 1–7 are checked on every shot with him before it is posted, and the post says so.
2. **His face is his.** A clothing swap on footage ends with the put-back (proof 0). Whole-frame redraws are intermediates.
3. **Lovable-managed backend only.** No `supabase` CLI, no dashboard, no service role. AVT MCP tools or the app.
4. **Money.** Dry-run first, say the cost, record every paid call in the project ledger in the same commit.
5. **Never print a signed URL, token or key.** Never commit media of him or the song (the repo is public).
6. **Fendi approves, by name, in his words.** An agent never marks a result approved. Once he accepts a clip, it becomes
   the shot's primary (`is_primary` true; the old primary is demoted, never deleted) with `approval_status: approved`
   and his words in the note.
7. **Label every claim** VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION. "Done" from an agent is not done.
8. **Post every output** to the chat as an inline file with its check sheet. A path or an asset id is not a post.

## 1. The pipeline, in order, and what changed after YSL

| Step | Do | Changed after YSL (9 Nov 2026) |
|---|---|---|
| 1. Song | analysis (BPM, beat map, sections), timed lyrics | unchanged |
| 2. Treatment | one location per section, one odd thing per location, director's pictures filed as `director_reference` | unchanged |
| 3. **Storyboard** | fast-cut grid on beats; then **every shot carries its intent** (`docs/STORYBOARD_INTENT.md`): lane, scenery, motion budget, who is in it, which beat of a 4 s render the slot shows | **NEW.** The storyboard decides what the tools are asked for; VFX later cannot fix sameness or a bad motion match |
| 4. Scenes and plates | one `variation_scenes` row per location; one plate per scene, empty where he stands; cast only in `scene_*` stills for cutaways | **Stills in Gemini, motion in Seedance / Genjutsu** (§4). No Grok |
| 5. Who is in each shot | performance = his real take; b-roll with him = the likeness ladder (§3b); b-roll without him | **NEW: real footage first; never a generated still as his face** |
| 6. Performance shots | real take, dressed by the face-preserving swap, placed in a scene that obeys the **motion budget** (§3) | **NEW motion rules** |
| 7. Montages | `montage-shot` per shot, 4 s renders, slot inside the render | **Name the beat** the slot shows (§5) |
| 8. Board | one primary per shot, Fendi's words on it | unchanged |
| 9. Handoff to the cutter (Grokbot) | the slot table of §5 | **Two clocks, beats, scrapped slots** (§5) |
| 10. Delivered cut | the verification of §6 before anyone judges it | **NEW: measured, not eyeballed** |
| 11. VFX pass | per-slot brief, A/B on anything with him, change log with the file | per `HANDOFF_GROKBOT_VFX_FIRST_HALF_2026-11-09.md` |
| 12. Acceptance | Fendi's words; file the cut in `project-exports/…/previews/` with sha256 and the review | unchanged |

## 2. What the YSL first half taught us (each lesson is now a rule)

1. **A scrapped slot is dead everywhere.** The intro (c001–c007) was cut on 23 Oct; two later handoffs listed it again and Grokbot put it back. Rule: when Fendi scraps a stretch, demote its primaries on the board the same hour, and every later slot table prints those rows as SCRAPPED with his words. Never list them as candidates.
2. **A 4 s render holds several beats; a slot holds one.** The approved c041 clip had four beats (dice game, him wide, penguin, him close); the 1.47 s slot showed the last one and the dice game Fendi loved never reached the screen. Rule: every slot row names the source window (`src_in`, frames) AND the beat it shows; a clip with more than one beat gets a row per beat so the Director can give the extra beats their own slot (c040 was free).
3. **Two clocks.** The song's clock and the file's clock differ by the cut-off intro (13.80 s on YSL). "1:12" meant two different things to Fendi and Grokbot for a day. Rule: every time in a handoff, review or message is written in both: `song 1:26.10 (file 1:12.30)`.
4. **Plates carry what is in them.** Rejected c044 rolls had the gambling crew, a girl who broke the runway, a puffer, two models: all inherited from the plate. Rule: inspect the plate first; one scene = one clean plate; the cast lives only in cutaways (`docs/SHOT_RULES.md` 4).
5. **Sameness is a storyboard problem.** Eight b-rolls with him in the same jacket, same staging ("him by the X, camera drifts") read as one shot. Rule: at storyboard time, vary lens, distance, side, action and what moves, across the shots in one outfit; do not rely on VFX to rescue it.
6. **Performance shots and moving scenery do not mix yet** (§3).
7. **No Grok on anything that ships: stills in Gemini, motion in Seedance or Genjutsu** (§4).
8. **A generated bystander who looks like him is him** to the viewer. The c013 "cameraman" talks; at phone size he reads as Fendi. Rule: `scripts/edit/mouth_scan.py` on every window with a face that could be his; a talking lookalike is a reject.
9. **Verify the delivered file, do not watch it.** Frame count, audio alignment to the master, per-frame PSNR against the previous version, a mouth check on every new stretch with him (§6). The cutter's claims ("1735 frames, audio untouched") are checked, not believed; v1.14 A's audio was re-encoded.
10. **The change log comes with the file.** When it does not, build it from the PSNR diff and say so.
11. **Handoffs are verification-first.** Expected values, a cheap command that distinguishes outcomes, what not to do, what to report; never "verified" (`docs/HANDOFF_TEMPLATE.md`).
12. **Parallel stagings beat re-rolling the same prompt.** c016 took six rolls because the wordmark mirrored; the winner came from a different staging (three-quarter), not from a seventh identical roll.
13. **Posting "for the record" is still posting.** A clip with something Fendi excluded (the gamblers) is never posted, even as context.
14. **Options, not fixes, on anything with him.** The c046 pose got an A (cut) and a B (staged hit); Fendi chose. A single "fix" on a shot with him is a decision taken from him.
15. **A policy that lives only in an open PR does not exist.** The Gemini decision of 9 Nov sat in an unmerged PR; the Hyenas agent started from `main` and made 19 Grok stills and 11 Grok clips ($4.57) before switching. Rule: a decision Fendi makes goes into `CLAUDE.md` on `main` the same day.
16. **The outfit is not the likeness.** A generated him in the right clothes with the wrong face is a stranger (Hyenas, 12 Nov). Rule: §3b; his face comes from his footage, never from a generated still.

## 3. Performance shots: scenery and motion budget (DECISION, Fendi 9 Nov 2026)

"We are extremely limited when combining performance shot with clothing swap in environments with movement. We saw
the issue mostly from the headlights and from the train going by. Going forward … performance shots need to be
super intentional with the scenery and limited motion."

What fails today (OBSERVED on c041/c045/c047 rounds, Oct–Nov): a passing train behind him, headlights sweeping across
him, anything that changes the light on his garment or occludes him while the swap and the matte run. The swap smears
the garment, the matte flickers at the seam, the put-back shows a ring.

Until `docs/capability/GAPS.md` G1 is closed, every performance shot obeys this budget:

| | Allowed | Not allowed |
|---|---|---|
| Camera | locked, or one slow move (push, drift) | handheld whip, rack moves through him |
| Light on him | constant for the whole take | sweeps, flashes, strobes, headlights, passing neon |
| Behind him | far, slow or static life (city at distance, snow, steam, a sign) | a train, a car, a crowd or anything that crosses behind his outline |
| In front of him | nothing | anything that occludes him |
| Where motion goes | the cutaways and b-roll around the performance shot | the performance frame |
| Plate | a moving plate that stays slow (`Animate the plate`, calm) | a busy plate |

Write it into the storyboard before the plate is made (`docs/STORYBOARD_INTENT.md`). A performance shot that needs a
busy scene is two shots: the busy cutaway, then him alone in a calm frame of the same place.

## 3b. His likeness in b-roll: the ladder (DECISION, Fendi 12 Nov 2026)

"I shot one performance shot but wanted to use my likeness, same outfit, face etc in generated b-roll shots. The
outfit looked pretty consistent but the person was clearly not me in the face."

What failed (VERIFIED on the Hyenas board, 12 Nov): Gemini stills of him from three frames of a phone take, his face
about 100 px wide in those frames. The outfit carried; the face did not, worst where the face is small in frame. A
video model fed such a still can only drift further from him.

Use the highest rung that exists for the shot:

| Rung | Method | Face | When |
|---|---|---|---|
| 1 | **His real footage**: the b-roll he shot, or a mouth-at-rest window of his take, used as the shot, or matted and placed in a calm moving plate (`scripts/edit/replace_him_in_clip.py`, SHOT_RULES 3–6) | his pixels | always first. Ask him for the b-roll section of the shoot before generating anything with him |
| 2 | **Recipe F** (`montage-shot`, `docs/recipes/BROLL_WITH_HIM_STILL_MOUTH.md`): `@Video1` = a 4 s mouth-at-rest window of his real footage in the same outfit, plus his face photographs from `character_features` | close, approved by him on YSL | when the shot needs a place or an action he did not film. The window must show his face at ≥ ~200 px wide; a full-body phone frame is not enough |
| 3 | Shot rewritten without his face: from behind, hands, the outfit in close-up, a cutaway | not shown | when neither rung 1 nor 2 exists |
| ✗ | A generated still of him (any model) animated or used as his face; text-to-video of him | a stranger | **never**. A generated still of him is a layout sketch only |

Before a shoot, ask for the footage rung 1 and 2 need: 30–60 s of him in the outfit, mouth closed, face to camera
and three-quarter, standing, walking, sitting, close enough that his face fills a fifth of the frame width, in the
light of the scenes. Ten minutes of phone footage saves every generated face.

Check every clip with him: `scripts/edit/face_check.py` against his face set, `scripts/edit/mouth_scan.py`. A face
that does not read as him at phone size is a reject, whatever the outfit does.

## 4. Models: Gemini for stills, Seedance and Genjutsu for motion, Grok for nothing that ships (DECISION, Fendi 9 and 12 Nov 2026)

"We need to demote grok image creator and replace with gemini for anything photo realism required" (9 Nov).
"It generated grok images and videos when we demoted grok for Gemini and kling" and "Gemini is preferred" (12 Nov, on the Hyenas build). His standing workflow, in his words the same day (about the workflow in general): "we generated shot images with Gemini and then animated them with genjitsu or seedance not Gemini or kling."

| Need | Route | How | Cost (estimate) |
|---|---|---|---|
| A plate, a scene still, a cutaway still, a reference he will see, anything that must read as a photograph | **Gemini** via `world-still-proxy` with `model: "gemini-nano-banana-2.1"` (`n: 1`, up to 14 references, needs a queued provider job; `dryRun: true` first) | the reference pictures are his own photographs and the director's pictures, under the owner's folder | ≈ $0.27 per still (conditional bound, unverified against a bill) |
| Animating a still (animals, cars, places, objects) or any generated clip | **Seedance** via `montage-shot` (b-roll montage, or the storyboard's Animate the plate from the approved Gemini still) | animate the approved Gemini still; never text-to-video for a clip that must match a plate; dry run first | $1.849 per 4 s b-roll |
| Clothing on his real footage | **Genjutsu** via `dress-clip`, then the face put-back (`.claude/skills/avt-clothing-swap/SKILL.md`) | | ~$0.68 per source second |
| Kling, Gemini video, others | **not a production route**: candidates in `docs/capability/GAPS.md`, used only after a benchmark passes and Fendi accepts it | | |
| A video clip with him | **§3b, the likeness ladder.** Never a model given only stills of him | | |
| A throwaway draft he will never see | Grok, labelled DRAFT in the notes | | $0.07 still, ~$0.28 clip |

The tool's defaults are still Grok (`world-still-proxy` `DEFAULT_MODEL`, the whole `grok-broll-proxy`). Until the code
guard in `docs/handoffs/HANDOFF_HYENAS_RESET_2026-11-12.md` lands, an agent names the Gemini model on every still
request and never calls `grok-broll-proxy`. If a Grok output is found on a project, mark it `approval_status: rejected`.

## 5. The handoff to the cutter (Grokbot or anyone)

The slot table, one row per slot, and one extra row per unused beat of a multi-beat clip:

```
| Slot | Song (s) | File (s) | Frames (file) | Asset | Path | src_in (s) | Beat shown | Status (Fendi's words) |
```

- Song and file clocks both, always. State the offset at the top (`file = song − 13.80 s` on YSL).
- `Status` is one of FINAL / ACCEPTED (his words quoted) / PICK (never judged) / SCRAPPED (his words quoted). Nothing else.
- A row per extra beat: `c041 beat 1 of 4: the dice game, frames 0–38, unused; candidate for c040`.
- The rules block: no mouth, no intro, no replacing a FINAL, slot boundaries fixed, audio untouched.
- The verification block: expected frame count, expected audio md5 or alignment offset, one frame that must change,
  one frame that must not.
- The deliverables block: files, a change log (slot, frames, treatment), before/after strips, skipped items named.

## 6. Verifying a delivered cut (run before anyone judges it, $0)

```
ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames,width,height,r_frame_rate -of csv=p=0 CUT.mp4
ffmpeg -i CUT.mp4 -map 0:a -f md5 -                       # compare with the previous version
ffmpeg -i CUT.mp4 -i PREV.mp4 -lavfi "[0:v][1:v]psnr=stats_file=psnr.txt" -f null -   # frames with psnr_avg < 32 changed
```
- Audio alignment to the album master: cross-correlate 4 s windows of the cut against the master at eight points; the
  offset must be the same at all of them (13.79 s on YSL). Different offsets = something moved or was condensed.
- Group the changed frames into ranges, map them to slots, and compare with the brief: that is the change log.
- Every range with him: a 12 fps zoomed face strip; mouth at rest or it is a finding.
- Before/after strips (previous version on top, new below) for every changed range, posted with the review.
- The review is a handoff (`docs/handoffs/HANDOFF_<CUT>_REVIEW_<date>.md`): mechanical table, change log, flags,
  the list of decisions that are Fendi's, the list for the cutter's next push. Nothing marked approved.

## 7. Checklists

**Before a paid call:** model checked against §4 (no Grok); for a shot with him, the likeness rung named (§3b); dry run done and quoted; plate inspected (nothing in it that was excluded); the shot's intent row
filled (lane, scenery, motion budget, beat); for a shot with him, the method named (real take + swap, or recipe F).

**Before posting a clip:** SHOT_RULES 1–7 said in the post; face sheet; mouth scan on every face that could be his;
both clocks on any time; nothing in it that Fendi excluded.

**Before a handoff:** slot table with both clocks and beats; SCRAPPED rows with his words; expected values; what not to
do; what to report; nothing marked verified.

**After a delivery:** §6 run; review posted; his decisions listed; the accepted version filed with sha256 and his words.
