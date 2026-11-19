# Methods accounting: YSL, Hyenas, Partnership / Cease & Desist (19 Nov 2026)

Job 1 of `docs/handoffs/HANDOFF_AVT_BUILT_IN_METHODS_2026-11-19.md`. Cost of this audit: $0 (reads only).

Fendi, 19 Nov 2026: "have the agent review each project (YSL, hyenas, partnership/cease and desist) so we can have a
real accounting and robust infrastructure built in based off of real life projects."

**Labels.** VERIFIED = I ran the command or the query and cite it. OBSERVED = read on a row or in a note, not
re-derived. ESTIMATE = a list price times a count. UNKNOWN = the record does not hold it. Every dollar here is the
ledger's own figure (list-price estimates for almost every row); **no provider invoice stands behind any of it.**

## How to reproduce every number

```bash
python3 scripts/audit/ledger_normalise.py --check
```

It reads the four ledgers, writes `docs/audit/ledger_normalised_2026-11.csv` (one line per ledger row: amount,
category, tool, outcome, rework) and prints the sums below. Category and tool come from a written rule over the row's
route text (`CATEGORY_RULES`, `TOOL_RULES` in the script). Outcome comes from
`docs/audit/ledger_outcomes_2026-11.csv` where I read the row myself (87 rows: every Partnership and Hyenas row, and
the YSL rows that are large, mixed or named in the handoff), and from a keyword rule over the row's own words
everywhere else (`outcome_auto` in the script). The CSV says which, per row (`outcome_source`).

## 1. Totals (VERIFIED: the script's sums equal each ledger's own total)

| Project | Ledger total | Rows | Dates | File |
|---|---|---|---|---|
| YSL "Ice On" | **$638.57** | 277 numbered, 239 paid | 21 Sep – 7 Nov | `docs/LEDGER_YSL_TESTING_BUDGET.md` |
| YSL environment phase | **$124.29** | 44 | from 1 Oct | `docs/LEDGER_ENVIRONMENT_BROLL_BUDGET.md` (outside the YSL total) |
| Hyenas, 13 Nov session only | **$38.24** | 10 lines, 30 calls | 13 Nov | `docs/LEDGER_HYENAS_2026-11-13.md` |
| Partnership | **$58.73** | 37 | 17–19 Nov | `docs/LEDGER_PARTNERSHIP_CEASE_DESIST_2026-11-11.md` (the rows sum to $58.72; one cent of rounding) |

## 2. What the money bought (VERIFIED sums under the script's rule)

| | YSL | Hyenas (13 Nov) | Partnership |
|---|---|---|---|
| Clothing / object swaps | $263.95, 45 rows (Genjutsu alone: $251.31, 36 rows) | $35.36, 13 calls | $7.49, 2 rows |
| Generated clips | $343.80, 113 rows (Seedance $323.50, 94 rows; Kling $20.74, 20 rows) | none on the ledger (see 4) | $39.18 (Seedance; 14 jobs) |
| Stills | $11.78, 30 rows (Grok $9.73, Gemini $1.35) | $1.89, 7 stills (Gemini) | $11.07, 41 stills (Gemini) |
| Mattes (veed) | $4.35, 30 rows | $0.66, 9 mattes | $0.93, 23 mattes |
| Paid light-match attempts | $0.80 (Beeble SwitchX, 2 rows) | $0.33 (SwitchX) | $0.54 (two Gemini "blend" passes) |
| Lip-sync | $4.54, 3 rows | none | none |
| Reviews (OpenAI Astra) | $8.88, 10 rows | none | none |
| Treatment writer | $0.06 | none | $0.32, 4 runs |

**Where this differs from the handoff's draft (§2.1), and why.**

| Handoff draft | This audit | Reason |
|---|---|---|
| YSL swaps $244.49, 34 rows | Genjutsu $251.31, 36 rows; all swap routes $263.95, 45 rows | the draft left out two Genjutsu rows; the wider figure adds the Sep–Oct xAI video-edit and Runway swap tests |
| YSL Seedance $326.91, 95 rows | $323.50, 94 rows | row 57 is a Kling plate + matte, not Seedance; rounding on the rest |
| YSL mattes $4.00, 30 rows | $4.35, 30 rows | same rows; I use the running-total steps |
| YSL Grok stills $10.16, Gemini $0.54 | Grok $9.73, Gemini $1.35 | five Gemini rows, not two (rows 156, 157, 235, 240 and the second row numbered 23) |
| YSL rework "about $210 of $632" | **$159.78 that the rows themselves support**, and $230.57 on 110 rows that never say what became of the result | see 3 |
| Hyenas "about $37 more before 13 Nov" | **about $89 at estimate** | see 4: the app's job table holds 25 Seedance clips and 37 stills nobody ledgered |
| Partnership rework "about $23.6", "about $14.6" already covered by a note | **$24.18** and **$14.61** | confirmed row by row |

