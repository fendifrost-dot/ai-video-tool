# Lyric timing vs the candidate; the proposed edit structure; coverage in five parts · 7 October 2026 (evening)

> Integration agent. Spend this record: **$0.00** (no writer call, no generation). Follows `WRITER_BEATS_2026-10-07.md`.
> Status Fendi set: a successful structural improvement with remaining defects; the writer workflow is NOT validated.

## 1. The lyric-timing conflict — VERIFIED from the alignment data

Source: `lyric_lines` for the project (`source = align_lyrics`, the timed lines Setup made from the song). Audio was
not re-listened to from this session; the timestamps below are the alignment's, with its own confidence, and they
agree with the board (the first run's shots 7–8 carried these very words at 0:23–0:31).

| line (verbatim) | sung at | times sung | confidence | treatment scene | candidate 2 put it at | offset |
|---|---|---|---|---|---|---|
| "More cameras in the whip / Than a camera crew" | **0:23.4–0:25.1** | once | 0.60 / 0.50 | the camera crew (control room) | b14, shots 27–29 = 1:51.8–2:09.4 | +88 s |
| "All this ice around me / Need a Canada goose" | **0:25.1–0:27.0** | once | 0.80 / 0.75 | the geese interruption | b17, shots 36–38 = 2:40.8–2:54.5 | +136 s |
| "So clean but I don't do / What the janitor do" | **0:27.0–0:29.0** | once | 0.67 / 0.75 | the clean entrance (janitor) | b18, shots 39–43 = 2:54.5–3:21.9 | +147 s |
| "You don't gotta cut the lights on" (vocal entrance, verse) | **0:14.7–0:16.7** | — | 0.29 | "The click lands with the vocal entrance" (Chicago — the switch) | b09, shots 13–14 = 0:47.1–0:54.9 | +32 s |
| "cut the lights on" (hook) | 1:03.2, 1:06.3, 1:18.9, 1:26.7, 2:53.3, 3:01.2, 3:09.1 | 7 | 0–0.75 | grill close-up | b11, shot 17 = 1:02.75 | **on its words** |

So the treatment hangs four visual punchlines on lines the song sings **once, inside its first 29 seconds** — the
stretch the treatment's own order spends on the forest, the rider and the viewer (18 beats, three of them before
0:15). The candidate honoured the narrative order (as the allocator was told to) and said so; it did not honour the
lyrics. Neither can be honoured in full with the treatment as written.

## 2. The proposed timing revision — for approval; the saved treatment is unchanged

