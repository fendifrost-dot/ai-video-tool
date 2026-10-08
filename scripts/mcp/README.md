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
```

Each run prints either `DONE {...}` or `PENDING {id, tool, args}`; the AI performs the tool call and writes the answer
to `<workdir>/answers/<id>.json`, then runs the same command again. Answers are keyed by the effect's position and
content, so a replay is deterministic and nothing is paid twice.

Answers are matched on the effect's content with `updated_at` stamps left out, so a replay of an assignment update
(the app stamps `updated_at: now` on it) finds its answer instead of asking again. `bundle` after an edit to a shot,
an entity or the board's pictures: the driver reads only its bundle, so a stale one builds a stale request.

Seen on the first board run through it (IB candidate 5, 8 Oct 2026): the server finalizer (`provider-jobs-tick`)
attaches a still job's pictures itself, unselected, two minutes after the generator recorded them — when the AI is
slower than that between the generator's answer and the attach effects, the driver's inserts collide with the
finalizer's rows (`shot_id, asset_id, role` is unique). Apply the attach effects as upserts (insert where missing,
else set `is_primary`), the way the finalizer does.
