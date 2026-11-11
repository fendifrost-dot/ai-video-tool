# Handoff: "Partnership / Cease & Desist" music video (new AVT project)

Date: 11 Nov 2026. From: Claude (the P&L session). To: the new chat dedicated to this song.
Owner and approver: Fendi. Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## The concept (Fendi's words, 11 Nov 2026)

A video celebrating the life of his friend, who was killed. The idea is that even though he's gone, Fendi keeps him
in memory as if he's still here. The song talks about how they used to ride foreign cars together; Fendi is still
driving foreign cars and doing the things they used to do, as if his friend is still with him.

- Mostly **performance shots** of Fendi, with the **background changed** behind the performance.
- **Passenger seat:** his friend riding with him.
- **By the car:** his friend standing next to Fendi in front of a foreign car, "just like we used to take pictures".
- "Bring him back to life, in essence, through the video." Play it straight and real: he is simply there, not a ghost.
- Old footage of the two of them: maybe some, not the core of the concept.

## How the friend gets into the picture (Fendi's plan)

Fendi's girlfriend plays his friend on set, emulating his movements, and a character-swap model turns her into him,
using a character built from his photos. Fendi asked whether the object swap (Genjutsu) can do it. Answer given:
yes, as a candidate. It is already wired into AVT. It has only ever been used on garments, never person to person, so
whether it holds his likeness is untested (HYPOTHESIS).

RECOMMENDATION, not yet approved: a 5-second passenger-seat test across four engines, about $10–15 in total. Keep the
one that holds his likeness best, then do the rest of his shots with it.

| Engine | Where | Status |
|---|---|---|
| Genjutsu object swap (`hf_mult_replace_object`) | Higgsfield via Control Center | Wired in AVT. About $3.40 per 4–5 s window (YSL ledger) |
| Object swap flash on Kling 4.0 (`hf_mult_replace_object_flash`) | Higgsfield | In Higgsfield's model list (OBSERVED 11 Nov on the connector account). AVT's API access to it: unknown |
| Recast (MiniMax H3 Max Recast) | fal, $0.30/s at 768p, $0.45/s at 1080p | Not wired: needs `minimax/h3-max/recast` on Control Center's `fal-run` allowlist (Class C). See `docs/research/results/2026-10-20-recast-seedance/` |
| Gemini Omni 1.2 Flash edit, with his photos as references | Gemini API $0.07/s at 720p (released 5 Nov); also listed in Higgsfield (`gemini_omni_flash_1_2`) | Not tested. On the Gemini API it would likely come out of Fendi's monthly Google credits |

Kling 4.0 (`kling4_0`, global launch 16 Oct) and `kling_video_edit` are also in Higgsfield's list. Kling 4.0 takes reference
videos to drive a character's movement and up to 15 character references. Kling's own developer API is not open yet.

## Rules that hold (repo CLAUDE.md, docs/SHOT_RULES.md)

- **Fendi's face is his real footage.** Every swap model redraws the whole frame, so in any two-shot the final picture is the
  swap pasted back over the original frames: only the friend's region comes from the model. This is the same put-back as
  `docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md` (`scripts/edit/body_only_swap.py`). Never generated lip-sync or a
  face-altering pass on Fendi.
- Check every shot with him against `docs/SHOT_RULES.md` and say so in the post. Post every generated clip and still into
  the chat as soon as it exists.
- Lovable-managed backend only (project `qoyxgnkvjukovkrvdaiq`). No standalone Supabase, no CLI SQL.
- Media lives on the T7 (`/Volumes/T7/...`), never iCloud. Never print signed URLs or tokens.
- No bracket placeholders in anything written for Fendi or another bot. Code changes must be general, never hard-coded to
  this song. Merge Claude's own PRs without asking.
- Benchmarks and engine picks come from evidence (a scored test), not from memory.

## Shooting notes given to Fendi

- Lock the camera off, or keep the move simple, on the friend shots. Leave real space for him; look or gesture toward it.
- Film the girlfriend in his place: she gives correct light, shadows and eyeline. Dress her close to how he dressed.
  Where possible, also take 5–10 s of her alone in the seat.
- If he was much bigger than her, the model has to reshape the body: say so before the test.
- If a real photo of the two of them by a car exists, the by-the-car shot can recreate its pose and framing.

## Costs (from the P&L and YSL ledgers)

- **Background swaps behind the performance:** matting runs locally ($0). Stills come from Gemini, about $0.09 each by
  real token count. VERIFIED that they come out of Fendi's Google credits (attached, per Fendi).
  Grok image-to-video is $0.282 per 4 s.
- **Friend shots:** about $7–15 per finished shot, including retries to get the likeness.
- **Whole video, estimate:** $80–150, depending on how many friend shots there are and how much the backgrounds move.
- **Precedent:** P&L ran about $36 out of pocket (Grok animation only). YSL, with clothing swaps and Seedance shots of
  Fendi, ran about $600.
- **Fix offered, not built:** `world-still-proxy` records Gemini cost as the $0.27 worst case, though each job holds real
  token usage. It could compute the cost from that usage.

## Needed from Fendi before the test

- The song master ("Partnership / Cease & Desist"), and lyrics if available.
- His performance takes, including the driving shots and the by-the-car shots, with the friend's space left open.
- His girlfriend's takes as the friend.
- Photos of his friend: a clear front-on face and other angles, full body, how he dressed (jewellery, hats), from the
  period Fendi wants to show.
- A folder on the T7 for this song, and the path to it.

## Unknown (ask, don't guess)

- The friend's name, and how Fendi wants him named or credited in the video.
- Whether the friend's family has weighed in on seeing him recreated. Asked once on 11 Nov, not answered. Ask once more
  kindly when it fits; their favourite photos or moments could anchor shots.
- How the friend's build compares with the girlfriend's.
- Song length, BPM, release date.
- AVT's own Higgsfield API access to `hf_mult_replace_object_flash`, `kling4_0` and `gemini_omni_flash_1_2`.

## First steps for the new chat

1. Read this file, `CLAUDE.md`, `docs/SHOT_RULES.md`, `docs/recipes/README.md` and
   `docs/recipes/FACE_PRESERVING_CLOTHING_SWAP.md`.
2. Create the AVT project and variation for the song, and file the master and takes as assets (see how P&L did it in
   `docs/LEDGER_PL_2026-11-09.md`). Sync each take with `scripts/performance-sync.mjs`.
3. Open a spend ledger for the song (`docs/LEDGER_<song>_<date>.md`).
4. Confirm engine access with dry runs only, then run the 4-engine passenger-seat test once Fendi approves its spend.
