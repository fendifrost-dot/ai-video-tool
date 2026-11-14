# Hyenas — spend ledger (opened 13 Nov 2026)

Project `87fc3244-de44-45a3-b2ba-7fe54222dc90`, variation `f4971915-c776-47e7-abd5-91b4e25d4938`.
Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION. Estimates are list prices; **billed is unknown on every row**
(no invoice is readable from here). Fendi, 13 Nov: "I'm not concerned about the budget."

## The Claude Code session of 13 Nov (the eight performance shots in the 3D set)

| # | When (UTC, 13 Nov) | What | Route | Estimate | Result |
|---|---|---|---|---|---|
| 0 | before 09:05 | the set's look still (G-Wagon, flares, smoke) | `world-still-proxy`, `gemini-nano-banana-2.1`; job id not re-read | $0.27 | `_avt_work/set3d/ref`; the Blender set is built from it |
| 1 | 09:30 | the same still without smoke and flares (texture for the set's surfaces) | same; job `df181ffe`, prompt version `hyenas-set3d-texture-nosmoke-v1` | $0.27 | asset `93b20e39`; Fendi on the empty set: "The scene looks good" |
| 2–3 | 14:54, 14:55 | hyena reference, lying (v1, then menacing) | same; jobs `321520c8`, `eb94f3ab` | $0.54 | assets `6f223beb`, `c047ad30` |
| 4 | 18:49 | hyena reference, three-quarter, whole body | same; job `a8f842d0` | $0.27 | asset `10f6fe80` |
| 5 | 21:32 | hyena reference, standing | same; job `a376f8ab` | $0.27 | asset `e82bc760` |
| 6 | 23:07 | hyena reference, lunging | same; job `0330c497` | $0.27 | asset `0cfa5c84` |
| 7–19 | 15:00–23:45 | thirteen Genjutsu object swaps (720p, 4 s): verse 11.1 four attempts (`8084464a`, `79373f0e`, `6fa0e053`, `87166179`); 0.9 two (`37b7f79b`, `ebdae3f3`); 5.2 (`459e59e8`); 17.9 two (`0e711941` sitting, `95292182` lunging); 25.3 (`9529a198`); 29.3 (`215ef071`); 34.8 (`c331c53d`); 41.2 (`d3e53605`) | `proxy-provider-call` → Higgsfield `genjutsu-object-swap`, $2.72 each | $35.36 | eight used in the shots (11.1 uses `6fa0e053`); `8084464a`, `79373f0e`, `87166179`, `37b7f79b`, `0e711941` are the attempts not used |
| 20–28 | 15:33–23:47 | nine mattes of the put-backs | `matte-video-proxy` (veed), jobs `508884e3`, `57d914e5`, `2fd728a1`, `b8236809`, `ba11ffaa`, `e82c6aba`, `4c8062db`, `ef9b8c5f`, `5b515436` | $0.66 | used as delivered (verse 35.7: two boxed repairs on top) |
| 29 | 17:19 | one SwitchX relight test (Beeble) | `switchx-background-proxy`, job `d13dd7a3` | $0.33 | not used: it redrew his face |
| 30 | 14 Nov 10:56 | Beeble VFX Pass Generator (SwitchLight 3) on the built verse 26.1 shot (57 frames, 1080×1920): all passes, Normal used | Beeble web app, Fendi's personal workspace, signed in by the agent with the emailed code (Fendi's go, 14 Nov) | 9 credits (90 → 81; inside his plan, no purchase) | used: `relight_comp.py --normals`, candidates `4485a62c` (1.0) and `b54c76a5` (1.5) |

**Total at estimate: about $38.24** (7 stills $1.89, 13 swaps $35.36, 9 mattes $0.66, 1 relight test $0.33). Everything else in the session (put-backs, the Blender set and renders, layers,
previews, checks) ran on the Mac at $0.

- VERIFIED: rows 1–6 and 20–29 are `provider_jobs` rows of this project, read on 13 Nov. Rows 7–19 are counted from
  the raw swap files and the session's notes on the T7 (`_avt_work/gate2/swap1`–`swap4`, `_avt_work/sections/*/swap_*`,
  `sections_notes.txt`, `shot1/gate5_shot_v1_notes.txt`); swap jobs are not in `provider_jobs`.
- OBSERVED: row 0 is from the session's running note ("Gemini stills 7"); its `provider_jobs` row was not re-read.
  The swap times are the span of the session, not each job's time.

## Earlier Hyenas spend, not itemised here

From `docs/handoffs/HANDOFF_HYENAS_PERFORMANCE_OVERHAUL_2026-11-13.md` (the chat session of 12–13 Nov, list prices):
nine Genjutsu swaps ($24.48), one refused 2 s job and one Bad Gateway submit whose charges are not known, nine mattes
(about $0.65), about ten single-frame SAM calls of unknown cost, earlier plates, stills, cutaways and tests. No row
of that is in a ledger. An agent with the time should rebuild it from `provider_jobs` for this project.
