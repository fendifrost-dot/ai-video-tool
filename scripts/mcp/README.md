# The MCP driver — AVT's own generation flows, run by an AI through the AVT MCP

`avt-mcp` lets an outside AI (Claude, ChatGPT, Grok) read AVT's tables and call its edge functions as the owner.
It does not know how the app composes a shot's still request — the prompt from the spec and the look preset, the
cast and continuity words, the link lines, the reference pictures by record id, the job row that records all of it,
the assignment that puts the picture on the box. That is `src/lib/storyboard/generate.ts` and
`src/lib/worldBatch/runner.ts`, written for the signed-in browser.

This driver runs those same functions outside the browser with the AI as the transport. Every effect the app would
perform (insert a job row, call the generator, update the job, find the filed pictures, put them on the box) is
turned into a **pending request** the AI performs with the MCP tools (`avt_insert`, `avt_call`, `avt_update`,
`avt_select`), whose answer the AI writes back; the script then replays to the next effect. Nothing here invents a
prompt or a table write of its own: the app's code decides, the AI only carries.

```
npx tsx scripts/mcp/still.ts <workdir> bundle      # what to fetch (tables, filters) → fetch with avt_select into <workdir>/bundle/*.json
npx tsx scripts/mcp/still.ts <workdir> entity <KEY>  # reference pictures of a continuity entity
npx tsx scripts/mcp/still.ts <workdir> shot <c0NN>   # the still of a storyboard box
npx tsx scripts/mcp/still.ts <workdir> clip <c0NN>   # the clip of a storyboard box, from its selected image
npx tsx scripts/mcp/edit.ts <workdir> <c0NN> <patch.json>   # a director's edit of one box: the one avt_update to perform
npx tsx scripts/mcp/contract.ts <workdir> [<songIn> <songOut>]   # the render contract of the board, for scripts/render
```

Each run prints either `DONE {...}` or `PENDING {id, tool, args}`; the AI performs the tool call and writes the answer
to `<workdir>/answers/<id>.json`, then runs the same command again. Answers are keyed by the effect's position and
content, so a replay is deterministic and nothing is paid twice.

Answers are matched on the effect's content with `updated_at` stamps left out, so a replay of an assignment update
(the app stamps `updated_at: now` on it) finds its answer instead of asking again. `bundle` after an edit to a shot,
an entity or the board's pictures: the driver reads only its bundle, so a stale one builds a stale request.

What a shot wears is resolved as the page does (src/lib/wardrobe/outfits.ts): the shot's own pieces, else its scene's
outfit (`bundle/scenes.json`, from `variation_scenes`), whose words go on his line and whose record (key, version,
the pieces actually sent) is kept on the job as `settings.outfit`. A scene naming an outfit this video lacks stops
the shot. Re-`bundle` after changing an outfit, a scene or a shot's pieces.

Seen on the first board run through it (IB candidate 5, 8 Oct 2026): the server finalizer (`provider-jobs-tick`)
attaches a still job's pictures itself, unselected, two minutes after the generator recorded them — when the AI is
slower than that between the generator's answer and the attach effects, the driver's inserts collide with the
finalizer's rows (`shot_id, asset_id, role` is unique). Apply the attach effects as upserts (insert where missing,
else set `is_primary`), the way the finalizer does.

## Editing a box (`edit.ts`)

A box's row holds what the writer wrote (`generated_json`), what the director changed (`override_json`) and what
every reader uses (`spec_json`, derived from the two, with the legacy text columns beside it). An `avt_update` that
writes `override_json` alone leaves the other columns saying the old thing — it happened by hand on 9 Oct 2026.
`edit.ts` computes the write with the app's own `editedOverride` and `applyOverride`, so an edit carried over the MCP
is the write the page would make: a field the patch changes becomes the director's, and inside `continuity` (place,
props, links, garments, outfit, production) and `cast` the patch sets the keys it names and keeps the rest. It prints
only the columns that change and updates the bundle's row; copy the row's new `updated_at` from the answer into
`bundle/shots.json` before generating, because a job records the `updated_at` of the shot it was made from.

`applyOverride` locks an edited box, as the page does. A box the director had deliberately left unlocked stays that
way only if `locked` is left out of the update — say which you did.

## The cut the board plays (`contract.ts`)

`contract.ts` runs `buildTimeline` and `renderContract` — the two functions the Export page runs — over the bundle and
writes `storyboard_timeline.json`, the file `scripts/render/render_contract.py` turns into an MP4. It needs two files
beside the still bundle: `bundle/syncs.json` (the project's `performance_syncs` rows) and `bundle/song.json` (the
newest `project_assets` row of type `audio`). `media.need.json` lists every file the contract names; fill each with a
local path or a signed URL and pass it as `--media`. A shot with nothing selected shows what the storyboard shows
there (the synced take, or nothing): the driver reports it, it does not choose for it.

## What every request is checked for

`boxShot` (src/lib/storyboard/generate.ts) composes the prompt for the page, the request preview and this driver
alike. A name the shot's own words forbid ("No visible ACME lettering.") that a place's or a character's own
description then asks for stops the request there, with both sentences in the message (promptAudit.ts) — the entity's
words are the same in every shot, so they cannot bend to one shot's correction. The check holds names only; read the
prompt the driver prints before the first paid call of a board all the same.
