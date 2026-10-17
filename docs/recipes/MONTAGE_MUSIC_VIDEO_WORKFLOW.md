# The montage music video — the workflow for every song

Decided with Fendi, 17 Oct 2026, after the Oak Street intro ("The intro is perfect … let's knock it all out using the
same montage format … are we going to keep doing 4 second clips or cut to the exact song taking into account
transitions and beats of the song. Whichever is the best solution we should write that workflow into the tool so we
don't have to guess for the next song").

## The decision: cut to the song, render per shot

- **The edit is the song's beat grid.** Every shot's window on the board is cut by the tool on the song's measured
  beats — downbeats first, a lyric line's start when one is within a beat, a section change always
  (`src/lib/treatment/grid.ts`, from `song_analyses.beat_map_json` + `sections_json` + the timed lyrics). The shot
  boundaries ARE the transitions; nothing is cut by hand.
- **Inside a shot the montage cuts on the beats too.** Untimed lines are shared over the part of the clip the edit
  plays and each cut is moved onto the nearest beat that keeps every scene ≥ 0.4 s (`planBeatLockedScenes`,
  `src/lib/storyboard/montage.ts` = `supabase/functions/_shared/montagePrompt.ts`; montage `v4`). The job records how
  many cuts landed on a beat (`variant.cutOn`). Lines with their own seconds ("1.0-1.6 s: …") are the director's and
  are sent as written.
- **One render per shot, at the model's length.** Seedance renders whole seconds, at least 4. A 1.5 s shot still
  renders 4 s: the first scene covers any head handle, the last holds past the shot — handles the edit never plays.
  Never one render across several shots: the model's cuts drift a few frames, so a shared clip leaks one scene across
  the edit's cut, and one bad shot could not be redone alone.

## The steps, in order

1. **Song in.** Analyse it (Setup → song analysis: BPM, beat map, sections) and time the lyrics. Check the sections
   by ear once; they become the scene boundaries.
2. **Treatment.** One location per lyric beat or section; one cold/odd thing per location; the director's pictures
   filed as `director_reference` assets and named in the treatment.
3. **Board.** Build the fast-cut grid (1.5 / 2 / 3 s by energy, cuts on beats). Do not hand-edit windows.
4. **Scenes.** One `variation_scenes` row per location (start/end on shot boundaries, an `outfit_key`). One place
   still per scene through `world-still-proxy`:
   - `worlds/plate_*` — the place, empty where he stands (his montages and the composite take it);
   - `worlds/scene_*` — the director's picture WITH its people (the cast: the b-roll montages keep them, `castLine`).
   Newest usable still wins; mark rejects `usable:false` with a reason.
5. **Who is in each shot.** A shot he is in is `shot_type = performance` (and `override_json.shotType`) with his take
   on it; a shot he is not in stays b-roll. Every scene opens on the place without him.
6. **Dress** each performance shot in its scene's outfit (Storyboard → Dress, or `avt-press.mjs dress`): the
   Genjutsu swap of his real take, ~$2.72 for 4 s. Check one frame before shooting the montage.
7. **Montage every shot** (`montage-shot` / `avt_montage`, or the storyboard's Montage button for performance shots):
   - performance: his dressed take re-shot in the place, mouth in sync; never wider than the take; never a shot of
     his shoes or feet (~$2.22 for 4 s);
   - b-roll: the place and its people only, lines required, no close-up of anyone's shoes or feet (~$1.85 for 4 s).
   Lines: 2–4 per shot (one scene per beat or two), "HARD CUT to …", the place's unusual thing in a cutaway, him
   anchored to something in the place, never centre-front. Untimed — the tool puts the cuts on the beats.
8. **Review** by section: pull each clip's shot window into one silent preview (the board does this with sound), mark
   misses `usable:false` with the reason, reshoot only those shots. Filed results are always UNSELECTED; selecting is
   the director's.
9. **Record** every paid call in the ledger and the handoff in the same session.