## 3. Rework: money on results that were thrown away

"Rework" here = the part of a row a right first pass would not have spent: a rejected result, an unused spare, a redo.
"A note already covered it" = a written rule or recipe existed before the call and the call went against it.

| Project | Rework | Read by hand | By keyword rule | A note already covered it |
|---|---|---|---|---|
| YSL | **$159.78** | $124.48 | $35.30 | **$24.72** (rows 159, 203–209, 216) |
| YSL environment | $2.24 | – | $2.24 | $0 |
| Hyenas, 13 Nov ledger | **$13.93** | $13.93 | – | $0.33 (SwitchX again, after YSL row 58) |
| Hyenas, before the ledger | **$30.40** OBSERVED in the handoff prose: nine swaps $24.48 ("my dog is laying down and you have the hyena standing"), Grok stills and clips $4.57 after Grok was demoted, five stills of him $1.35 ("clearly not me in the face") | | | all of it: Fendi, "We already had a formula that was 100% effective ... refer to the YSL video edit" |
| Partnership | **$24.18** | $24.18 | – | **$14.61** (rows 2, 3, 5, 6, 7, 8, 29) |

YSL rework by what it was: swaps $100.35, clips $54.29, lip-sync $4.24, SwitchX $0.79, the rest under $0.20.
The large YSL rows, read by hand: row 127 (13 dresses, 8 missed, $21.79), row 128 (15 redresses, 6 missed, $16.34),
row 130 (24 montage renders, 11 thrown away, $24.41), rows 36 and 38–40 (the cold-front cap, $29.29 across five
tries before the kill criterion), rows 137–138 (lip-sync, $4.24).

**Three honest limits.**

1. **$230.57 of YSL (110 rows) carries no outcome on the row.** Most are Seedance renders filed "unselected" with a
   description and nothing after. The true YSL rework is somewhere between $159.78 and about $390. The handoff's
   "about $210" may well be right; the ledger cannot prove it. UNKNOWN.
2. **Most YSL rework was first-time work, not a note ignored.** The lip-sync rule entered `CLAUDE.md` on 18 Oct, the
   day after rows 137–138 were rejected (VERIFIED: `git log -S'generated lip-sync' -- CLAUDE.md` → `604bb7c1`). I do
   not count those as "a note already covered it", where the handoff's draft did.
3. **The dollars understate it.** The swap put-back, the matte repair, the light match and the checks are local
   scripts at $0 a run. Their rework is hours, and no file records hours. UNKNOWN, and I will not invent a number.

## 4. Hyenas: what the ledger does not hold (VERIFIED, `provider_jobs` for project `87fc3244…`, read 19 Nov)

The Hyenas ledger opens at 09:05 UTC on 13 Nov. The app's own job table shows this before it:

| What | Jobs | At the job's own estimate |
|---|---|---|
| Seedance clips (`montage-shot`), 12 Nov 19:36–22:43 UTC | 25 succeeded | **$48.82** (7 × $2.219 + 18 × $1.849) VERIFIED sum of `estimateUsd` |
| Gemini stills, 12 Nov 07:37 – 13 Nov 01:04 UTC | 37 succeeded | about $9.99 ESTIMATE (37 × $0.27; the size of each is not on the row) |
| Genjutsu swaps through `proxy-provider-call` | 1 succeeded, 1 failed | $2.72; the handoff prose says nine swaps ($24.48), so **eight are in no table** |
| veed mattes, 13 Nov 07:02–08:53 UTC | 9 | about $0.65 ESTIMATE |
| veed mattes, 14 Nov 16:35–21:27 UTC (after the ledger closed) | 8 | about $0.6 ESTIMATE; in no ledger |
| Grok stills and clips ($4.57 in the handoff prose) | 0 rows under this project | UNKNOWN where they were filed |

So Hyenas, all told, is at least **$38.24 + $48.82 + $9.99 + $24.48 + $4.57 + about $1.25 ≈ $127** at estimate, not
the "about $75 known" of the handoff. The 25 Seedance clips are the largest single unrecorded item in the three
projects.

**Partnership reconciles exactly** (VERIFIED, same query for project `0c5c4421…`): 41 succeeded Gemini jobs = the
ledger's 41 stills ($11.07); 14 Seedance jobs whose estimates sum to $38.915 = the ledger's $38.91; 2 Genjutsu jobs
$7.491; 23 mattes = rows 6, 13, 25, 30. One Gemini job was still running at 17:42 UTC on 19 Nov, after row 37.

**YSL has no job after 7 Nov** (VERIFIED: 0 rows in `provider_jobs` for project `764a63d2…` after 8 Nov), so the
ledger stopping on 7 Nov is right, not a gap.

