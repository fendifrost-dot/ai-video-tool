# Interrupted Broadcast · candidate 5 · the first-half cut, watched and repaired — 10 October 2026

Project `764a63d2-93cd-44f3-905f-292f14ab2f51` (YSL — Ice On), variation `882ec381-0fa0-4a76-b23b-b83ebc157372`
("Interrupted Broadcast · candidate 5", the project's active variation). First half = shots c001–c024, 0–101.96 s.
Everything was done through the AVT MCP and the app's own functions; Lovable only redeployed and published.

Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## 0 · What was and was not inspected

- **Watched (OBSERVED):** every selected clip of c001–c018, frame sheets across each clip's playing window; every
  still chosen as a keyframe at full size; the rendered first-half cut at each cut point (first / middle / last frame of
  every shot, and the frames either side of the cuts at 39.22, 43.14, 47.06, 50.98, 54.9, 58.82, 62.75, 66.67, 70.59).
- **Not heard:** the song was measured (band energy, the lyric timing rows), never listened to. Lip sync on c019–c024
  is the app's sync record, not a judgement by ear.
- **Not reachable:** the YouTube forest reference (`nT8gacKj-Ko`). The forest was judged against the treatment's words.
- **Not real time:** frames were sampled; nothing was played back at speed in a browser.

## 1 · The cut

- In the app: `/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/review` (candidate 5 is the active variation).
- A file rendered from the app's own render contract (`renderContract` → `scripts/render/render_contract.py`, 3059
  frames at 30 fps, 1080×1920, the song as audio) was delivered to the director in the session. The contract script
  that produced it over the MCP is PR #223 (open — see §8).

## 2 · What changed on the board, by time

Every replaced clip or still is still on its shot, unselected, with a dated note saying why. Nothing was deleted.

| time (s) | shot | now | was |
|---|---|---|---|
| 0–3.92 | c001 | aerial wildfire, no shape yet | the monogram from the first frame |
| 3.92–7.84 | c002 | the monogram clearing from above, models small inside it | a burning glyph that did not read as YSL |
| 7.84–11.76 | c003 | forest only, no building, no lettering on the ground | a large building behind the models |
| 15.69–19.61 | c005 | forest only | a building with steps |
| 27.45–31.37 | c008 | the approved rider beside the horse, then up into the saddle | a different woman, no mount |
| 31.37–35.29 | c009 | the same rider riding; colour drains from about 3.3 s | earlier rider |
| 35.29–39.22 | c010 | black and white, side-on | earlier rider |
| 39.22–43.14 | c011 | colour room, CRT showing that black-and-white rider, camera pulls back | the screen showed the earlier rider |
| 43.14–47.06 | c012 | him from behind in the black denim trucker, Y cap, glasses; the camera pans to the television, which shows the rider | a colour runway show on the screen, no glasses, cap backwards |
| 47.06–50.98 | c013 | the same frame, locked off | a different room, colour runway show |
| 50.98–54.9 | c014 | the rider, black and white, turns to the camera | she rode away; a building in the forest |
| 54.9–58.82 | c015 | the same room; the television snaps to a white point on the blackout | a third room, the television changed shape |
| 58.82–62.75 | c016 | the approved woman at a wall switch in the dark | a bright room |
| 62.75–70.59 | c017 + c018 | one ten-second clip across both shots: the bubbled lambskin coat over shirt and tie, the Saint Laurent cap, glasses, the same woman beside him | a smooth trench, no cap, another woman, two different streets |

Shot edits (through `scripts/mcp/edit.ts`, i.e. the app's own `applyOverride`): c014 and c016 `frame` (earlier this
session); c012, c013, c015 `continuity` = screen link to c010 + the three exact pieces; c017, c018 `continuity` = the
three exact pieces. His `cameraMotion`, `notes`, `cast` overrides and his locks on c003–c006, c008–c010, c012, c013,
c015 are unchanged; c017 and c018 were left unlocked as he had them. Entities: `WOMAN_AT_THE_SWITCH`, `THE_RIDER`,
`THE_MODELS` descriptions (originals in the session's records and in each row's history).

c012 / c013 / c015 share **one** keyframe (asset `5d175ab3`), so the room, the television and his clothes are
identical in all three. c015 plays its clip from 1.3 s so the white point meets the shot's existing blackout event at
0.5 s. c018 plays the c017 clip from 3.92 s (`source_in_seconds`).

