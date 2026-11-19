# HANDOFF: built-in methods, where the three jobs stand (19 Nov 2026, evening)

For: the agent or person who takes `docs/handoffs/HANDOFF_AVT_BUILT_IN_METHODS_2026-11-19.md` further, and for
Fendi's two decisions at the end. Written from `docs/HANDOFF_TEMPLATE.md`.

Labels: VERIFIED = I ran it and cite it. CODED is never LIVE. Nothing in this file is approved by Fendi.

## 0. Start state

| | |
|---|---|
| Repo | `fendifrost-dot/ai-video-tool`, `main` at `f05215c3` or later |
| Open PRs | #510 audit and this file (Class A), #512 put-back design + slice a (Class C, **draft**), #508 Partnership storm (another session's) |
| Merged today | #509 docs, #511 Treatment writer, #513 writer follow-up, #514 lockfile |
| Backend | Lovable-managed only, project ref `qoyxgnkvjukovkrvdaiq`; pre-flight in `docs/AGENT_BOOTSTRAP.md` |
| Money spent on this handoff | **$0.1463** at the writer's own count (two text runs, `writer_runs.actual_cost_usd` 0.075 + 0.0713), plus Lovable workspace credits for two edge redeploys (0.7 credits reported for the second; the first was not reported). Ceiling was $5 |

## 1. Done

| What | Id | State | Fendi's words |
|---|---|---|---|
| Step 0: the handoff, the PROBLEM_INDEX row, lesson 19 and the Partnership notes on `main`; `docs/HANDOFF_TEMPLATE.md` written | PR #509, `8d39aae7` | MERGED (docs, Class A) | none needed |
| Job 1: the audit | PR #510: `docs/audit/METHODS_ACCOUNTING_2026-11.md`, `scripts/audit/ledger_normalise.py`, `docs/audit/ledger_outcomes_2026-11.csv` | docs and a script; on the PR with this file | not judged |
| Job 2: the Treatment writer, montage twists | PR #511 `b64d0a72`, PR #513 `f05215c3` | **CODED, REVIEWED, DEPLOYED, CHECKED LIVE.** Reviewed by an independent agent (not the author), six passes in all, final verdict APPROVE on both PRs. Lovable redeployed `treatment-writer-proxy` and `avt-mcp` from `b64d0a72`, then `treatment-writer-proxy` from `f05215c3` (Lovable's report, 19 Nov 18:31 and 18:56 UTC). Frontend published (deployment `5e3e1463`). VERIFIED live by me: the deployed function refuses a montage on a board with no timed lyrics with the new message ($0); the published bundle `projects._id.treatment-DSalOvjU.js` contains "Montage twists" and "Not chosen: a treatment the AI writes"; two paid runs below | **not judged**: the line → picture table is in section 1b |
| Job 3: design note | PR #512, `docs/design/DRESS_AND_PLACE_PIPELINE_2026-11.md` | PROPOSED: needs architecture, product and security sign-off | not judged |
| Job 3, slice a: the put-back as a worker job | PR #512, commit `06597e5b` | CODED as a draft, 26 unit tests, `deno check` clean. **Not merged, SQL not applied, nothing deployed, fixture not run** | not judged |
| `main` repaired | PR #514 `8d8c537d` | Lovable's bot bumped a package in `package.json` during the first redeploy and left the lockfile behind, so `npm ci` failed on `main`. Lockfile regenerated (four lines) | none needed |

## 1b. The writer's two live runs on Partnership (nothing was written to any board)

Both: the deployed `treatment-writer-proxy`, the AI writing the text, style not sent (so the default applied), the
board's 116 shot windows, the board's own notes and direction, text model `grok-4-fast`. The words per shot were
joined from `lyric_lines` without word timings (a line is in every shot it overlaps by 0.3 s), which the app does
by word; so "Back to back Benz's" (0.24 s long) reached no shot.