## 5. The approved method for each of the four areas

Each line: the tool, its settings, the approved asset, Fendi's words, and where that is written.

### Outfit swap

| | |
|---|---|
| Method | `dress-clip` (Genjutsu, 720p, window ≥ 4 s) → `scripts/edit/body_only_swap.py`, `AVT_HEAD_ZOOM=4` (3 on full body), head fit off, no mp4v intermediate |
| Approved | YSL c033 `5482b35b`: "make it the canonical reference for preserving my real facial performance during clothing swaps" (18 Oct; `docs/recipes/HIS_FACE_IN_ANY_SCENE.md:93`, `FACE_PRESERVING_CLOTHING_SWAP.md:79`, `CLAUDE.md:170`) |
| Approved | YSL c041 `6f4edd50`: "C041 can pass … we can keep it" (4 Nov; `HIS_FACE_IN_ANY_SCENE.md:94`) |
| Creature or prop | `--base swap`, retime auto; Hyenas verse (`docs/PROBLEM_INDEX.md`, "The old prop still shows") |
| Stills | clothes-only Gemini edit of a real photo → `still_face_putback.py`; a head in a scene → `still_face_from_photo.py` with `AVT_FACE_EXACT`. Allen dressed `34bd95ac`: "Perfect" (19 Nov; `docs/handoffs/PARTNERSHIP_SHOT_LIST.md:336`). Passenger seat v3 `077a3515`: "the image is extremely close and can pass" (`PARTNERSHIP_SHOT_LIST.md:385`) |
| Correction | `14f9d5dd` (v4) is called "the approved still" at `PARTNERSHIP_SHOT_LIST.md:504` and `:530`, but line 404 of the same file says "pending: he has not judged v4". His words are on v3 only. v4 is the dial-in he allowed, not a result he judged |

### Person matte

| | |
|---|---|
| Method | `matte-video-proxy` (veed) on the put-back, used as delivered → `scripts/edit/composite_over_plate.py`; repairs only by name (`--key-dark-box`, `--occlude-y`); `matte_stability.py` on every changed matte |
| Approved | YSL c033 showroom `8a527bab` (`FACE_PRESERVING_CLOTHING_SWAP.md:220`, `PROBLEM_INDEX.md:24`) |
| Approved | Hyenas verse 0.9–4.9 with `--key-dark-box 215,470,450,720`, leg flicker 9.84 → 5.28: "Perfect" (13 Nov, about 08:05 UTC; `docs/recipes/CREATURE_OR_PROP_SWAP_ON_HIS_TAKE.md:117`). OBSERVED: the recipe records that word as coming "after this test and the plan were sent", so it covers the test and the plan together |
| Photos | `scripts/edit/photo_people_cutout.py` (Partnership row 25, 19 of 20 usable). On PR #508 only, not yet on `main` |

### Light match (the weakest record)

What Fendi has approved in words:

| Result | Tool | His words | Where |
|---|---|---|---|
| c009 v3 `b06b32f9` | `place_him_over_plate.py --gain --contrast` | "I like it" (5 Nov) | `HIS_FACE_IN_ANY_SCENE.md:95` |
| Frost cover v12 `5b825de7` | `cover_regrade_figure.py` (0.55 stops, +10 lift, 12 % cast, grain 1.3×) | "Ok I like lift b g2" (7 Nov) | `HIS_FACE_IN_ANY_SCENE.md:98`, YSL ledger row 279 |

What he has **not** approved:

- **Blender `comp_scene.py` with light measured on the plate.** `docs/PROBLEM_INDEX.md:33` cited showroom v9
  `436ffebe` as "proven on", while `docs/handoffs/HANDOFF_BLENDER_SHOWROOM_2026-10-19.md:8` says "Fendi has not
  judged it" (VERIFIED, both lines). **The index row is corrected in this PR.** The edge settings on room 2 v2
  `b2ad4ae6` (`PROBLEM_INDEX.md:28`) are measured (outline 3.7× → 1.1×) and likewise wait on his eye
  (`HANDOFF_BLENDER_SHOWROOM_2026-10-19.md:160`: "First task: Fendi's eye on room 2 v2").
- **Hyenas.** He left it to Grokbot: "grokbot can do it in after fx".
- **Every paid attempt.** Beeble SwitchX twice on YSL ($0.79, redrew the wardrobe, row 58), once on Hyenas ($0.33,
  redrew his face), two Gemini "blend" passes on Partnership ($0.54). $1.66 in all, all thrown away.

So the pipeline's light-match stage has two approved tools (a gain and contrast on video, a regrade on a still) and
one unjudged one. Fendi's decision is needed before the Blender path ships as a default (see the handoff §4.3).

### Exact-pixel face put-back

