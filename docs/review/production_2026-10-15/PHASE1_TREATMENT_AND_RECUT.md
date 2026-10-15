# Phase 1 — lyric timing, treatment→timestamps, fast re-cut (candidate 6)

**Date:** 15 Oct 2026 · **Project:** YSL "Ice On" `764a63d2-93cd-44f3-905f-292f14ab2f51` · **Song:** 201.87 s, 121.998 BPM, `song_analyses` `4769e2c8-3fcc-44d0-9ee5-3b08cefa7d3c`
**Source board:** candidate 5 `882ec381-0fa0-4a76-b23b-b83ebc157372` (untouched except the scene windows, two outfit rows and three wardrobe strings listed in §B)
**New board:** candidate 6 `358363e6-33ba-48e0-bd88-e80b57ac6b3c` "Interrupted Broadcast · candidate 6" — **not** the active variation; nothing on candidate 5 was overwritten, deleted or un-selected.

Every claim below is labelled VERIFIED (read back from the database or produced by a command whose output is quoted), OBSERVED, HYPOTHESIS or DECISION. "Done" never means more than the labelled evidence.

---

## 0. Verify first (what a reviewer runs before trusting anything here)

All through the AVT MCP (`avt_select`); no SQL, no dashboard.

| Check | Call | Expected | Status |
|---|---|---|---|
| Candidate-6 shots | `shots` where `variation_id = 358363e6…`, columns `id,spec_key,timestamp_start,timestamp_end`, limit 100 | **100 rows**, `c001`…`c100`, first start 0, last end 201.87, contiguous (each end = next start) | VERIFIED 04:27 UTC (quoted in §C.3) |
| Candidate-6 selected media | `shot_asset_assignments` where `variation_id = 358363e6…` | **22 rows**, all `is_primary = true`, 16 distinct `asset_id` | VERIFIED 04:35 UTC |
| Candidate-6 scenes | `variation_scenes` where `variation_id = 358363e6…` | **4 rows** (§B.2) | VERIFIED 04:35 UTC |
| Candidate-6 treatment doc | `video_variations` `358363e6…` → `treatment_json` | `clips` length 100, `generated_at 2026-10-15T03:43:41.980Z`, `cut.pace fast`, `treatment.storyboard.from 6826:kyok8p`, `run.id 7d15638b…`, `run.actualCostUsd 0.0632` | VERIFIED 04:39 UTC — the row returned by the update was parsed and compared to the local materialised file: `EQUAL` |
| Beat conform | `planConformToBeats` (the app's own planner, `src/lib/storyboard/conform.ts`) over the 100 live rows | `moved 0` | VERIFIED: `boxes: 100 | conform plan: moved 0 maxShift 0 edgesKept 0 method nearest` |
| Lyric re-time | `lyric_lines` where `project_id = 764a63d2…` and `line_index >= 52` | rows 52–58 carry `source` starting `align_lyrics — SUPERSEDED 2026-10-15`; rows **95–101** exist, block 7, 141.16 → 149.00 s | VERIFIED 04:42 UTC |
| Song map | `song_analyses` `4769e2c8…` | `sections_json` 11 entries, `hooks_json` 3, `drops_json` 2 (`t` 61.01 and 141.67) | VERIFIED 04:42 UTC |
| M5 asset | `project_assets` `fed968b9-f95e-482f-a7b4-e713690583a3` | `shot_id = 7760154a-6e2b-44a9-a74b-fabede5a9cd7` (candidate 6 `c017`), notes end "…The earlier 'not yet placed' note is superseded." | VERIFIED 04:35 UTC (update echo) |
| Candidate-5 scenes | `variation_scenes` where `variation_id = 882ec381…` | 5 rows: 43.31–51.18 DENIM · 55.11–59.05 DENIM · 62.98–96.42 **YSL_JACKET** · 96.42–123.97 **YSL_LEATHER_COAT** · 175.11–188.89 THE_CLEAN_ENTRANCE_LOOK | VERIFIED 04:42 UTC |
| Candidate-5 clean-entrance wardrobe | `shots` c5 `spec_key in (c039,c040,c041)` | `wardrobe = "exact clean entrance look"` on all three | VERIFIED 04:42 UTC |

If any of these differs, the live database has moved since this report; the report is wrong, not the database.

---

## A. Lyric timing — DONE

**Problem (VERIFIED before the fix):** `lyric_lines` row `line_index 52` "Freezin every season" was timed 90.42–142.94 s with `confidence 0`, and rows 53–56 were all pinned at 142.94–142.99. The aligner had stretched one chorus line across the whole instrumental break + chops + bridge.

**Fix (VERIFIED by the §0 select):**
- Block 7 was re-timed locally with the repo's own aligner (`scripts/lyrics/align_lyrics.py`, faster-whisper `small`, 30 s windows / 20 s hop, lyrics as vocabulary; PyAV decode replaced with ffmpeg because PyAV failed on the box). Cost $0.
- Seven new rows **95–101** (ids `dd88aa6c, cb1a4bf2, b58f1af8, 38b83ee9, 5d8f972b, 96062d9f, 7718e23b`): "Freezin every season" 141.16–142.92 · "We party" 142.92–143.66 · "like new years evenin" 143.66–145.04 · "Diamonds dancin" 145.04–145.88 · "Like the disco" 145.88–146.90 · "Get fly I know" 146.90–147.96 · "That you see it" 147.96–149.00.
- Rows **52–58** were **not** deleted or re-timed; their `source` now reads `align_lyrics — SUPERSEDED 2026-10-15 by line_index 95–101 …`. Their timings stay as the record of what the hosted aligner produced.
- `song_analyses.sections_json` (11): intro 0–13.80 · verse 1 13.80–31.505 · break 31.505–39.374 · verse 2 39.374–61.014 · hook 1 61.014–90.522 · break 2 (instrumental) 90.522–100.359 · chops (vocal samples, not on the lyric sheet) 100.359–125.933 · bridge (unlisted vocal, not on the lyric sheet) 125.933–141.671 · chorus (Freezin) 141.671–173.147 · hook 2 173.147–194.786 · outro 194.786–201.874. `hooks_json` (3): hook 1 61.27–90.42, chorus 141.16–172.64, hook 2 172.64–193.08. `drops_json` (2): 61.01, 141.67.
- OBSERVED, not changed: the lyric sheet in the repo (`lyrics.txt`) carries trailing spaces on some lines; the DB text does not. Cosmetic.

**Where the lyric-cued beats now sit (VERIFIED from the materialised clips' `lyric_ref`):** camera crew → `c013` 22.65–25.11 ("No minors / More cameras in the whip / Than a camera crew"); Canada Goose → `c014` 25.11–26.59 ("All this ice around me / Need a Canada"); janitor → `c015` 26.59–28.06 ("Canada goose / So clean but I don't"); grill → `c048` 86.10–88.06 ("You don't gotta / cut the lights on / This ice on / YSL I"). The writer's coverage check reports `lyrics: pass` with exactly these four anchors.

---

## B. Treatment → timestamps and scene windows — DONE

### B.1 Decisions applied (DECISION — the director's, relayed by the parent agent)

1. **Chicago, the switch wears YSL_JACKET** (Saint Laurent Mastic cotton track jacket, navy stripe + Saint Laurent beige/ivory cap, shirt and tie under). **The cold front wears YSL_LEATHER_COAT** (Coat in Bubbled Lambskin — Noir + Y Varsity black/ivory cap). Reason: the approved Mastic swap clip is cut from take 72.673–76.677 s (song 73.5–77.5 s), inside the Chicago window.
2. Lyric-cued beats sit where the words are sung (§A). Late shots (c067 onward) carry section-story specs, not lyric cues.
3. Clean-entrance shots wear the cotton jacket + confetti viscose shirt + nylon bucket hat (`THE_CLEAN_ENTRANCE_LOOK`), not "exact YSL leather coat".

### B.2 What changed on candidate 5 (VERIFIED earlier in this session by read-back; scenes and the three wardrobe strings re-read today, §0)

| Row | Before | After |
|---|---|---|
| outfit `e12c51bf` YSL_JACKET | v6, khaki Cassandre cap | **v7**: Mastic jacket `0feb028f` + Saint Laurent beige cap `07e6dcbe` + `d7666d88` + `991a79d4` + `18b648a5` |
| outfit `0d18f174` YSL_LEATHER_COAT | v7, Saint Laurent beige cap | **v8**: coat `fb82c0d2` + `6badada3` + Y Varsity `f1dc9486` + `18b648a5` |
| scene `327761de` The viewer | 43.31–? | 43.31–51.18 DENIM (snapped to measured downbeats) |
| scene `e57f8cb6` The viewer, after the screen | | 55.11–59.05 DENIM |
| scene `557e9d81` Chicago, the switch | 62.75–96.08 **YSL_LEATHER_COAT** | **62.98–96.42 YSL_JACKET** |
| scene `09591369` The cold front | 96.08–123.53 **YSL_JACKET** | **96.42–123.97 YSL_LEATHER_COAT** |
| scene `aa3fa72c` The clean entrance | | 175.11–188.89 THE_CLEAN_ENTRANCE_LOOK |
| shots `b107b535` c039, `80df89f9` c040, `b8186eb3` c041 | wardrobe "exact YSL leather coat…" | wardrobe "exact clean entrance look" |

Nothing on candidate 5 was deleted; no selection or approval changed. `docs/handoffs/ib_looks_by_scene/decisions.json` carries the same swap in `corrections[]` and `hatPairings.applied` (committed with this report).

### B.3 Candidate-6 scene table (VERIFIED, §0)

Downbeats are at 0.029 + n·1.9672 s (`measuredBeatMap`). Windows sit on measured downbeats and were matched to where writer run `7d15638b` actually put each story beat.

| Scene id | Name | Window | Bars | Outfit | Shots inside |
|---|---|---|---|---|---|
| `6de8a7bc` | The viewer | 43.31–70.85 | 23–36 | YSL_DENIM_LOOK | c028–c033 Fendi at the CRT (48.23–59.54); c034–c040 rider turn / white point / switch (no Fendi) |
| `4a402e46` | Chicago, the switch | 70.85–100.36 | 37–51 | YSL_JACKET | c041–c047 performance at 79th & Lafayette (72.33–86.10); c048–c054 grill close-ups (86.10–100.36) |
| `9bb120c5` | The cold front | 100.36–121.99 | 51–62 | YSL_LEATHER_COAT | c055–c066 blizzard performance (100.36–122.00) |
| `2c020d49` | The clean entrance | 163.31–182.98 | 84–93 | THE_CLEAN_ENTRANCE_LOOK | c085–c093 (163.80–182.00) |

No scene covers 0–43.31 (burning show, no Fendi), 122–163.31 (control room, Maybach, crew — no Fendi), or 182.98–201.87 (security monitor — no Fendi). That is correct: outfit resolution only needs Fendi's windows.

### B.4 Deviation flagged for review — the switch timing (OBSERVED)

The amended treatment says "The click lands with the vocal entrance" (60.80 s sung; bar 32 = 61.01 s, drop 1). The writer placed the white point / switch at **c037–c040 (63.96–72.33 s)** and Chicago from **c041 (72.33 s)** — about 11 s late, after the first hook repeat. The candidate-6 scene rows follow the writer (so the outfits resolve correctly for the shots that exist) and say so in their `notes`. Candidate 5 keeps the switch at 62.98 s. **Decision needed:** keep the writer's placement, or re-run the writer with a pinned switch at 61.01 s (one more ≈ $0.06 run). Not changed unilaterally.

---

## C. Fast re-cut → candidate 6 — DONE, with the gaps below

### C.1 How it was produced (the app's own writer path, nothing hand-written)

1. `buildClipGrid` (`src/lib/treatment/grid.ts`) at the **fast** pace with targets `{drop 1.5, high 1.5, mid 2, low 3}` over the measured beat map and the corrected sections → 100 clip slots, every cut on a measured beat, 32 on downbeats.
2. `treatment-writer-proxy` with the amended treatment (fingerprint `6826:kyok8p`) and the grid: run **`7d15638b-8e13-468e-8a9e-33fbd8623264`**, `grok-4-fast`, `status succeeded`, **actual $0.0632** (estimate $0.0502). The MCP call timed out client-side at 60 s; the run finished server-side and was recovered from `writer_runs` (`recoverWriterRun` pattern). **It was called once; it was not re-run.**
3. `planRewrite → planMaterialize → boxWrite` shape (`src/lib/storyboard/rewrite.ts`, `boxes.ts`) run in a node harness with a stub client; the rows it would write were inserted as-is through `avt_insert` in 20 batches of 5.
4. `planAssign` (`src/lib/storyboard/media.ts`) for the carry-over (§C.4); `planConformToBeats` for the beat check (§C.3).

### C.2 Writer coverage verdict (OBSERVED, from `treatment.storyboard.coverage` in the treatment doc)

`verdict: fail` — `structural fail`, `lyrics pass`, `relationships gaps`, `production pass`, `treatment fail`.
- Two treatment paragraphs uncovered: index 0 (the opening précis — expected, it is a summary) and index 28 ("It plays as a brief, deadpan interruption…" — the second goose gag's follow-through on the sidewalk).
- `missingPeople`: FENDI in beat b14 (the control room — the treatment has him only on monitors there, so this is arguably correct; the checker wants him cast).
- One tie corrected by the writer: b13 → b12 `screen_shows` ("A bright reflection off the final diamond becomes a whiteout.").
- All four lyric anchors present (§A).
**Decision needed:** accept as-is, or spend one more writer run to close index 28 and the b14 cast.

### C.3 The board (VERIFIED)

100 shots `c001`…`c100`, ids in `scratchpad/node/c6_shots_live.json` (also listed in the parent's transcript). Every row: `box_origin treatment`, `status planned`, `locked false`, `history_json [{migrated}]`, `spec_json` = `generated_json`, `override_json null`, `notes "TKEY:cNNN"`, `priority` column **"normal"** on all 100.

Length histogram (seconds → count): 1.47 ×16 · 1.48 ×27 · 1.50 ×1 · 1.96 ×9 · 1.97 ×19 · 2.45 ×3 · 2.46 ×2 · 2.95 ×18 · 2.96 ×1 · 3.15 ×1 · 3.44 ×1 · 3.45 ×2 — i.e. 3, 4, 5, 6 or 7 measured beats (0.4918 s each); total 201.87 s. Energy by clip: high 45 · mid 30 · low 23 · drop 2 (c034 at 59.54 into drop 1, c076 at 139.70 into drop 2).

Conform check (the app's planner over the live rows): **`moved 0`**, `maxShift 0`. Nothing to apply.

Story beats as placed: burning show c001–c012 · crew/geese/janitor c013–c017 · rider mounts c018–c023 · side-on / colour loss c024–c027 · viewer c028–c033 · rider turns c034–c036 · white point + switch c037–c040 · Chicago c041–c047 · grill c048–c054 · cold front c055–c066 · control room c067–c075 · Maybach + geese c076–c084 · clean entrance c085–c093 · security monitor c094–c100.

### C.4 Media carried from candidate 5 (VERIFIED: 22 rows)

Rule (the app's invariant, not a shortcut): a candidate-6 shot gets the candidate-5 selected clip only when its window lies **wholly inside** one candidate-5 shot that has a selected clip; `source_in = old in + (new start − old start)`, `source_out` kept; `planAssign` with `select: true` → one primary assignment per shot. Nothing was un-selected on candidate 5.

| c6 shot | window | from c5 | asset | in / out |
|---|---|---|---|---|
| c001 | 0.00–1.50 | c001 | `06715881` | 0.00 |
| c002 | 1.50–2.98 | c001 | `06715881` | 1.50 |
| c004 | 4.95–7.90 | c002 | `deeaf421` | 0.99 |
| c005 | 7.90–10.85 | c003 | `a1c8e8d3` | 0.00 |
| c007 | 12.32–13.80 | c004 | `0649fc1e` | 0.49 |
| c008 | 13.80–15.28 | c004 | `0649fc1e` | 1.97 |
| c010 | 16.75–18.72 | c005 | `4ead98d0` | 0.98 |
| c012 | 20.69–22.65 | c006 | `7ceb788e` | 0.99 |
| c014 | 25.11–26.59 | c007 | `da2edcbc` | 1.47 |
| c016 | 28.06–29.54 | c008 (approved rider) | `dcb45b02` | 0.49 |
| **c017** | 29.54–31.51 | c008_2 (**M5**, approved) | `fed968b9` | 0.00 |
| c018 | 31.51–32.98 | c009 (approved rider) | `d81576b5` | 0.00 |
| c022 | 39.37–40.85 | c011 | `2e8cffbe` | 0.00 |
| c023 | 40.85–42.33 | c011 | `2e8cffbe` | 1.48 |
| c025 | 43.80–45.28 | c012 | `30edb345` | 0.49 |
| c026 | 45.28–46.75 | c012 | `30edb345` | 1.97 |
| c028 | 48.23–50.19 | c013 | `1f8c0dbf` | 0.99 |
| c032 | 56.10–58.06 | c015 (blackout TV) | `a13ce826` | 2.29 / out 4.9 |
| c034 | 59.54–61.01 | c016 | `eb7db792` | 0.49 |
| c035 | 61.01–62.49 | c016 | `eb7db792` | 1.96 |
| c037 | 63.96–65.93 | c017 (approved Red Line) | `0000c19a` | 0.98 |
| c039 | 67.90–70.85 | c018 (approved Red Line) | `0000c19a` | 4.90 |

**Not carried (17 candidate-6 shots before 70.85 s): c003, c006, c009, c011, c013, c015, c019, c020, c021, c024, c027, c029, c030, c031, c033, c036, c038.** Each straddles a candidate-5 cut, or its candidate-5 counterpart (c009_2, c010, c010_2, c014, c014_2) had no selected clip. They need an editorial choice (extend a neighbour's clip, or generate), not an automatic one. Nothing after 70.85 s had selected media on candidate 5.

**M5 (`fed968b9`)**: now the selected clip on candidate-6 `c017` `7760154a` (29.54–31.51, the mounted beat after she stands at the horse, same window as candidate-5 `c008_2`), and `project_assets.shot_id` points at that shot; the candidate-5 assignment on `c008_2` `032dac9d` is untouched. OBSERVED (unchanged): the clip is 848×1056, so it letterboxes in the 9:16 frame.

### C.5 Known defects on the new rows (OBSERVED, not fixed)

- The `shots.priority` **column** is "normal" on all 100 rows while `spec_json.priority` is "high" on 18 (c001, c006, c014, c015, c016, c041–c048, c055, c064, c090, c091, c093). The row shape passed to the insert carried no top-level `priority`, so the column default applied. The app reads priority from `spec_json`; the column is cosmetic. Fix, if wanted: `avt_update` those 18 ids with `priority: "high"`.
- c037 ("television collapses to a white point") carries the approved Red Line clip `0000c19a` because its window sits inside candidate-5 c017 — the candidate-5 board had already drifted there (the Red Line clip under the switch). Same for c039. Editorial, see §D.

---

## D. Open for Fendi (DECISION needed — nothing done unilaterally)

1. **Switch timing** (§B.4): writer at 63.96–72.33 s vs treatment at the vocal entrance 61.01 s.
2. **Denim look's cap**: `YSL_DENIM_LOOK` still wears the Y Varsity cap (v8) — the same cap the coat now wears; the khaki Cassandre cap is on no look. The agent follow-on (denim → khaki) was **not** applied: it would bump the denim outfit version and mark the three locked viewer boxes (c012, c013, c015 on candidate 5) outdated.
3. **Approved Red Line clip `0000c19a`** (long coat + khaki cap, candidate-5 c017–c018 at 62.98–70.85 s, candidate-6 c037/c039) now sits inside a **YSL_JACKET** window. It stays selected; the outfit mismatch is the honest record. Either the window moves, the clip is re-dressed (the swap pipeline), or the decision is reversed.
4. **Coverage** (§C.2): accept the two uncovered paragraphs and the b14 cast gap, or one more writer run.
5. **17 early shots without media** (§C.4).
6. **Which candidate is active**: candidate 6 is not active; nothing on the project's active pointer was touched.

---

## E. Spend (recorded in `docs/LEDGER_YSL_TESTING_BUDGET.md`)

| Row | What | Cost |
|---|---|---|
| 29 | treatment-writer-proxy run `7d15638b` (grok-4-fast) | **$0.0632** actual (`writer_runs.actual_cost_usd`; proxy estimate $0.0502) |
| — | local lyric re-time, grid, materialise, carry, conform | $0 |

Running total after Phase 1: **$38.16** (rows 1–29; the $50 ceiling was lifted by the director on 15 Oct, spend recorded regardless).

---

## F. What was NOT done, and why

- No generation, no renders, no swap-pipeline calls in this phase (out of scope; the dressed-take pipeline agent runs separately).
- No change to the active variation, to any candidate-5 selection, assignment, approval or clip.
- No edit under `src/` or `supabase/functions/` (rule). All DB writes went through `avt_insert` / `avt_update`; no SQL.
- The `lyric-align-proxy` edge function was not used for the re-time (payload too large to pass through the MCP tool); the repo's own aligner script was run locally instead, same model family, $0.
- Not pushed. Commit in worktree `worktree-agent-ac9066edaba34ebe6` (branch base `claude/determined-faraday-4rzanq` @ `754463d`).

## G. Re-run / recovery notes for the next agent

- Harness and inputs: `/tmp/claude-0/-home-user/36a6ed42-700a-5479-8889-4ee990111637/scratchpad/` (`treatment_c6.txt`, `writer_run_row.json`, `c6_shot_rows.json`, `c6_treatment_json.json`, `c6_assignment_rows.json`, `node/{grid,writer_body,materialize,carry,conform_check}.ts`). Scratchpad is session-local; the DB rows are the record.
- To re-check beat conformity: run `conform_check.ts` against a fresh `avt_select` of the 100 rows; expect `moved 0`.
- Do not "fix" the superseded lyric rows 52–58 by deleting them; the supersession is recorded in `source` and the new rows carry the timing.
