# HANDOFF → Claude Code: a shot that shows more than one picture (the "Ledger" split) (9 Nov 2026)

**From:** Claude (cloud session) · **For:** Claude Code on AVT, and Fendi.
**Decision (Fendi, 9 Nov 2026):** the next video is the full song "P&L", built on one idea: "the profit on top with the
loss on the bottom", his head at the line between them. "We will need to create two images for each scene and either
you edit them top and bottom, or build in the capacity to edit the top bottom ledger inside AVT or have grokbot do it at
the end." RECOMMENDATION accepted in chat: build it into AVT, so a pair is judged stacked on the board before either
half is accepted. He then said: "lets send over a handoff to claude code."

Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION. Nothing here was run. Every statement about
the code was read on `main` at `4b918ba`.

## 1. The project this serves (VERIFIED: rows written today through the AVT MCP)

| | |
|--|--|
| Project | `video_projects` `06965087-695a-48f2-b986-43220053ca5f`, title "P&L", 9:16 |
| Active variation | `video_variations` `7f1e0561-b39e-42ee-9f82-04fd627cc05b`, "The Ledger"; the treatment is in `treatment_json.treatment.text` |
| Song | `project_assets` `ed42153c-67f4-4d27-8547-92ae1e73f00d`, 140.0 s, sha256 `a5768e4d…0962522` |
| Shots | none yet. Lyrics are on the project row, not timed |

The treatment describes every scene as a pair: a Profit picture (top half), a Loss picture (bottom half), one "bridge"
element that crosses the line, and one of three ways his head appears. At the hook the split gives way to one full
frame, then returns. So the layout is per shot, not per project.

## 2. What the code shows today (VERIFIED by reading, `4b918ba`)