| | |
|---|---|
| Proof | the script prints `max \|out-original\| on face/hair/skin: 0` (`body_only_swap.py`); for a still head, `max \|out-original\| inside the hard head mask: 0` |
| Checks | `face_check.py` sheet, `mouth_scan.py`, `ring_flicker.py`, `hat_geometry.py` (approved range 0.03–0.14) |
| Cost | $0 a run |
| Paid work caused by not using it | Partnership rows 7, 8, 29 ($3.66); Hyenas five stills of him ($1.35, prose) and the SwitchX test ($0.33); YSL lip-sync rows 137–138 ($4.24): **$9.58 that I can itemise.** The handoff's "about $10.6" has about $1 I could not trace |

### Times each method was re-derived (OBSERVED from the notes; not a count I can prove)

| Method | Across projects | Evidence |
|---|---|---|
| Swap | Hyenas (12 Nov), Partnership (17 Nov) | Fendi 13 Nov, "refer to the YSL video edit"; `PARTNERSHIP_STORM_VERSE_METHOD_PLAN.md:12–17` |
| Matte | Hyenas (RVM, SAM by flow, SAM 2), Partnership (local segmenter, colour gate, homography) | `PROBLEM_INDEX.md:24`; method plan line 16 |
| Light match | Hyenas, Partnership | the paid attempts above |
| Face put-back | Hyenas (generated stills of him), Partnership (rows 7, 8, 29) | build skill lessons 16 and 18 |

## 6. Holes in the record, each with a fix or an honest "unknown"

| Hole | State | Fix |
|---|---|---|
| No provider bill behind any Higgsfield, Fal or Google row | UNKNOWN. Real Higgsfield bills ran 0.51–0.70× list (YSL ledger row 84) | only Fendi can read the invoices; ask him for the three account totals once, record them in the ledgers |
| Fendi's top-ups never totalled | UNKNOWN; the rows quote "Topped up", "$100 top-up", "Done" without sums | same ask |
| Hyenas before 13 Nov | **Found**: section 4. Eight swaps and the Grok calls are in no table | add the section-4 table to the Hyenas ledger (done in this PR) |
| Hyenas mattes of 14 Nov | **Found**: 8 jobs, in no ledger | same |
| Swap jobs sent through `proxy-provider-call` leave no `provider_jobs` row | VERIFIED for Hyenas (1 of 9 present) | the pipeline in the handoff §4.3 sends every swap through `dress-clip`, which writes the row |
| **Every veed matte job reads `status: running` for ever** | VERIFIED: 26 of 26 on Hyenas, 23 of 23 on Partnership | a real defect: the matte lane never finalises its job row. A ledger sourced from `provider_jobs` (below) must not filter on `succeeded` until this is fixed. Listed for the pipeline work (Class C, orchestration) |
| `provider_jobs` has no cost column | VERIFIED: the estimate sits in `request_payload_json.settings.estimateUsd` on Higgsfield rows only; Gemini and veed rows carry none | the accounting view below needs a price per route |
| YSL ledger: rows out of order, numbers 22, 23, 24 used twice, row 221 at the end with an older total, a stale summary line | VERIFIED by the script | the stale line is marked in this PR; the script handles the rest |
| YSL ledger: row 88's amount ($0.073) and its running-total step ($0.09) differ | VERIFIED | two cents; left as written |
| Another project's cover (Frost the Boss) inside the YSL ledger (rows 236 and 279 at least) | OBSERVED | left in place; the CSV keeps the rows, a `project` fix is one column |
| Three YSL writer runs of 8 Oct ($0.07) | VERIFIED in `writer_runs`; not in the YSL ledger (they belong to the Interrupted Broadcast ledger's period) | none needed |
| Hours | UNKNOWN. No file records them | none possible after the fact |

## 7. Make the accounting automatic (RECOMMENDATION, Class B)

A hand-kept markdown ledger is why this audit took a script and a day's reading, and why about $89 of Hyenas spend sat in no ledger.

1. Give every paid job three fields at the moment it is sent: `category` (swap, matte, still, clip, writer, other),
   `method` (the `PROBLEM_INDEX` row or recipe it follows, or `none`), and later `outcome` (approved, rejected,
   superseded, test) with Fendi's words. `ledger_outcomes_2026-11.csv` is that table, filled in by hand for 87 rows.
2. Source it from `provider_jobs` and `writer_runs`, which already hold every job the app sent. Two things must be
   fixed first: the matte lane must finalise its rows, and each route needs a recorded price.
3. Show it per project in the app. Then "how much did we spend re-solving the matte" is one query, and a job with
   `method: none` on a shot with him in it is visible the same hour.

Until that exists, `scripts/audit/ledger_normalise.py` is the query: add a ledger row, add its line to the outcomes
file, run the script.
