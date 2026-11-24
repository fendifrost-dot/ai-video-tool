# Shot rules (locked, Fendi, 5 Nov 2026)

What is acceptable in a shot with him and what is not. These are decisions, not guidance; every agent checks a clip
against this list **before** it is posted or filed, and says so in the post ("rules check: 1–7 pass"). A clip that fails a
line is not posted as a candidate; it is a finding. The list grows only when Fendi rejects something for a new reason.

## A shot with him in it

**Rule of thumb (Fendi, 24 Nov 2026): "the scene has to match the way the clip was shot."** His clip is fixed; the
scene is built to it. Read the clip first (where the camera stood and its angle to him, its height, the lens and
his distance, whether the camera moves, where his light comes from and how hard it is), then make the scene with
that same camera and that same light. A scene made first and his clip bent to fit it is what reads as pasted in.
Rules 3 to 6 below are cases of this one.

1. **His mouth on the lyrics is his real footage, always.** A performance shot is a real take, synced on the song. A
   generated him never moves his mouth (no lip-sync pass, no "mouth in sync" render). A generated him is only ever at
   rest, in b-roll (`docs/recipes/BROLL_WITH_HIM_STILL_MOUTH.md`).
2. **His face stays his.** A clothing swap on real footage ends with the face put-back (proof 0), never with the
   whole-frame redraw (`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`).
3. **He is never cut into a picture.** A still plate behind him with nothing moving but him reads as a paste-up
   (c009, 5 Nov: "me rapping in front of a picture … no scene, no movement, looks like I don't belong"). The scene
   around him has to be alive: a moving plate (animated or footage), or real camera life on the whole frame; a
   seeded drift on a still is not enough.
4. **He is never pasted at the front of a picture of people.** What was rejected on 5 Nov was specific: his
   waist-up cut-out laid at the front of the lounge frame, over a picture with the crew on the couch, which read as
   pasted in. **Him in one free-flowing scene with other people in it is allowed** when they are part of that scene:
   moving in its depth, lit by its light, blended into its action (people fighting, running or arriving behind him
   while he raps). Amended by Fendi, 24 Nov 2026: "The lounge shot shouldn't have been a case for never putting me
   in front of other people ... it looked unnatural and like I was pasted in the shot, as opposed to a free-flowing
   shot where the people look blended in to the actual scene. That's totally different and perfectly fine." Rules
   3, 5 and 6 still decide whether a shot with people behind him passes; a cutaway of the cast, then a cut to him
   alone (the 17 Oct lounge montage's structure) stays an approved way to do it, no longer the only one.
5. **He belongs to the room.** Light direction, colour and grain on him match the scene he is in; a flat or
   mismatched grade is a reject (c009 23 Oct, "pasted"; 5 Nov, "looks like I don't belong"). If the match cannot be
   made, the shot is a cutaway without him, not a composite.
6. **Angle and scale are the scene's.** He is as large as his distance from the camera says, and faces where the
   scene says (the approved line, e.g. "him at the couch in profile"). A frontal take in a scene written in profile
   is the wrong take, not a placement problem.
7. **Waist up or closer, never centre-front, never his shoes.** (Fendi, 17 Oct.)

## The structure of a shot with the cast

- **Cutaway → him** is the safe structure: the place and its people first (b-roll, no him), HARD CUT to him alone.
- **Him and people in one frame** is allowed when it is a single real take of all of them, or one moving scene in
  which the people belong to the scene (rule 4 as amended 24 Nov 2026). Never a still picture of people
  with his cut-out laid over the front of it.
- The cutaway can be generated (the people are not him). His part is real footage.

## What the tool cannot do yet (so no agent pretends it can)

- The composite lane overlays a take at its own scale over a plate; it has no place-and-scale and no moving plate by
  default (`Animate the plate` makes one). `scripts/edit/place_him_over_plate.py` places and scales offline, and it
  still violates rule 3 on a still plate: use it only over a moving plate, and never over a still picture of people (rule 4).

## Rejections this list is built from

| Date | Shot | Clip | Why |
|---|---|---|---|
| 17 Oct | c009 | lip-sync pass `ed893e0b` | "alters his face and does not match" (rules 1, 2) |
| 18 Oct | c033 | whole-frame Genjutsu dress | face is a redraw (rule 2) → the canonical put-back |
| 24 Oct | c044 | still-mouth re-shoot of a rapping take | stiff, robotic (rule 1 → recipe F) |
| 5 Nov | c009 | `be49e5b0`, his take pasted into the lounge | "bad masking with an outline … pasted in … forward facing, unnatural" (rules 3, 4, 5, 6) |
| 5 Nov | c009 | `425c846b`, his dressed take placed in front of the couch | "me rapping in front of a picture … no scene … no movement … looks like I don't belong … the men on the couch do NOT need to be shown at the same time as me" (rules 3, 4, 5) |
| 5 Nov | first half | ten shots whose generated him moves his mouth | not usable as they stand (rule 1) |

## Amendments

| Date | Rule | Fendi's words | Effect |
|---|---|---|---|
| 24 Nov 2026 | 4 | "The lounge shot shouldn't have been a case for never putting me in front of other people. The lounge shot was specific ... it looked unnatural and like I was pasted in the shot, as opposed to a free-flowing shot where the people look blended in to the actual scene. That's totally different and perfectly fine." | the ban is on the paste-up, not on people in his frame; a moving scene with people behind him is allowed and judged by rules 3, 5 and 6 |
| 24 Nov 2026 | all (rule of thumb) | "I think the rule of thumb should be the scene has to match the way the video, not the video, but the way the clip was shot." | the scene is built to his clip's camera and light, never his clip bent to a finished scene |