The mechanism that makes any of this executable is in the writer now (PR #197): a beat whose words are sung only
before its turn gets a **flash shot on those words** (an "insert", reported in coverage) and continues in full where
the treatment puts it. Which of the following you want is a creative decision; nothing has been re-run.

**Option A — flash-forwards (smallest change to the treatment).** Order as written. At 0:23.4 (shot 7, 0:23.5–0:27.5)
the control room flashes in on "more cameras in the whip" and the geese on "need a Canada Goose"; shot 8
(0:27.5–0:31.4) flashes the janitor and the wet-floor sign on "so clean… janitor"; the rider's side-on colour loss
moves one shot later (shot 9, 0:31.4) with the viewer right after it (shot 10). The three later scenes play in full
where they are now. Reads as "the broadcast is ahead of reality" — the treatment's own last line. Cost: the rider →
CRT cut slips from 0:27/0:31 to 0:31/0:35; the opening loses nothing.

**Option B — shorten the opening, switch on the vocal entrance.** Forest+rider in 0:00–0:11.8 (shots 1–3); rider loses
colour + viewer compressed into shot 4 (0:11.8–0:15.7); the woman's switch lands on the vocal entrance at 0:14.7;
Chicago in the leather coat from shot 5 (0:15.7); then the three punchlines at 0:23–0:29 cut in from Chicago as
flash-forwards (as in A) or as real cuts; the fashion-broadcast thread (rider turns, CRT snaps white) returns later
(the 1:10–1:50 stretch is otherwise one long blizzard). This honours "the click lands with the vocal entrance", which
A does not. Cost: the opening is 12 s not 31 s; the viewer has one shot; a material reorder of the treatment's middle.

**Option C — accept the offsets** (candidate 2 as is, `lyric_inserts: false`). The punchlines are not on their words.
Coverage will keep reporting lyric alignment as failing. Not recommended; listed so the choice is explicit.

Say A, B, or C (or your own order) and I run the writer once more into **candidate 3** (bounded estimate as before:
≈ $0.02, ≤ $0.05 at list) — candidate 2 and the old board stay.

## 3. Coverage strengthened (PR #197, live) — what each part now checks

| part | checks | verdict words |
|---|---|---|
| structural | every beat has shots; every named person cast in its beat; no peopled beat emptied | pass / fail |
| lyric alignment | cues anchored, inserted (flash), sung only earlier with no insert (fail), never sung (gaps) | pass / gaps / fail |
| relationships | each tie: **kind from its own words** (`tieKindFromWords`), direction (to an earlier beat), target (link on the opening shot to the earlier beat's last shot), presence; corrections reported | pass / gaps / fail |
| production feasibility | take-based methods on a beat where he does not perform are re-routed to generate and reported | pass / gaps |
| beats vs treatment | every treatment paragraph (≥ 8 words) shares a phrase with some beat | pass / fail |

The overall word is `pass` only when all five have nothing to say. Candidate 2's stored coverage predates these parts
(it was one `ok: true`); the page shows it as before-sections. Re-run under the new writer it would read: structural
pass; lyrics **fail** (three cues sung only earlier, no inserts); relationships **gaps** (viewer tie corrected
match_position/reveals → screen_shows from its words); production **gaps** (shot 10 restage → generate); treatment —
not yet audited.

## 4. Shot 10's route — fixed in both places

- **Writer** (`withFeasibleProduction`): a take-based method on a shot of a beat with `artist_performs: false` becomes
  `generate` with the reason on the shot; coverage reports it under production.
- **App** (`route.ts`): a take-based method on a shot whose preserve-identity member is not performing (by shot type or
  his cast action) is **unsupported** with "The take shows him performing; this shot has him sitting, watching the
  television… It has to be drawn with his identity pictures (generate), not cut from the take." Verified live on
  candidate 2's shot 10: the card read "Restage his take in a new place — cannot be made yet".
- **Candidate 2, by hand (recorded):** shot 10's method set to `generate` at 23:49 UTC. With shot 9 (link + garment),
  that is **two shots edited by hand** on candidate 2; the coverage block now says how many shots were edited since
  the write, so the writer's output and the repaired board are told apart.

## 5. Regression coverage added (all pass; 2,414 tests)

| case | test |
|---|---|
| CRT relationship by type, direction, target | `beats.test.ts` "a tie is checked for type, direction and target — the CRT case" (3 tests) |
| lyric inserts / never-sung / no steal from a one-shot beat | `beats.test.ts` "lyric synchronisation is never silently traded…" (2) |
| seated-action routing, writer side | `beats.test.ts` "production feasibility — a rapping take is not a seated man" |
| seated-action routing, app side | `linksRoutes.test.ts` "a rapping take is not a seated man…" |
| required reference overflow (screen, garment) blocks | `linksRoutes.test.ts` "a required screen picture or an exact garment that overflows the cap BLOCKS…" |
| characters copied into a candidate | `continuityCopy.test.ts` (2) |
| beats audited against the treatment | `beats.test.ts` "the beats are held against the treatment itself" |
| coverage never one unqualified pass; hand edits counted | `TreatmentPage.test.tsx` "a sectioned coverage shows each part with its own word…" |
| **entrypoint gate** | `supabase/functions/entrypoints.test.ts`: all 36 functions bundled with remote imports stubbed, booted, driven to a provider call; the writer with `text` removed fails with `ReferenceError: text is not defined` |

## 6. Remaining reference needs (unchanged, restated)

- THE_RIDER: no approved picture — first paid step ($0.14) for the rider → CRT test; the app blocks shot 8 until then.
- Exact garments on file that the treatment's words can map to: Trucker Jacket — French Black Denim (denim look);
  **no leather coat, no blizzard jacket** — those shots draw from words unless a picture is added or you relax them.
- Shot 9's three required pictures (Fendi, jacket, shot 8's image) fill the endpoint's three slots exactly; a fourth
  required one now blocks.

## 7. Execution of paid steps — recorded, not worked around

This session's browser tool refuses clicks it classifies as real-world transactions (it refused the rider's
`entity-generate-picture`; it allowed the writer's "Write the candidate"). Permitted paths when we reach the test:
Fendi presses the generate buttons himself in the app; or a session whose browser tool is not under that guard runs
§3 of `IB_TEST_AGENT_2026-10-07.md`. Nothing paid beyond the two writer runs ($0.0263 + the first run, cents) has
happened from this session.
