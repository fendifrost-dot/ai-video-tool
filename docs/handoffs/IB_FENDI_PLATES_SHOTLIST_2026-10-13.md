# Interrupted Broadcast: Fendi's own shots, a shot list for re-shooting (13 Oct 2026)

**Director's verdict, 13 Oct 2026 (chat):** "The only thing that's off is my likeness sitting in the chair watching the tv.
Everything else is amazing." He also said the shot of him "is actually the worse in regards to realism, it looks AI
generated" compared with the generated rider clips. He offered two routes:

- shoot himself in the same position and have him put into the frame, or
- regenerate a version of him that passes,

"and that goes for every shot with me in it."

**Recorded:** the seven rider clips K1 and K3–K8 are `approval_status = approved`. Their primary assignment notes quote
him. M5 was already approved. See [`IB_RIDER_SEQUENCE_2026-10-13.md`](IB_RIDER_SEQUENCE_2026-10-13.md).

## Which shots have a generated Fendi (first half, 0–70.6 s)

Reference frames: [`../review/ib_rider_2026-10-13/fendi_shots_reference.jpg`](../review/ib_rider_2026-10-13/fendi_shots_reference.jpg).
Each shot has three frames, at the start, middle and end of the shot.

| Shot | Song window (s) | Shot length (s) | What the picture is | Wardrobe on the board (garment refs) |
|---|---|---|---|---|
| c012 | 43.17–47.07 | 3.9 | The viewer's room. He sits in the floral armchair, back to camera, watching the small CRT. The script says "walks in"; the picture is already seated. | YSL denim look: black trucker jacket, Y varsity cap (black and ivory), Cazal octagonal glasses |
| c013 | 47.07–51.00 | 3.9 | The same setup, a slightly tighter hold. He watches the rider on the TV. | same |
| c015 | 54.90–58.83 | 3.9 | The same angle. The TV flares white and the room drops almost to black ("you don't gotta cut the lights on"). | same |
| c017 | 62.77–66.70 | 3.9 | Night, 79th St Red Line station. He walks toward the camera, framed knees-up, with the woman at the switch beside and behind him. | YSL leather coat look: black lambskin coat, shirt and tie, Saint Laurent cap (beige and ivory), Cazal glasses |
| c018 | 66.70–70.60 | 3.9 | The same location, continuing the walk. The red station light hits the woman first. | same |

Every other shot in the first half has no Fendi in it.

c017 and c018 also carry generated defects of their own:

- The station sign has a garbled second line ("LUFFEA SK LAFAYERS").
- There are downtown towers, which the location entity forbids: "a low-rise neighbourhood beside an expressway".

## Recommendation (DECISION pending Fendi): shoot it for real, keep his pixels

1. **The viewer's room (c012, c013, c015): practical, in camera.**
   - Use a real armchair, a table lamp, and a TV (any size) **playing the approved rider sequence**. The file is the 720p rider excerpt sent in chat; it can be played full-screen on the TV.
   - The TV's real light then falls on him and the room. That light is what the generated shot gets wrong, and what makes a shot read as real.
   - If the room you have doesn't resemble the designed room (patterned wallpaper, framed pictures, a low wooden cabinet), that's fine: the shot is dark, and the TV and lamp carry it.
   - Nothing gets generated, so likeness cannot drift.
2. **The Red Line walk (c017, c018): the real 79th St station at night, if it's practical to get to.** It is a real place in Chicago, and the real location beats any composite.
   - If shooting there isn't practical, shoot the walk on any lit night sidewalk with storefronts.
   - We then decide between keeping that real background, or replacing only the background behind him.
   - Replacing a background behind a walking person is the hardest composite (parallax, hair edges, light change). Treat it as the fallback, not the plan.
3. **The woman at the switch** is in c017 and c018. If the walk is shot for real, she is either cast and shot with him, or dropped from those two shots, or added later as a generated figure (the weakest option). **Fendi's call.**

Why not regenerate first: every generated Fendi on this board has failed on likeness or realism. The rider clips pass because
no one in the audience knows her face. A regeneration costs about $0.27 per still plus $0.14 per 2 s clip, so it is cheap to
try. But the director has already named realism as the problem, and a real plate solves it by construction.
**RECOMMENDATION:** shoot first. Regenerate only a shot that cannot be shot.

## Capture notes, for every setup

- **Vertical 9:16**, 4K if available (1080×1920 at minimum). 24 or 30 fps (the cut runs at 30). Shutter about 1/50–1/60.
- **Lock** exposure, focus and white balance. Turn off digital zoom and any auto "cinematic" mode.
- **Each take at least 8 s.** The cut uses 3.9 s, and a longer take gives room to choose. Shoot 3 takes per setup.
- **Then 5 s of the same locked frame with nobody in it** (a clean plate). That keeps the swap and background routes open later, without a reshoot.
- **Match these angles** (see the reference sheet):
  - **Viewer's room:** camera behind him and to his left, at about seated head height (roughly 1.1–1.2 m), looking over his left shoulder at the TV. He sits back in the chair, head turned slightly right toward the screen, so the edge of the glasses catches the TV light. The lamp is right of the TV. For c015, kill the lamp mid-take and let the TV carry it.
  - **The walk:** camera at about chest height, moving backward ahead of him, or locked off while he walks in. Knees-up framing. Shoot one take at a steady walk and one slightly slower.
- **Audio:** play the song while shooting the walk so the pace sits on the beat (122 BPM). There is no lip sync in these shots.

## What happens when the footage arrives (next agent)

1. Upload each take to the project through AVT (`project_assets`, footage). **Never** process it locally, per the hard rule in CLAUDE.md.
2. Put each take on its shot as the **selected** clip, with `source_in_seconds` set to the chosen 3.9 s window.
   - The generated clips stay on the shots as unselected versions, with a dated note.
3. c015's white-out: if the practical lamp cut is not dramatic enough, the edit's existing effect on that shot can carry it. Check the render.
4. Re-render the first half: [`IB_RIDER_SEQUENCE_2026-10-13.md`](IB_RIDER_SEQUENCE_2026-10-13.md) → "How to check this cheaply". Send Fendi the 720p copy.
5. **Do not** run the rejected performance-restaging route on these plates, and don't put garments onto them with AI. His real clothes are the wardrobe.

## Still open from this pass (unchanged)

- M5 plays letterboxed: renderer `cover` fit (Class C), or a 9:16 outpaint of M5. Fendi's call.
- The TV picture in c011, c012, c013 and c015 shows the old rider. **Shooting the room practically with the approved sequence on the TV fixes this for c012, c013 and c015 at no cost.** c011 (the empty room and TV, no Fendi) still needs its screen re-filmed or re-generated.