## 3 · What is still wrong, by shot

| time (s) | shot | defect |
|---|---|---|
| 3.92–7.84 | c002 | the monogram reads as a clearing some tens of metres across, not forest-scale |
| 11.76–15.69 | c004 | not touched this session; a figure collapses at about 5 s of the clip, outside the 3.92 s that plays |
| 19.61–27.45 | c006, c007 | not touched. c007 is the writer's geese insert under "Need a Canada goose" (26.24 s) |
| 27.45–31.37 | c008 | she vaults up; boot-in-stirrup is not shown |
| 39.22–43.14 | c011 | its television has a silver housing and the room is grey-green; in c012–c015 the housing is black and the room is warm and dim |
| 43.14–47.06 | c012 | ~~he is already seated: the walk into the room is not shown~~ **Not a defect — see §9.** The treatment has him seated; the walk-in is only in a camera note on the shot |
| 43.14–58.82 | c012, c013, c015 | jeans, belt and sneakers were not sent as pictures (five is the limit: screen, face, jacket, cap, glasses) |
| 54.9–58.82 | c015 | the lamp never goes out in the clip; the darkness is the blackout effect. A small white object appears in his hand |
| 58.82–62.75 | c016 | a medium close-up of the woman, not the extreme close-up of a hand |
| 62.75–70.59 | c017, c018 | a downtown street, not 79th and Lafayette; the small line under "RED LINE" is not real lettering; trousers not sent as a picture; in c018 she walks behind him and out of frame at about 69.3 s; the storefront flashes red |
| 70.59–101.96 | c019–c024 | **his own take, unchanged: camo shirt, navy cap, his closet.** No Chicago, no coat, no grill effect, no blizzard. See §5 |
| all | — | transitions play as cuts; every generated clip is 5 s (or 10 s) against a 3.92 s shot, so its head plays |

## 4 · Timing — three different things

