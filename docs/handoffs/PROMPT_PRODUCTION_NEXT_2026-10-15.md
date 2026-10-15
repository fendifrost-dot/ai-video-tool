# Prompt for the next agent — finishing "YSL Ice On" (15 Oct 2026, late)

Copy everything below the line into the next session.

---

You are continuing AVT (repo `fendifrost-dot/ai-video-tool`, Lovable Supabase `qoyxgnkvjukovkrvdaiq`, Lovable project
`bd21b544-c7b8-4780-bdde-391ac9d4bfa8`). Read `CLAUDE.md` first. Lovable is the only SQL and deploy path. Post every
generated clip and still into the chat as soon as it exists. Spend: Fendi said "No cap" on 15 Oct, but every paid call
still goes in `docs/LEDGER_YSL_TESTING_BUDGET.md` with its basis.

## Fendi's production order (15 Oct) and where each step stands

| # | Step | State | Evidence |
|---|---|---|---|
| 1 | Treatment and lyric timing | DONE on candidate 6 `358363e6-33ba-48e0-bd88-e80b57ac6b3c` (100 shots, 1.5–3 s, cuts on beats; lyric line 52 re-timed; sections/hooks/drops) | `docs/review/production_2026-10-15/PHASE1_TREATMENT_AND_RECUT.md` §0 |
| 2 | Cast and outfits | DONE as data: Mastic jacket + beige/ivory cap for "Chicago, the switch" (70.85–100.36); lambskin coat + Y Varsity cap for "The cold front" (100.36–121.99); trench + confetti shirt + bucket hat for "The clean entrance" (163.31–182.98) | `variation_scenes` for candidate 6; `ib_looks_by_scene/decisions.json` |
| 3 | Shot plan and performance selection | Candidate 6 marks performance shots c041–c047 (Chicago), c048–c054 (grill ECUs), c055–c066 (cold front), c085–c093 (clean entrance). 22 clips carried from candidate 5 (0–70.85 s). | same report, §C |
| 4 | Generate scene assets | NOT STARTED for 70.85–201.87 s. Plate prompt recipe is written: `docs/recipes/PLATE_REALISM_PROMPT.md` (Fendi: "they need to look real"). Two realism plates for c019/c041 exist as unselected stills (`ac967864`, `41b304e7` Grok; `d25795c3` Gemini). | world-still-proxy rows |
| 5 | Process only selected performance segments | TOOL BUILT AND LIVE: "Dress this shot" (PR #260, merged `c9b24b2`, `provider-jobs-tick`/`ingest-provider-job`/`avt-mcp` redeployed, frontend published). The approved swap is filed on candidate 6 c042 as an alternate (asset `6eea726d`). | `docs/recipes/DRESS_AND_INSERT_WORKFLOW.md` "Live verification" |
| 6 | Integrate and finish | METHOD VALIDATED ON ONE CLIP, NOT YET IN THE TOOL: Runway `remove_video_background` matte + ffmpeg composite over a realism plate (key gradient, inner-edge light wrap, plate defocus, grain). Posted to Fendi 15 Oct; no verdict yet. Restage is NOT an approved production method. | `PLATE_REALISM_PROMPT.md` last section; scratch recipe in this session only |
| 7 | Review the assembled sequence | NOT STARTED. No timeline rows for candidate 6. | — |

## Verify first (cheap)

1. **Live build:** crawl `https://aivideotool.lovable.app/projects` chunks (keep the `projects._id.` prefix in chunk
   names — a crawler that strips it fetches 404 pages) and grep for `Dress this shot` (storyboard chunk) and
   `Pace and clip lengths` (treatment chunk). Both present on 15 Oct 04:35 UTC.
2. **Tick live:** unauthenticated POST to `/functions/v1/provider-jobs-tick` → 401.
3. **The filed swap:** `avt_select project_assets id=6eea726d-a243-478a-8f4e-09f5b5665b77` → `metadata_json.conformed_duration`
   = 4.0039, `derived_from.method = dressed`; `shot_asset_assignments` on shot `928ff526…` has it with `is_primary = false`.
4. **Candidate 6 timing:** 100 shots, the app conform planner reports 0 moves.

## Open decisions (Fendi's; defaults the agent will use if he says nothing)

1. **The switch timing.** The treatment puts the lights-back-on at the vocal entrance (61.01 s); the writer put it at
   72.33 s. Default: keep the writer's placement for now (the approved swap already sits in it); offer one ≈$0.06 pinned
   writer run as candidate 7 only if Fendi wants the switch on the vocal.
2. **The denim look's cap.** It still wears the Y Varsity cap (now also the coat's). Default: leave; the khaki Cassandre cap
   is unused. Changing it would outdate 3 locked viewer boxes.
3. **17 early shots with no media** (c003, c006, c009, c011, c013, c015, c019, c020, c021, c024, c027, c029, c030, c031,
   c033, c036, c038): they straddle candidate-5 cuts. Default: generate them with the realism recipe (≈$0.5 each still+clip).

## Next work, in order

1. **Plates for every performance shot** (c041–c047 Chicago, c055–c066 cold front, c085–c093 clean entrance): one realism
   plate per location designed around the take's camera (chest height, straight on, warm key camera-right). Use
   `world-still-proxy` with `promptVersion plate-real-v2-…`, n=2 at 1k ($0.14 per pair). File unselected.
2. **Dress the performance windows** with the in-app action (or `dressBox` through the MCP): group adjacent 1.5–2 s shots
   so one 4 s Genjutsu run ($2.72) covers 2–3 shots; cold front needs the coat outfit, clean entrance the trench.
3. **Composite** each dressed window over its plate (matte + ffmpeg as in the recipe); file as `edited_clip` with
   `derived_from.method = composite` and a derived sync (see `scripts/qa/composite_register.py` for the row shape); put it
   on the shot as an alternate. Build this into the tool as a lane only after Fendi passes the first two.
4. **AI B-roll** for the non-performance shots 70.85–201.87 s: still-first (realism recipe) then image-to-video through the
   app's `generateBoxClip` route.
5. **Assemble** candidate 6 into a timeline and post a playable sequence (the song audio) to Fendi.

## Do not

- Do not scale a route Fendi has not passed on a short clip (composite is pending his verdict).
- Do not restage (not approved). Do not overwrite or unselect a chosen clip; alternates only.
- Do not edit a migration or a job row to make a check pass; a failing check is the finding.
- Do not commit media showing Fendi or the song; the repo is public.

## Report back

The four checks above with their output; every paid call with its basis; which of the open decisions Fendi answered;
any PR. End by writing the next prompt.
