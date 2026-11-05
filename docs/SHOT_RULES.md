# Shot rules (locked, Fendi, 5 Nov 2026)

What is acceptable in a shot with him and what is not. These are decisions, not guidance; every agent checks a clip
against this list **before** it is posted or filed, and says so in the post ("rules check: 1–7 pass"). A clip that fails a
line is not posted as a candidate; it is a finding. The list grows only when Fendi rejects something for a new reason.

## A shot with him in it

1. **His mouth on the lyrics is his real footage, always.** A performance shot is a real take, synced on the song. A
   generated him never moves his mouth (no lip-sync pass, no "mouth in sync" render). A generated him is only ever at
   rest, in b-roll (`docs/recipes/BROLL_WITH_HIM_STILL_MOUTH.md`).
2. **His face stays his.** A clothing swap on real footage ends with the face put-back (proof 0), never with the
   whole-frame redraw (`docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`).
3. **He is never cut into a picture.** A still plate behind him with nothing moving but him reads as a paste-up
   (c009, 5 Nov: "me rapping in front of a picture … no scene, no movement, looks like I don't belong"). The scene
   around him has to be alive: a moving plate (animated or footage), or real camera life on the whole frame; a
   seeded drift on a still is not enough.
4. **He is never composited in front of other people.** Him over a plate that has the cast in it (the crew on the
   couch) is a paste-up by definition. The cast and him are separate shots: a cutaway of them, then a cut to him,
   alone in his frame (the 17 Oct lounge montage's structure, which Fendi approved).
5. **He belongs to the room.** Light direction, colour and grain on him match the scene he is in; a flat or
   mismatched grade is a reject (c009 23 Oct, "pasted"; 5 Nov, "looks like I don't belong"). If the match cannot be
   made, the shot is a cutaway without him, not a composite.
6. **Angle and scale are the scene's.** He is as large as his distance from the camera says, and faces where the
   scene says (the approved line, e.g. "him at the couch in profile"). A frontal take in a scene written in profile
   is the wrong take, not a placement problem.
7. **Waist up or closer, never centre-front, never his shoes.** (Fendi, 17 Oct.)

## The structure of a shot with the cast

- **Cutaway → him.** The place and its people first (b-roll, no him), HARD CUT to him alone. Never both in one frame
  unless it is a single real take of all of them.
- The cutaway can be generated (the people are not him). His part is real footage.

## What the tool cannot do yet (so no agent pretends it can)

- The composite lane overlays a take at its own scale over a plate; it has no place-and-scale and no moving plate by
  default (`Animate the plate` makes one). `scripts/edit/place_him_over_plate.py` places and scales offline, and it
  still violates rule 3 on a still plate: use it only over a moving plate, and never over people (rule 4).

## Rejections this list is built from

| Date | Shot | Clip | Why |
|---|---|---|---|
| 17 Oct | c009 | lip-sync pass `ed893e0b` | "alters his face and does not match" (rules 1, 2) |
| 18 Oct | c033 | whole-frame Genjutsu dress | face is a redraw (rule 2) → the canonical put-back |
| 24 Oct | c044 | still-mouth re-shoot of a rapping take | stiff, robotic (rule 1 → recipe F) |
| 5 Nov | c009 | `be49e5b0`, his take pasted into the lounge | "bad masking with an outline … pasted in … forward facing, unnatural" (rules 3, 4, 5, 6) |
| 5 Nov | c009 | `425c846b`, his dressed take placed in front of the couch | "me rapping in front of a picture … no scene … no movement … looks like I don't belong … the men on the couch do NOT need to be shown at the same time as me" (rules 3, 4, 5) |
| 5 Nov | first half | ten shots whose generated him moves his mouth | not usable as they stand (rule 1) |