Lyric rows (the app's own): "You don't gotta cut the lights on" 14.68–16.72; "More cameras in the whip / Than a
camera crew" 23.38–25.12; "Need a Canada goose" 26.24; "What the janitor do" 28.2; "cut the lights on" again at
63.16, 66.34, 78.86, 86.72.

1. **Factual:** none found inside the first half. The switch (c016) ends and Chicago (c017) begins at 62.75 s; the
   line lands at 63.16 s, 0.41 s later.
2. **Intentional reprise (the writer's):** c007's geese at 23.53–27.45 under the first "Canada goose".
3. **A real conflict between the treatment and the song — DECISION NEEDED:** the treatment says "The click lands with
   the vocal entrance". The vocal enters at about 14.7 s. The board puts the click at 62.75 s, on the second "cut
   the lights on", because sixteen opening shots (forest, rider, CRT, viewer) do not fit before 14.7 s. The crew,
   Maybach, geese and janitor scenes sit at 123–188 s, in the second half, while their lines are first sung at
   23–29 s under the forest.
   **RECOMMENDATION:** keep the click on the hook's "cut the lights on" and move the c016/c017 boundary 0.41 s later
   (to 63.16 s) so the light returns on the word. The alternative — the click at 14.7 s — means cutting the opening
   to about four shots. Nothing was moved.

## 5 · The wardrobe test on shot 19 (performance footage)

Rule: `CLAUDE.md` "LOCKED: Video garment-swap architecture" and `docs/VIDEO_SWAP_ARCHITECTURE.md` §5–§7 — a 2–4 s
test must hold his identity, the exact garment construction, logo placement and natural occlusion without flicker or
morphing, or the lane stops before scaling. `docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md`: an agent may not approve its own
benchmark. The garment lane was parked by the director on 1 Oct; the takeover brief of 9 Oct asks for this test.

- **Source:** 4.0 s of his take for shot 19 (take 72.673–76.677 s, song 73.526–77.53 s), the app's own cut of
  3 Oct, registered as asset `cc76f6a3`. Face, glasses, navy cap, mouth moving, arms crossing, a turn of the head.
- **Look:** none existed for the leather coat. A **draft** Look `974cb01c` was created as a record (coat `fb82c0d2`
  + Saint Laurent cap `07e6dcbe`, facts read off the two product photos, no Look-on-artist anchor, trousers left out
  because their only photo shows another jacket) — the same way the White Ice draft was made on 21 Sep.
- **Prompt:** written for this test from the registered full-look pattern, version `ib-coat-test-1-unfrozen`. It is
  **not** a frozen, approved prompt.
- **Route 1 — `grok-video-edit-proxy`** (2 pictures, $0.32 billed per the function): asset `813577a6`. His face,
  glasses, mouth, arms and the room are kept; nothing flickers across consecutive frames; arms cross over the coat
  naturally. **The coat is wrong** — a double-breasted trench with wide lapels where the real one is single-breasted
  with a small pointed collar and one row of buttons — and the cap's lettering is dark, misspelt, and changes as he
  turns. Output 720p, 24 fps, 3.71 s from a 1080p, 59.94 fps, 4.0 s source.
- **Route 2 — `runway-video-edit-proxy`, `gemini_omni_flash_1.1`** (2 pictures, $0.60 estimated): asset `e2a57572`.
  The coat is close to the real one and the cap reads SAINT LAURENT, **but it is no longer his take**: from the
  second second his arms and hands do something else, the closet behind him holds different things, and the face is
  redrawn.
- **Reading (OBSERVED, mine): FAIL on both routes.** Route 1 fails exact construction and lettering; route 2 fails
  identity and performance. Neither clip is selected anywhere; both are filed as `edited_clip` with the reading in
  their notes.
- **Not run:** the keyframe route (a Grok still of one frame of this take in the coat, then propagation — Runway
  `aleph2` takes keyframes). It needs a keyframe the director has approved first.

### 5b · The director's correction, and route 3 (added later on 10 Oct)

The director, 9 Oct 23:04 (America/Chicago), on seeing the above:

> "The performance shot was never meant to be a stand alone shot. That footage is supposed to be incorporated in some
> of the AI footage and the clothing swap is to be utilized when inputting me in the AI footage."

So routes 1 and 2 tested the wrong thing: a swap on the closet footage, to be played as a shot of its own. What he
describes is his performance put INTO the generated scene, dressed on the way in. The board already says so
(c019–c024 are `production.method: "restage"`, "Treatment wardrobe replaces the filmed clothes."), and scenes already
give those shots their outfits ("Chicago, the switch" 62.75–96.08 s → `YSL_LEATHER_COAT`; "The cold front" from
96.08 s → `YSL_JACKET`). The tool is what stops it: Restage keeps the take's clothes by construction and `route.ts`
sends a dressed performance shot to the parked garment lane.

**Route 3 — Seedance reference with the garment photographs beside the place**, two 4 s requests built by hand in
Restage's own shape through `proxy-provider-call`. Full record, prompts, ids, frames and measurements:
[`docs/research/results/2026-10-10-dressed-restage/DRESSED_RESTAGE_TEST_2026-10-10.md`](../research/results/2026-10-10-dressed-restage/DRESSED_RESTAGE_TEST_2026-10-10.md).

| | asset | identity (gate ≤ 0.25) | lip best fit (gate ≥ 0.6) | seen |
|---|---|---|---|---|
| test 1 — medium | `10382e39` | 0.159 | 0.749 (on the take's clock 0.457; about ¼ s early) | performance, place and light held; coat close; cap lettering unreadable at this size; face redrawn |
| test 2 — close-up | `90947ee2` | 0.133 | 0.675 (on the take's clock 0.586) | cap reads SAINT LAURENT, glasses kept; **the take's head turn is not followed**; no tie; face redrawn, filling the frame |

The same script on routes 1 and 2: identity 0.252 / 0.140, lip best fit 0.877 / 0.580.

**Reading (OBSERVED, mine — not a verdict):** route 3 is the only one of the three that keeps his performance, puts
him in the place and dresses him. It does not cleanly pass the kill criterion as written (construction close, not
exact; lettering only in close-up), and it regenerates the garments, which `CLAUDE.md` hard rule 2 forbids as written.
Nothing was selected; c019–c024 still play the raw take.

**The tool change is written and NOT merged:** draft PR #227, "restage: a performance shot that wears an outfit is
dressed from its garment pictures" (branch `feat/restage-dresses-from-outfit`). Three Class C reviews were run on it:
architecture REQUEST CHANGES, product REQUEST CHANGES, security APPROVE WITH CHANGES — their findings are in
`docs/reviews/RESTAGE_DRESS_CLASS_C_REVIEWS_2026-10-10.md` on that branch. As written it would refuse on these very
shots: the leather-coat outfit has four pieces, two garment pictures is all a request has been seen to take, and the
app has no control for narrowing a performance shot's pieces. It stays a draft until the decisions below are made.

**DECISIONS NEEDED (director's):**
1. Is route 3 the way c019, c020 and c024 are made — yes, no, or yes for medium/wide only? RECOMMENDATION: medium
   and wide only (c019), coat and cap as the two pictures, his own glasses left to the take; the close-ups (c020,
   c024) need a second look after he has seen test 2, and the mouth shots (c021–c023, the diamond-grill effect) are a
   different problem — an effect inside his real mouth, which no restaging keeps.
2. If yes, a dated line from him that a restaged performance may be dressed by the video model from garment
   photographs: `CLAUDE.md` hard rule 2 ("No AI-regeneration of garment imagery; pixel preservation is mandatory")
   and the LOCKED garment-swap architecture say otherwise today, and `docs/VIDEO_SWAP_ARCHITECTURE.md` requires that
   to be changed "explicit and dated in this file — never by a silent drift in runtime code".
3. If no: option (b) below is what remains.

**Still open from before the correction** — (a) stop here and leave c019–c024 as his take for now; or (b) approve one
Look-on-artist keyframe of this take in the coat and cap (an agent prepares candidates through the app's Look
composite or still route; he picks), attach the coat's back and side angles that are already on his computer, and
re-run route 1 with that anchor and route 3 (`aleph2` + keyframe) on the same 4 s; or (c) change the plan for these
shots. RECOMMENDATION: (b). On 21 Sep stating the
construction facts first took this lane's hit rate from 1 in 5 to 4 in 4 (`grokVideoEditPrompt.ts`) and every later
run used an approved anchor frame; this test already stated the facts first and still got the construction wrong, so
the anchor is the untested variable (HYPOTHESIS).

## 6 · The tool: what was wrong and what is fixed

| PR | class · review | what |
|---|---|---|
| #221 (merged) | B · one reviewer | says, before spend, when a person's or outfit's own words undo a shot's "No …" (`promptAudit.ts`); fences a screen's words; `edit.ts` writes a box the way the page does; coverage words |
| #222 (merged) | C · architecture + product + security, record in `docs/reviews/PR222_CLASS_C_REVIEWS_2026-10-10.md` | a still is drawn on the first edit model that takes all its pictures (3 on the usual one, 5 on `grok-imagine-image-2.0`); the app plans and prices with the generator's tiers and says when a still moves to the larger model |
| #224 (merged) | B · one reviewer, approve after one blocking finding | a screen whose picture is sent is not also described in words (the room came out black and white otherwise); a garment is worn front to front unless the shot says otherwise (a cap seen from behind was turned backwards) |
| #223 (open) | unclassified — see §8 | `scripts/mcp/contract.ts`: the render contract over the MCP |

VERIFIED after deploy: `world-still-proxy` answers `referenceModels` (two tiers) and `maxReferences: 3`; seven
requests with five pictures each were accepted by xAI at 2K, 9:16 (`RISK_REGISTER.md` REF-1). NOT verified: what
2.0 bills; the same shot on both models (REF-2).

Propagation chain as it stands (OBSERVED on c012–c018): treatment → scene outfit → shot `wardrobe.garments` →
planner (`planStillReferences`: screen, people, garments required; a required picture that does not fit blocks before
spend) → request (`references` by record id) → server (signs as the caller, records model, basis, estimate) → still →
clip from that still → selected playback. Pieces that are in the outfit but not on the shot's own list are **not
described in words at all** (the outfit's words say only what is under the jacket) — that is why jeans, belt,
sneakers and trousers are absent from the prompts above. Open follow-up, not built: say them in words when their
pictures cannot go.

## 7 · Spend (list prices; clip and Runway figures are estimates)

| what | count | USD |
|---|---|---|
| stills, usual model (13 requests × 2) — c001–c003, c005, c008–c011, c014, c016 | 13 | 1.82 |
| stills, `grok-imagine-image-2.0`, five pictures — c013 ×5 requests (the last a wording check for #224), c012, c017 | 7 requests, 12 candidates | 1.56 |
| clips, Kling 2.5 turbo 5 s — c001–c003, c005, c008–c012, c013, c014 ×2, c015, c016 | 14 | 4.90 |
| clip, Kling 2.5 turbo 10 s — c017 + c018 | 1 | 0.70 |
| wardrobe test — Grok video edit (billed figure from the function) | 1 | 0.32 |
| wardrobe test — Runway video edit (estimate; Control Center's own estimate is 0.50) | 1 | 0.60 |
| wardrobe test, route 3 — Seedance reference, 4 s from 4 s at 720p (the repo's token rule; Control Center's own estimate is 1.85 each; billed amount not readable) | 2 | 4.44 |
| **this session** | | **≈ 14.34** |

Against the $50 authorised: about $35.7 left counting this session alone; about $24.9 if the previous agent's 9 Oct
spend on this variation (≈ $10.71) counts too. Restaging c019, c020 and c024 by the same rule would be $3.33 each
(6 s from 6 s); all six of c019–c024, $17.75. Lovable: one deploy-only chat message (0.6 credits) and two publishes.

## 8 · Deploy state and what is open

- `main` = this record's commit on top of `347dfc2` (#224). `world-still-proxy` was redeployed from `61167c7`
  (#222) at 2026-10-10T02:42:44Z by a deploy-only Lovable message; #224 touches no edge function. Frontend
  published after #222 and again after #224.
- **PR #223** (`scripts/mcp/contract.ts` + three exports in `src/lib/queries/storyboard.ts`) is open and **not
  merged**: the change-class table lists "rendering / timelines" under Class C, and the script only *calls* the
  existing contract code. The director decides whether that is A/B (merge) or C (three reviews first).
- Owner's check, from the security review of #222: confirm in Lovable's auth settings that sign-up and
  anonymous-to-email conversion are off (RLS is open — `RISK_REGISTER.md` SEC-4).
- Follow-ups accepted in review and not built: `reveals` / `continues` links still carry the linked shot's words
  unfenced; the capability `source` string for 2.0 still reads as at merge; an explicit `quality`; a board-level
  one-model setting; flagging pieces left off earlier that now fit; words for outfit pieces whose pictures cannot go.
- Records left on the project: the draft Look `974cb01c`, the test source asset `cc76f6a3`, four test clips
  (`813577a6`, `e2a57572`, `10382e39`, `90947ee2` — each with its reading in its notes, none selected), and 30-odd
  unselected stills and clips with notes.
- The delivered cut: a 1080×1920 render (75 MB) was made and could not be handed over in the session (30 MiB
  limit); the director has the 720p copy of the same render. In the app the same cut plays at
  `/projects/764a63d2-93cd-44f3-905f-292f14ab2f51/review`.

## 9 · After the director's directive of 10 Oct 00:18 CT, and the pause at 00:38 CT

**State of the cut: partially repaired.** Not "repaired through shot 18". Unfinished windows, exactly:

| time (s) | shots | state |
|---|---|---|
| 3.92–7.84 | c002 | aerial monogram is tens of metres across, not forest-scale. Words changed and a place record added; **no new picture drawn (paused)** |
| 39.22–43.14 | c011 | television housing and room do not match c012–c015. **Paused** |
| 54.9–58.82 | c015 | unwanted white object in his hand; the lamp never goes out in the clip. **Paused** |
| 58.82–62.75 | c016 | a medium close-up of the woman with her face, not a hand at a wall switch flipping it. **Paused** |
| 62.75–70.59 | c017, c018 | a downtown street with invented lettering, not 79th and Lafayette. Place record made, two candidate pictures drawn, **neither approved, no shot touched (paused)** |
| 70.59–101.96 | c019–c024 | his raw take in the closet. Both tests of putting him in the scene **failed** (below) |
| 11.76–15.69, 19.61–27.45 | c004, c006, c007 | never worked on in this takeover; not reviewed at playback speed |

**The two performance tests: failed for production acceptance (the director's verdict).** Both assets are marked
rejected with the verdict in their notes; neither is selected. Against his five tests:

| | test 1 (medium, `10382e39`) | test 2 (close-up, `90947ee2`) |
|---|---|---|
| identity | redrawn face (0.159 from the take; inside the tool's 0.25 gate, and still not his face as filmed) — **fail** | redrawn face (0.133) — **fail** |
| glasses | kept from the take; no picture of them was sent | kept from the take |
| original movement | poses, arm crosses and head turn followed | **fail** — the head turn between 0.9 s and 2.4 s is not followed (measured about 0 throughout) |
| lip sync | **fail** — mouth open from the first frame; two to five times wider than his at 2.9–3.5 s; 0.457 on the take's clock | 0.586 on the clock, under the 0.6 gate; not judged by ear |
| wardrobe | coat close but hip length and the lapel shifts; cap lettering unreadable; trousers not sent | cap reads SAINT LAURENT; collar leather; no tie |

Lip sync by ear is UNVERIFIED for both: no agent can hear. Three-way videos with the song (real speed and half
speed) were prepared for the director.

**Treatment check (VERIFIED, treatment version 2 of 8 Oct).** "Fendi sits in his exact YSL denim look, watching."
There is no walk-in in the treatment. It exists only in c012's camera note, labelled "Director (8 Oct)". Starting
seated is therefore not a defect; whether that note is his is a question for him. Also verified there: "A close-up
reveals another woman's hand at a wall switch. She flips it." and "Fendi occupies the same position in the frame,
now standing at 79th and Lafayette by the Red Line".

**Board changes made before the pause (all reversible; originals in the session's `ORIGINALS.md`):**

- Three place records on candidate 5: `THE_FOREST_FROM_THE_AIR` (`e148b99f`, approved picture = c001's keyframe),
  `THE_VIEWING_ROOM` (`535ea025`, approved picture = c012's keyframe), `SEVENTY_NINTH_AND_LAFAYETTE` (`dd265ca9`,
  **no approved picture**; two candidates filed with it).
- c002: place set to `THE_FOREST_FROM_THE_AIR` and the frame words rewritten for scale. Its selected picture and clip
  are unchanged; the previous words are in the shot's history.
- 79th and Lafayette is described from published facts (chicago-l.org, Wikipedia): the station sits in the median of
  the Dan Ryan Expressway with an island platform; the station house is on the south side of 79th Street — white
  steel frame, floor-to-ceiling glass, red bands, an eyebrow canopy; there is **no elevated structure** at this
  corner. The earlier c019 plates show an El overhead, which is wrong for this place. No photograph of the real
  corner was used; one from the director would make it exact.

**The realism reference (the director's screen recording, 10 Oct 00:33).** Two posts, 49.5 s, 28 cuts, median shot
1.5 s. OBSERVED from frames at 2 per second, not at playback speed and without sound: 4:3 frame inside a fisheye
vignette; soft, low-resolution tape/telecine texture with grain, halation and star flares; warm late-sun and
tungsten light with blown windows and dust haze; handheld, wide and close to faces, with motion blur. Ordinary
places and ordinary-looking people, with one impossible thing per shot staged as if it were practical, and one clear
physical action per shot. Which model made it is not shown. AVT's look words ask for the opposite ("Arri Alexa 65…
high dynamic range… rich micro-contrast", sharp 2K, 9:16), which is what makes the forest and Chicago shots read as
rendered. HYPOTHESIS, to be tested by the comparison: the look words and the short, single-action shot matter at
least as much as which image model draws the still.

**Switch timing.** Three 12-second previews with the song and a burned-in clock were prepared: the cut on the first
vocal (14.68 s), on the hook's word (63.16 s), and as the board is now (62.75 s). Nothing was moved.

**Paused by the director at 00:38 CT:** all new paid generation. Spend and jobs: `docs/LEDGER_IB_FIRST_HALF_2026-10-10.md`.


### 9b · The bounded comparison the director then authorized (10 Oct 01:09 CT)

One shot (c009, rider in profile), one shared scene text, eight stills: four from xAI through `world-still-proxy`
with the approved rider picture, four from Higgsfield's web app through the Claude connector (`soul_cinema_studio`;
an exception he granted for this experiment only). All eight were shown to him anonymously as A–H and are filed in
AVT as unselected tests. OBSERVED: with the rider picture attached the Higgsfield model returned a studio portrait
twice (no horse, forest or fire); from text alone it drew the scene with a different woman. VERIFIED from
Higgsfield's docs: the key-based API runs Soul Cinema as text plus an optional trained character id, with no picture
input, and Control Center's allowlist has no Soul model. No motion test has been run — the two clips wait for his
choice. Record and answer key: project doc `claude/avt-realism-comparison-2026-10-10.md`. Spend: ledger section D.

The working machine was recycled at about 00:58 CT. The three switch-timing previews and the three-way performance
videos were rebuilt from the selected clips, the song and the delivered side-by-sides, and sent to him at about 01:21 and
01:27 CT. The local merge of main into #227's branch was lost and has to be redone when that rework starts.