| | Run 1, `52b0d405` (after #511) | Run 2, `352f89e4` (after #513) |
|---|---|---|
| Cost (`actualCostUsd`) | $0.075 | $0.0713 |
| Style, prompt fingerprint | `montage_twists`, `15428:1p0fn1p` | `montage_twists`, `16494:1wspg49` |
| Scenes kept / left out | 12 / 2 | 25 / 2 |
| Most shots one scene holds | 2 | 2 |
| Shots that are his performance | 84 of 116 | 63 of 116 (plus 12 plain shots of the world where nothing is sung) |
| Coverage | gaps (the two scenes left out, each shown with its reason) | the same |
| The money table | on "Flip through green / Treat it like it's salad" at 0:18.5, as a hundred-dollar bill for a table top | at 0:18.5: "A man sits at a dining table whose entire surface is made of stacked hundred-dollar bills and calmly eats a green salad" |

Run 2, line → picture (the first half; the second half was left to his storm performance, as the notes say):

| Song | Words | Picture the writer wrote |
|---|---|---|
| 0:06 | Back to back Lexus | Two Lexus sedans parked back to back, a mail carrier walks between them. **This is the scene Fendi scrapped; the notes say so and the writer wrote it anyway** |
| 0:09 | Economy really don't affect us | A cashier rings up a cart full of hundred-dollar bills as groceries |
| 0:11 | Pull up you can still smell the leather | A man opens the door of an invisible car; the leather scent ripples the air |
| 0:15 | My partner Allen | Allen in the passenger seat of the Lexus, cap backward |
| 0:17 | Had it automatic | The Lexus shifts its own gear lever with no hand on it |
| 0:18 | Flip through green / Treat it like it's salad | The table of stacked hundred-dollar bills, a man eating a salad on it |
| 0:19 | Ralph Lauren fanatic | A barber in a full Ralph Lauren suit cutting hair (literal, not impossible) |
| 0:22 | Now I'm steady jumping Tax brackets | A man jumps over glowing tax-bracket signs on the sidewalk (reads as graphics) |
| 0:26 | Wood grain car feel like a cabinet | The dashboard is a wooden cabinet whose drawers open by themselves on the corners |
| 0:30 | All my business partners got Benz's | Four men in four parked Benzes reading newspapers (literal) |
| 0:32 | Fuck a rap the cars get wrapped | One sheet of vinyl wraps a whole sedan in one motion |
| 0:33 | Or we put the paint on it / Until it's swimming | The wet paint on the hood turns to rippling water that stays put |
| 0:41 | I'm Prada like my partner still livin | Allen standing in a Prada puffer by a clothing rack (the notes dress him in the red Polo sweater, seated) |
| 0:44 | Every time I put the polo on | A polo shirt lifts off its hanger and buttons itself over an invisible torso |
| 0:47 | Wishin you was here | The passenger seat is empty, then Allen is in it |
| 0:48 | They did you wrong | Church ladies talk on the steps; one rose petal lands between them |
| 0:58 | Back to back flexin / Like we wrestling | Two men in suits lean into each other like wrestlers, faces blank (literal) |
| 1:01 | Back to back blessings | Wrapped stacks of cash slide out of an ATM while the next customer waits |
| 1:09 | This a real nigga frequency | A rooftop radio tower sends rings of warm light through the buildings |
| 1:12 | Gotta fuck em up frequently | A doorman opens and closes one revolving door for an empty lobby (weak) |
| 1:16 | See you frequently up in my dreams | Allen on a park bench at dusk, eyes closed (the notes put him beside Fendi in the car) |
| 1:23 | All these clothes / Used to get us fly | A row of designer jackets lifts off the rack and hovers |
| 1:24 | Now it's like the wisdom / Gives us wings | An open book grows paper wings that flap once |
| 1:30 | All this drip turn to self esteem | Each drop from a leaking tap lands as a small polished dress shoe |
| 1:39 | Clean with my partner nem' | Allen at a diner counter while the waitress wipes a spotless counter |

My reading, for what it is worth (the judgement is Fendi's): the tool now writes in the right shape, on the right
words, and holds each twist to a few seconds. Fourteen or so of the 25 are real twists. Five are literal or weak, one
is the scrapped scene, and three put Allen where the notes did not. The hand-written board `fa7f6b85` is still the
stronger treatment. The third allowed run was not spent: a prompt cannot make this text model obey every line of a
long brief, and the handoff bars changing the model in this work.

Ledger: these two runs belong in `docs/LEDGER_PARTNERSHIP_CEASE_DESIST_2026-11-11.md` after row 39. That file is
being edited on PR #508 (rows 38 and 39 exist only there), so the rows are given here rather than added on a second
branch: `| 40 | 19 Nov 18:38 | Writer live check after PR #511: the AI's own montage treatment over the board's 116 shots, nothing filed; writer run 52b0d405 | treatment-writer-proxy, grok-4-fast (text only) | $0.075 | unknown | 12 scenes kept, 2 left out; the money table on the salad line; too few scenes |` and `| 41 | 19 Nov 18:59 | The same after PR #513 (scene count, impossibility test); writer run 352f89e4 | treatment-writer-proxy, grok-4-fast (text only) | $0.0713 | unknown | 25 scenes kept, 2 left out; table posted to Fendi; not judged |`.

## 2. Not done

| What | Why it stopped | Exact next step | Price |
|---|---|---|---|
| A candidate BOARD from the AI's own text | the Treatment page lets the AI write only in place (it replaces the active board's text), and the handoff forbids rewriting `fa7f6b85` in place. The live check went to the function directly and filed nothing | add "Let the AI write a candidate" to the page (`askWrite(true, true)` already works in `writeStoryboardFromTreatment`), Class A/B | about $0.08 a run |
| Put-back: the c033 fixture through the runner | the Mac was at 9.0–9.3 of 10.2 GB swap all session with another session working; one heavy job at a time there | `IN=… MODELS="/Volumes/T7/Hyenas AVT edit/_avt_work/models" OUT=… PY=~/.avt-venv/bin/python scripts/edit/reproduce_body_only_c033.sh` first (the script alone), then the same two files through `runPutback` | $0 |
| Put-back: live | Class C sign-offs; SQL; a worker | `docs/design/DRESS_AND_PLACE_PIPELINE_2026-11.md` §9 | $0 on his Mac |
| Slices b–f | a comes first | the design note §10 | $0 for b–d; one live run about $2.79 for e |
| A unit test for the candidate fallback in `src/lib/storyboard/build.ts` | that path has no tests at all; the review found nothing wrong in it | mock `draftTreatmentClips` and the variation calls | $0 |
| Writer nits the reviewer left open | none blocks | `estimateCostUsd` ignores the montage treatment call; `finish_reason` is not read; one rare paid failure returns before the `writer_runs` row exists; `sung_lines` in the request is a fragment count | $0 |

## 3. Expected values

| Check | Expected | Where it was measured |
|---|---|---|
| Ledger totals | YSL 638.57, YSL environment 124.29, Hyenas 38.24, Partnership 58.72 | `python3 scripts/audit/ledger_normalise.py --check`, 19 Nov |
| Classic writer prompts unchanged | fingerprints `3998:1a3nsb2`, `12620:ngyn8g`, `11114:rl13c0` (footage) and `1759:awxvp7`, `10381:8161cd`, `8875:wl1zkd` (no footage) | `contract.test.ts`, taken from `main` `8d39aae7` |
| Session-start hook output | under 9,500 characters (9,497 after the audit PR) | `scripts/edit/tests/test_problem_index.py` |
| Put-back capability on the Mac | `{"ok":true,"versions":{"python":"3.9.6","numpy":"2.0.2","opencv":"5.0.0","mediapipe":"1.2.3"}}` | `putbackCapability()` with `AVT_PUTBACK_PYTHON=~/.avt-venv/bin/python`, `AVT_MODELS` on the T7, 19 Nov |
| c033 fixture | `frames 240 swap frames aligned 89 max \|out-original\| on face/hair/skin: 0`; decoded MD5 `5f268d20fa6a440487ccfa8bbcab4dd4` on the pinned versions only | `scripts/edit/reproduce_body_only_c033.sh` (NOT run today) |
| A live montage run | reply `style: "montage_twists"`, `promptFingerprint` `16494:1wspg49` (changes with the instructions), `coverage.writer.droppedScenes` listed; every scene's first shot sings its quoted words; no scene holds more than 2 shots or 4.5 s | runs `52b0d405` and `352f89e4`, 19 Nov |

## 4. Cheap commands that tell the outcomes apart ($0 each)

```bash
# Is the writer change deployed? Read the newest writer run's evidence through the AVT MCP:
#   avt_select writer_runs, columns "id,created_at,coverage_json->writer", newest first, limit 1
# coverage_json.writer present with style + promptFingerprint → deployed; absent → the old function is still live.
```

```bash
# Is the job queue live? Through the AVT MCP:
#   avt_select edit_renders, columns "job_kind", limit 1
# an error "column edit_renders.job_kind does not exist" → migration 20261113120000 is still unapplied (state on 19 Nov).
```

```bash
# Does every audit number still reproduce?
python3 scripts/audit/ledger_normalise.py --check
```

## 5. Do not

- Do not re-test the put-back, the matte or the swap: reproduce the fixture. `docs/PROBLEM_INDEX.md` rows hold.
- Do not port the Python, and do not add a free-form override to a put-back job: a new setting is a new preset.
- When asking Lovable for an edge redeploy, say "do not edit or commit any file, package.json and lockfiles
  included". The first request today left a `package.json` bump on `main` without its lockfile and broke `npm ci`
  (fixed in #514). Send it with `wait: false` and read the answer with `get_message`: a waited call times out.
- Do not deploy `edit-render-worker-api` from #512 before its SQL is applied **and** signed off. (A worker that asks
  only for edit jobs keeps working either way; a put-back claim needs `claim_edit_render_kinds`.)
- Do not open a Supabase dashboard or run the CLI for the SQL: Lovable's SQL editor only.
- Do not mark anything approved. Do not make a put-back clip a shot's primary: it is filed unselected.
- `docs/PROBLEM_INDEX.md` is 3 characters under the session-start hook's limit. A new row needs an old row shortened.

## 6. Fendi's decisions (plain)

1. **Where the put-back worker runs.** Recommended: his Mac, $0, one job at a time, only while it is on with the T7
   plugged in. The alternative is a rented machine with a monthly bill (not quoted).
2. **Whether the Blender light match may be a default.** He has not judged showroom v9 `436ffebe` or room 2 v2
   `b2ad4ae6`. Until he does, the pipeline's light stage uses only the two tools he approved in words
   (`place_him_over_plate.py --gain --contrast`: "I like it"; `cover_regrade_figure.py`: "Ok I like lift b g2").
3. **The writer's line → picture table** in section 1b: he judges it. Nobody else does. If it is not good enough, the open question is the text model, which this handoff barred changing.
4. Provider invoices and top-up totals (Higgsfield, Fal, Google): only he can read them. The audit's dollars are
   list-price estimates until he does.

## 7. Money

| Item | Estimate | Spent |
|---|---|---|
| Audit | $0 | $0 |
| Writer live checks | about $0.08 a run, three allowed | **$0.1463**, two runs (`52b0d405` $0.075, `352f89e4` $0.0713) |
| Lovable edge redeploys | not in the handoff's table | two requests to Lovable's agent; 0.7 workspace credits reported for the second |
| Fixture reproduction | $0 | $0 (not run) |
| One end-to-end live run, 4 s window | about $2.72 swap + $0.07 matte | $0 (not run) |
