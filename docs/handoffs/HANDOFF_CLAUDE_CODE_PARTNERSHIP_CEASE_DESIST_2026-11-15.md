# HANDOFF — "Partnership / Cease & Desist": the build moves to Claude Code (15 Nov 2026)

**From:** Claude (the chat session that set the song up, 11–15 Nov) · **For:** Claude Code on Fendi's Mac.
**Why the move (Fendi, 15 Nov):** "I just realized claude code is the best tool for this let's create a handoff for
claude code."
**Project:** `0c5c4421-1298-4919-bf62-2764ce7837fa` · **Board (variation):** `c9b766a2-88c6-4613-8d50-917ae64e439d`
("Still riding": a working name given by the agent, not by Fendi).
**Ledger:** `docs/LEDGER_PARTNERSHIP_CEASE_DESIST_2026-11-11.md` ($0.00 spent, nothing approved).
**Earlier handoff:** `docs/handoffs/HANDOFF_PARTNERSHIP_CEASE_DESIST_2026-11-11.md`. This page replaces it where they
differ: it was written before the 12–13 Nov rules (no Grok, the likeness rules, the problem index).
Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## Read first, in this order

1. `CLAUDE.md`, above all "LOOK UP THE SYMPTOM BEFORE YOU SOLVE IT" and "MODELS AND HIS LIKENESS".
2. `docs/PROBLEM_INDEX.md` (the SessionStart hook prints it).
3. `.claude/skills/avt-music-video-build/SKILL.md`, whole, before the first paid call.
4. `docs/SHOT_RULES.md`, `docs/recipes/README.md`, `docs/recipes/HIS_FACE_IN_ANY_SCENE.md`.
5. `docs/recipes/CREATURE_OR_PROP_SWAP_ON_HIS_TAKE.md`: the closest proven method to the friend swap (see below).

## Where to run

- Code: `/Users/gocrazyglobal/Projects/ai-video-tool`, on `main`, pulled. OBSERVED 11 Nov: the sibling clone
  `/Users/gocrazyglobal/ai-video-tool` was 1,313 commits behind `main` with staged changes. Do not work from it
  without bringing it up to date, and do not discard what is staged there without asking Fendi.
- Media: the T7 only (`df -h /Volumes/T7` first; missing means stop and ask). Never iCloud.
- Backend: AVT MCP tools or the app. Lovable-managed only.

## The video (Fendi's words, 11 Nov)

A tribute to his friend, who was killed. He keeps him with him as if he is still here: they used to ride foreign cars
together, and he is still doing the things they used to do.

- Mostly Fendi's **performance shots with the backgrounds changed**.
- **Passenger seat:** his friend riding with him.
- **By the car:** his friend standing next to him in front of a foreign car, "just like we used to take pictures".
- Played straight and real: his friend is simply there, not a ghost. Old footage of the two of them: maybe some.
- His girlfriend plays the friend on set, copying his movements, and a character swap turns her into him.

## The war cry (Fendi, 14 Nov, asked to be documented)

At the beat transition right before the line he gave as "Ralph Lauren Sport" / "Ralph umbrellas for the rain", he lets
off a war cry: mouth open wide, muscles clenched, yelling. As he yells, the yell turns into hurricane-force winds and
the picture cuts to him standing centre screen, rapping the verse, while memories and material objects blow past him:
silhouettes of pictures of him and his friend, cars, debris, holograms of memories. "It's as if I'm trying to hold on
to the memories of my friend." He expects it to set the scene and be very impactful.

The same text is on the board's `notes`. The exact lyric wording and the time of the transition are not known yet.

RECOMMENDATION (agent, not his direction): both halves are his real takes. The yell is real footage; the storm verse is
his real take placed over a generated storm, with the wind, objects and memory pictures added around and in front of
him. That is the "his real take inside a generated scene" row of `docs/recipes/README.md`.

## State (VERIFIED from the rows, 15 Nov)

- Project and board rows exist; the board is the active one. Aspect ratio is 9:16 by assumption, not confirmed.
- No assets, no shots, no treatment, no lyrics, no cast records. The song master has not been sent.
- Nothing generated. $0.00.
- Fendi has not shot yet. On 14 Nov he said he would shoot within a day or two and send the takes.

## What changed since the 11 Nov handoff

| 11 Nov page said | Now |
|---|---|
| Background motion by Grok image-to-video at $0.282 per 4 s | **No Grok on anything that ships.** Stills in Gemini (`gemini-nano-banana-2.1`, `model` named on every `world-still-proxy` request), motion in Seedance (`montage-shot`) or Genjutsu |
| Whole video estimate $80–150 | **Void.** It was built on Grok animation. Re-quote from dry runs once the shot list exists, and give Fendi the number before any paid call |
| Friend swap: Genjutsu "only ever used on garments" | A Genjutsu object swap on his real take, with only his face put back, is now a written recipe (`CREATURE_OR_PROP_SWAP_ON_HIS_TAKE.md`). Person to person is still untested (HYPOTHESIS) |
| 4-engine passenger-seat test | Still a RECOMMENDATION, still not approved. Check each engine against "MODELS AND HIS LIKENESS" and the current catalog (`avt-capability-scan`) before proposing it again |

