# Prompt for the next agent — boards conform to each song's beat (14 Oct 2026, late)

Copy everything below the line into the next session.

---

You are continuing AVT's beat-timing work (repo `fendifrost-dot/ai-video-tool`, Lovable Supabase `qoyxgnkvjukovkrvdaiq`,
Lovable project `bd21b544-c7b8-4780-bdde-391ac9d4bfa8`). Read `CLAUDE.md` first. Lovable is the only SQL and deploy
path. Post every generated clip or still into the chat with Fendi as soon as it exists.

Fendi, 14 Oct: "the board should be cut to the real beat of EACH song so not just a fix for this song but for each new
song the tool should conform". This is a product DECISION, and it is now in code.

## Done

| Item | State | Evidence |
|---|---|---|
| Conform planner + auto-conform after analysis + "Snap boards to the beat" button | merged `9582ec8` (PR #255) | `src/lib/storyboard/conform.ts`, 15 tests; architecture APPROVE at b741131 after F1/F2; security approve |
| YSL Ice On (project `764a63d2`): all 6 boards conformed | written 14 Oct ~23:00 UTC via Lovable `query_database`, one guarded statement | returned `updated = 266`; SQL `docs/review/beat_grid_2026-10-14/conform_ysl_applied.sql` |
| Post-write check (OBSERVED, from live rows re-read after the write) | 266/266 rows carry a `conform` history entry with `from` | re-running the planner on the live rows gives 0 moves on every board, with no gaps or overlaps |
| Cuts on downbeats | 257 of 260 inner cuts sit on a measured downbeat | the other 3 are board `86fe511a` shots 45/46/47, which were mid-bar cuts on the old board and now sit on beat 3 (they keep their beat counts) |
| Rollback copy | the timing and history of all 266 rows before the write | `docs/review/beat_grid_2026-10-14/conform_ysl_rollback_snapshot.json` |
| Frontend publish | `deploy_project` called twice. **The first build did NOT contain the conform code; the bundle was checked.** The second one is live (OBSERVED 14 Oct ~23:10 UTC) | `SongAnalysisCard-CkeTgmVa.js` has "Snap boards to the beat"; `storyboard-0h9XL1Oz.js` has the F1/F2 constants (`.985`, `1.015`, `.8*…length`) |

## Verify first (cheap)

1. **Published bundle.**
   - Crawl `https://aivideotool.lovable.app` chunks with `Accept-Encoding: identity` and grep for `Snap boards to the beat`.
   - Absent means the frontend is not live. Publish with Lovable `deploy_project` and re-check.
   - `downbeat-uncertain` alone does not prove anything: it shipped with #253.
2. **Live board timing.**
   - Run `select count(*) from shots where project_id='764a63d2-93cd-44f3-905f-292f14ab2f51' and spec_key is not null and history_json @> '[{"event":"conform"}]'`.
   - Expect exactly **266**. A lower number means someone rewrote boxes since. Find out what changed before re-snapping.
3. **Song analysis row.**
   - Check `song_analyses` for project `764a63d2`.
   - Expect `bpm = 121.998`, `analysis_provider = web-audio-builtin-v2-downbeat-uncertain`, and 411 beats starting at `t = 0.029`.

## Open decision (Fendi's)

**Where is the "1"?**
- Beats 1 and 3 nearly tie (margin 0.033). Fendi was asked: **A**, the strong 1 is at 0:00 (the current map), or **B**, it is about a second in.
- If **B**:
  1. Re-project the map with `projectBeats(121.998, 201.8743125, 0.029 + 2 × 60/121.998)` and write it to `song_analyses`.
  2. Put the boards back on their pre-conform windows, either from each shot's `conform` history entry `from` or from the rollback snapshot.
  3. Run the conform again. The planner will not move an already-conformed board (it is idempotent by design), so step 2 is required.
  4. Expect every cut to move by about 0.98 s (two beats).
- Do not do this without Fendi's answer.

## Known limits (from review, non-blocking)

- **Songs with a pickup of about one beat.** An old board cut before analysis falls back to NEAREST for the whole board, because the all-or-nothing rule rejects the rebase. Cuts land on beats, within 0.6 of a beat, but can change bar phase partway through the song. YSL has no pickup. New boards are cut on the measured grid and are not affected.
- **Who sees the board change.** The auto-conform runs in the browser of whoever presses Analyse. Boards change without a preview; the toast reports how many shots moved and the largest move.

## Next steps (plan 3–5, unchanged)

3. Flash cuts: half-bar and one-beat cuts where energy or a lyric calls for them. The grid minimum is 2.5 s today.
4. Generate each clip at its slot length (Grok allows 1–15 s). On fixed-length routes, pick the in-point automatically (`shot_asset_assignments.source_in_seconds`).
5. A pre-render check: every cut within one frame of a beat, and no cut splitting a lyric line.

Each step is Class B or C under `docs/ARCHITECTURE_REVIEW.md`. Get an independent review and record it in the PR.

Older open items still apply:
- the ingest-provider-job metadata gap;
- Control Center's 60-cent Grok placeholder;
- orphan derivative objects.

## Do not

- Do not edit the applied SQL to "re-run" it. Its guards match only the pre-conform windows, so on the live database it now updates 0 rows. That is correct.
- Do not overwrite a selected clip. Add alternates only.
- Do not mark anything verified from tests alone. Cite the live row or the published bundle.

## Report back

Report:
- the three checks above, with their output;
- Fendi's A/B answer and what you did with it;
- any PR or commit.

End by writing the next prompt.