- **A shot shows one picture.** `src/lib/storyboard/media.ts` picks one primary assignment per shot ("one primary at
  most: the most recently set wins", line ~269). `shot_asset_assignments` has `is_primary`, no notion of where in the
  frame an asset sits.
- **Review and the render are one truth.** `src/lib/storyboard/renderContract.ts` (version 3) writes down, per output
  frame, what `SequencePlayer` shows; `renderContract.test.ts` holds the two equal at 10, 24 and 30 fps.
  `scripts/render/render_contract.py` executes the contract with ffmpeg and refuses anything it cannot execute
  (`frame.fit` other than `contain`, line ~55).
- **The only per-shot picture edit is the punch-in.** `override_json.reframe = {scale, x, y}`
  (`src/lib/storyboard/reframe.ts`), carried as `segment.reframe` in the contract.
- **The frame never crops.** `src/lib/project/aspect.ts`: media is fitted whole (`contain`); cropping is "an edit
  decision, not a default". Project aspects are 9:16, 16:9, 1:1, 4:5.
- **Generation asks for the project's shape.** `world-still-proxy` defaults `aspectRatio` to `"9:16"` (line ~175).
- **A second cut path exists.** `edit_sequences` / `edit_clips` / `edit-render` (`_shared/editModel.ts`,
  `scripts/edit-render.mjs`). Not read in depth for this handoff.
- `supabase/functions/avt-mcp/contract.ts` describes `override_json.reframe` to agents; PR #223 (open) builds the
  render contract outside the browser.

## 3. The ask

Build a general frame layout, of which the Ledger is one saved arrangement. Fendi's standing rule applies: the change
must work for any future video, with no hard-coding for this project (no "ledger" branch, no P&L ids in code).

### Part 1 — panels: a shot can show several pictures, each in its own part of the frame

1. **Layout on the shot.** An additive field in `ShotSpecSchema` whose default parses every existing `spec_json`
   unchanged: a list of panels, each a key and a rectangle in fractions of the frame, plus how the edge between
   panels is drawn (hard, or feathered over a stated width). One panel covering the frame is today's behaviour.
   Top/bottom halves is the arrangement P&L uses; side by side or thirds must need no new code.
2. **A default on the variation, an exception on the shot.** The variation carries the layout most shots use; a shot
   may override it (the hook is full frame). Same pattern as a scene's outfit and a shot's exception.
3. **Which asset is in which panel.** An assignment names its panel; "primary" becomes one per shot, variation and
   panel. A null panel means the whole frame, so every existing row keeps its meaning. This is a migration: Lovable
   SQL editor only.
4. **The punch-in is per panel.** Today's `override_json.reframe` keeps meaning "the whole-frame panel".
5. **How a picture sits in its panel.** A half of a 9:16 frame is 1080 × 960 (9:8). No generator offers 9:8, so a 1:1
   or 16:9 picture fitted whole leaves bars inside the panel. The panel therefore needs a stated fit (`contain` or a
   fill that crops), recorded as the edit decision `aspect.ts` says cropping must be. The renderer's refusal of
   anything but `contain` has to become a refusal of anything the contract does not state.
6. **Generation asks for the panel's shape.** A still or clip made for a panel requests the supported aspect nearest
   the panel's rectangle, not the project's. The confirm dialog says which shape is being asked for.
7. **The board and Review show the frame as it will render.** The card shows the panels stacked; Review plays every
   panel in step on the song clock.
8. **Render contract version 4.** Each segment lists its panels (rectangle, media, frames, picture runs, reframe,
   fit) and the edge treatment. Version 3 contracts still execute and mean what they meant. `reviewFrameAt` and
   `contractFrameAt` are extended per panel and the parity test covers split shots. `render_contract.py` composes
   the panels; the feathered edge is a stated gradient, not a renderer's choice.
9. **Keep the agent-facing description in step:** `avt-mcp/contract.ts`, and the `avt_upload_asset` filing recipe
   (it tells agents how to swap a primary; that recipe needs the panel).

### Part 2 — a layer over the panels: his real take, cut out and blended

His head is a performance take laid over the panels. It must be data on the shot, not a hand composite:

- **Source:** the synced take through `performance_syncs`, the song window derived as it is today, never stretched.
- **Matte:** an alpha matte of his head for that take (the repo has `matte-video-proxy` and `sam3-segment-proxy`).
- **Placement:** rectangle, scale and rotation in fractions of the frame.
- **Blend and grade:** opacity, a blend mode from a short fixed list, saturation and tint. Three saved arrangements
  are needed for P&L, as data: a band of his eyes and mouth across the middle; his face very large over a panel; his
  profile as a window with the panels showing inside its shape.
- **A protected region:** a stated area (his mouth) that stays fully opaque in every mode.

Hard rules for Part 2 (CLAUDE.md and `docs/SHOT_RULES.md`): the layer is the take's own pixels; no generative pass, no
lip-sync, no warp of his face; mouth timing is the take's; provenance stays `camera`.

### Order

Part 1 first, on its own PR. Part 2 after Fendi has seen a hand-made proof of the look (section 6). Do not start
Part 2's presets before that proof is judged; the blend list depends on it.

## 4. Classification (RECOMMENDATION; escalate if you read it differently)

`docs/ARCHITECTURE_REVIEW.md`: Rendering and Timelines are Class C. The render contract, the renderer and the
assignment model are those surfaces, so **Part 1 is Class C** (architecture, product and security sign-off), and
**Part 2 is Class C** (compositing). The schema defaults and the card UI alone would be Class B, but they are not
separable from the contract change. Item 6 changes a provider request's parameters: treat it as Class C with the rest.

## 5. Verification (expected values; a cheap command for each)

| Check | Expected |
|--|--|
| Every shot of YSL variation `c067efb9-90af-418e-aa6d-58834f6e19de` parsed before and after the schema change | identical parsed output; zero differences |
| `render_contract.py --plan` on a version 3 contract of YSL, before and after | the ffmpeg plan is byte-identical |
| Parity test with split shots at 10, 24, 30 fps | `contractFrameAt` equals `reviewFrameAt` for every panel at every frame |
| Fixture render: a solid red clip in the top panel, solid blue in the bottom, 1080 × 1920, hard edge | pixel (540, 479) is red; pixel (540, 480) is blue |
| Same fixture, feathered edge of a stated width | row 480 is a red-blue mix; rows outside the width are pure |
| Same fixture, one shot overridden to a single full panel | that shot's frames are one colour edge to edge |
| A 1:1 source in a 9:8 panel with fit `contain` | bars inside the panel, picture whole |
| The same with the fill fit | no bars; the crop equals the stated rectangle |
| Two assignments set primary in two panels of one shot | both show; setting a third primary in the top panel demotes only the top one |
| Tests | reported by category per `docs/TEST_TAXONOMY.md` |

On the P&L project itself: one shot on variation `7f1e0561…` with any two existing stills assigned top and bottom
plays stacked in Review, and its exported `storyboard_timeline.json` is version 4 with two panels on that segment.
Use test stills; do not generate.

## 6. What Claude (this session) is doing in parallel, so nothing is done twice

- The treatment and the project rows above.
- Timing the lyrics, then the storyboard: one shot per pair, with the pair, its bridge and his head mode written
  into the shot notes until the fields exist.
- A hand-made proof of one pair (the supercar exhaust over the war zone), stacked with a hard and a feathered edge,
  for Fendi to choose the default edge. It is a look test, not a production path, and it will be quoted before any
  paid call.
- Fendi is shooting the head takes (full song, front-on and left profile, plain backdrop, constant light).

## 7. What not to do

- No standalone Supabase, CLI or service role. SQL in Lovable's editor; Publish and edge redeploys through Lovable,
  each named.
- No code through the Lovable chat agent.
- Do not crop footage by default, and do not change what a version 3 contract means.
- Do not composite, restyle or regenerate his face with a model. Part 2 is deterministic compositing of the take.
- Do not hard-code a top/bottom split, a 50/50 line, or anything keyed to this project.
- Do not generate stills or clips for this work. Fixtures are solid colours and existing test assets.
- Do not edit Control Center.

## 8. What to report back

- The PR numbers, the class you assigned, and who signed off.
- The fixture results of section 5 as posted frames, and the test counts by category.
- The migration text that was run in Lovable's SQL editor, and what was published and redeployed, by name.
- Whether the `edit_sequences` cut path needs the same layout, and why or why not.
- Anything in this handoff the code contradicts.

## 9. Not known yet (listed here, not guessed)

- The default edge between panels (hard or feathered): Fendi's choice after the proof in section 6.
- The blend modes Part 2 needs beyond normal opacity: depends on the same proof.
- The frame rate of the final cut and of his takes.
- Whether Grokbot or the app's renderer makes the delivered file. The contract must be sufficient for either.
- PR #471 (the build skill, `docs/STORYBOARD_INTENT.md`, `docs/capability/`) is open and not on `main`; the storyboard
  intent fields it proposes for `shotSpec.ts` touch the same schema. Sequence the two so they do not conflict.