## Rules specific to this video

- **Fendi's face is his real footage, and his mouth on lyrics is his real take.** In a two-shot, the swap redraws the
  whole frame, so the final picture is the swap put back over the original frames: only the friend's region comes
  from the model. Print the proof (0 difference on Fendi's face) with the clip.
- **The friend's likeness comes only from the photographs Fendi supplies.** Never from a generated still of him, and
  never from a description. Fendi decides whether the face is his friend; a rejected face is re-rolled, not argued.
- The friend is a real person who was killed. Keep every picture of him respectful and inside what Fendi asked for.
- Media of Fendi, his girlfriend, his friend and the song never go into the repo (it is public).
- The storm's flying photographs are Fendi's own pictures of the two of them, shown as he asked (silhouettes,
  holograms). No likeness of any other real person.

## Shooting notes already given to Fendi (11 and 14 Nov)

- Friend shots: camera locked off or a simple move; real space left for him; his girlfriend filmed in his place for
  light, shadow and eyeline, dressed close to how he dressed; 5–10 s of her alone in the seat where possible.
- The yell: several takes, face and clenched upper body filling the frame, held longer than feels natural.
- The storm verse: centre frame, camera locked off, full body or knees up, the whole verse, empty space on both sides.
- A fan or leaf blower on him from one side, so his clothes move.
- A plain, evenly lit wall or open sky behind him for a clean cut-out.

## Answered by Fendi, 16 Nov (VERIFIED; details on the project row)

Read `video_projects.notes` on project `0c5c4421` before asking Fendi anything below. Personal details (his friend's
name, the cars, the circumstances) live on that row in AVT, not in this public repo.

- **Lyrics:** filed verbatim in `video_projects.lyrics` (not timed yet; needs the master). Not in the repo.
- **War cry placement: confirmed.** The yell sits at "Yo yo yo yo" before the second verse; the storm verse starts at
  "Ralph umbrellas for the rain".
- **His friend's name and how to credit him:** answered; see the row.
- **The cars for the friend shots:** the two Lexuses they drove ("Back to back Lexus"); models and colours on the row.
- **The car named in the second verse is not a hero car.** Never put his friend in it or feature it unless Fendi asks.
  Why is on the row.

## Waiting on Fendi

- The song master and the lyrics.
- A folder for this song on the T7, and its path.
- Photographs of his friend: a clear front-on face, other angles, full body, how he dressed.
- Photographs of the two of them together, for the storm.
- His performance takes, the yell, the storm verse, and his girlfriend's takes as the friend.
- Approval, in his words, of any spend.

## Unknown (ask once, kindly; never guess)

- His friend's name, and how he is to be named or credited.
- How his friend's build compares with his girlfriend's.
- Whether his friend's family has weighed in. Asked twice on 11 Nov; not answered.
- Song length, BPM, release date. Whether 9:16 is right.

## First steps

1. Pre-flight (`docs/AGENT_BOOTSTRAP.md`), then load `avt-music-video-build`.
2. When the master arrives: file it, run the analysis, time the lyrics (`scripts/lyrics/align_lyrics.py`), and find
   the beat transition before the "Ralph Lauren" line on the song clock.
3. When the takes arrive: file each (4K original and a board copy), sync with `scripts/performance-sync.mjs`.
4. Write the treatment on the board with Fendi's concept and the war cry in his words, then the storyboard with an
   intent row per shot (`docs/STORYBOARD_INTENT.md`).
5. Quote the video from dry runs, put the number to Fendi, and record every paid call in the ledger in the same commit.
6. Friend shots: propose the likeness test to Fendi with its cost; run it only on his word.
7. Post every still and clip into the chat as it exists, with its check sheet and the SHOT_RULES line.

## Opening message for Claude Code (paste as is)

```
Take over the "Partnership / Cease & Desist" music video in AVT. Work in /Users/gocrazyglobal/Projects/ai-video-tool
on main, pulled. Read docs/handoffs/HANDOFF_CLAUDE_CODE_PARTNERSHIP_CEASE_DESIST_2026-11-15.md first and follow its
reading list and first steps. Media is on the T7 only, never iCloud. No Grok on anything that ships. My face and my
mouth are always my real footage. Spend nothing until you have quoted it and I have approved it. Tell me what you
need from me first.
```
