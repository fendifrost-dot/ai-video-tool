# Prompt for the next agent — treatment timing from lyrics and BPM, after beat grid v2 (14 Oct 2026)

Copy everything below the line into the next session.

---

You are continuing AVT's "the treatment decides clip timing from the lyrics and BPM" work (repo
`fendifrost-dot/ai-video-tool`, Lovable Supabase `qoyxgnkvjukovkrvdaiq`, Lovable project
`bd21b544-c7b8-4780-bdde-391ac9d4bfa8`). Read `CLAUDE.md` first: Lovable is the only SQL and deploy path, and every
generated clip or still is posted into the chat with Fendi as soon as it exists.

Fendi, 14 Oct: "our treatment should reflect based on lyrics and bpm to outline exactly how short each clip should be
trimmed down and where it should fit." Five steps were proposed and steps 1–2 are done.

## Done (on main)

| Item | State | Evidence |
|---|---|---|
| Analyzer v2: refined tempo, beat phase, downbeat | merged `0365fcd` (PR #253), frontend publish requested | `docs/review/beat_grid_2026-10-14/README.md` |
| Grid cuts on measured downbeats; cut within one beat of a trusted lyric line start moves onto its beat | merged `0365fcd` | `grid.test.ts`, dry run `grid_v2_dryrun.json` (6 lyric-moved cuts) |
| "YSL Ice On" analysis row `4769e2c8` updated to the v2 map | written 14 Oct 06:30 UTC via the AVT MCP | 121.998 BPM, 411 beats, provider `web-audio-builtin-v2-downbeat-uncertain`; rollback copy `song_analysis_v1_before.json` |
| Reviews | architecture: approve with fixes (applied); security: approve | README "Reviews" |
| M5 placed | alternate (not selected) on shot 14, assignment `3b71f61b` | the 13 Oct approved clip `51519b24` stays selected |

## Verify first (cheap)

1. `avt_select song_analyses id=4769e2c8-3fcc-44d0-9ee5-3b08cefa7d3c`: `bpm` = 121.998 and `analysis_provider` =
   `web-audio-builtin-v2-downbeat-uncertain`. A value of 122.4 means it was rolled back or overwritten (someone pressed
   Analyse with an old build); restore from `song_analysis_v2_proposed.json`, or re-run Analyse on the published app.
2. Load `https://aivideotool.lovable.app` assets and grep for `downbeat-uncertain`. If it's absent, the frontend isn't
   published; publish through the Lovable `deploy_project` tool.

## Open decision (Fendi's)

- **Where is the "1"?** Beats 1 and 3 nearly tie (3.3% lead). The bar lines may be half a bar off. Ask Fendi to tap
  along or say whether the hook "You don't gotta" starts on the 1. If it's the other position, set
  `firstBeat = 0.029 + 2 × 60/121.998` and re-project the map with `projectBeats`.
- **Re-cut the current board onto the real beat?** Its 46 cuts sit median 0.13 s and up to 0.25 s off the beat. Moving
  them changes approved shots' windows, so it is his call. Do not move them without it.

## Next steps (3–5 of the plan)

3. Let the treatment ask for short shots: half-bar and one-beat cuts (≈0.49 s) where energy or a lyric calls for a
   flash cut (the grid minimum is 2.5 s today).
4. Generate each clip at its slot length on routes that allow it (Grok takes 1–15 s), and on fixed-length routes pick
   the clip's in-point automatically instead of frame 0 (`shot_asset_assignments.source_in_seconds` is already honoured
   by Review and the render).
5. Check before render: every cut within one frame of a beat and no cut splitting a lyric line (plan item C4).

Each is Class B or C under `docs/ARCHITECTURE_REVIEW.md`. Get an independent review for each and record it in the PR.

## Do not

- Do not overwrite the selected clip on any shot. Add alternates only.
- Do not re-cut existing boards without Fendi.
- Do not mark anything verified from tests alone. Cite the live row or the published bundle.

## Report back

What changed, the PR and commit, the live checks above with their output, and anything Fendi has to decide. End by
writing the next prompt in `docs/handoffs/`.
