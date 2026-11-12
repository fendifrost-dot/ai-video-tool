# Recipes: which method, when

The methods Fendi approved, one page each, written so any agent (Claude, Grokbot's Director, Claudia, Cursor) can run
them from the repo and the AVT tool without this session. Read the page before the first paid call. Every paid call is
quoted, dry-run first, and recorded in `docs/LEDGER_YSL_TESTING_BUDGET.md`.

## Is he in the shot?

| The shot needs | Method | Page | Where it runs | Cost |
|---|---|---|---|---|
| Him rapping a line (a performance shot) | his REAL take, synced on the song; clothes changed with the face-preserving swap | [`FACE_PRESERVING_CLOTHING_SWAP.md`](FACE_PRESERVING_CLOTHING_SWAP.md) ("Run on a new take") | `dress-clip` in the tool + `scripts/edit/body_only_swap.py` offline | ~$0.68 per source second once, then $0 |
| Him in the scene, not rapping (b-roll with him) | recipe F: a silent window of his footage copied loosely, face exact, mouth at rest | [`BROLL_WITH_HIM_STILL_MOUTH.md`](BROLL_WITH_HIM_STILL_MOUTH.md) | `montage-shot` / `avt_montage` in the tool | $2.219 per 4 s |
| Him in the scene in a different outfit | recipe F on a window dressed first, or the swap put back over the render (c041 TENTH) | both pages above | tool + offline | both prices |
| His real take inside a generated scene | matte both, put the real him over the generated him | [`FACE_PRESERVING_CLOTHING_SWAP.md`](FACE_PRESERVING_CLOTHING_SWAP.md) ("Putting the dressed real him into a generated scene") | `scripts/edit/replace_him_in_clip.py` | cents (mattes) |
| The place and its people, without him | b-roll montage | [`MONTAGE_MUSIC_VIDEO_WORKFLOW.md`](MONTAGE_MUSIC_VIDEO_WORKFLOW.md) step 7 | `montage-shot` | $1.85 per 4 s |
| A shot whose generated him moves his mouth | not usable as is: replace by one of the rows above, or hide the mouth in the edit (punch-in below the chin, cutaway) | [`../handoffs/HANDOFF_GROKBOT_FIRST_HALF_2026-11-05.md`](../handoffs/HANDOFF_GROKBOT_FIRST_HALF_2026-11-05.md) ("Mouth rule") | `scripts/edit/mouth_scan.py` finds them | $0 |

**Every shot with him passes [`../SHOT_RULES.md`](../SHOT_RULES.md) before it is posted.** **Never** apply generated lip-sync or any face-altering pass to Fendi. His mouth in a shot is either his real take's
or at rest.

## The skills

| Skill | Load it for |
|---|---|
| [`.claude/skills/avt-music-video-build/SKILL.md`](../../.claude/skills/avt-music-video-build/SKILL.md) | building the next video end to end: the YSL lessons, the motion budget for performance shots, Gemini-over-Grok stills, the cutter's handoff format, how a delivered cut is verified |
| [`.claude/skills/avt-clothing-swap/SKILL.md`](../../.claude/skills/avt-clothing-swap/SKILL.md) | the AVT tool set (every `avt_*` MCP tool, the paid functions, costs, filing) and the face-preserving swap |
| [`.claude/skills/avt-capability-scan/SKILL.md`](../../.claude/skills/avt-capability-scan/SKILL.md) | the weekly scan of the AI tool catalogs against [`../capability/GAPS.md`](../capability/GAPS.md) |

The pages below are the evidence and the detail behind them.

## The rest of the shelf

| Page | What |
|---|---|
| [`MONTAGE_MUSIC_VIDEO_WORKFLOW.md`](MONTAGE_MUSIC_VIDEO_WORKFLOW.md) | the song-to-board workflow: beat grid, scenes, plates, dress, montage per shot, review, ledger |
| [`DRESS_AND_INSERT_WORKFLOW.md`](DRESS_AND_INSERT_WORKFLOW.md) | the storyboard's six steps (Dress this shot, Composite over plate) and what the tool automates |
| [`WARDROBE_SWAP_RECIPE.md`](WARDROBE_SWAP_RECIPE.md) | the tests that chose Genjutsu as the swap engine and the approved looks (superseded in part by the canonical swap) |
| [`PLATE_REALISM_PROMPT.md`](PLATE_REALISM_PROMPT.md) | the prompt rules for place stills and plates |
| [`MCP_UPLOAD_AND_FILE.md`](MCP_UPLOAD_AND_FILE.md) | `avt_upload_asset` and filing a result as the shot's primary (columns, assignment rows) |
| [`IN_APP_EDITOR.md`](IN_APP_EDITOR.md) | the in-app editor |

## Checks that run before a clip is posted ($0)

| Check | Script | Reads |
|---|---|---|
| His face next to his real face | `scripts/edit/face_check.py` | lips, beard, glasses, face shape, row by row |
| Does his mouth move | `scripts/edit/mouth_scan.py` | lip gap / face width per sample; moving = mean > 0.08, spread > 0.03, confirmed on the sheet |
| Seam flicker on a put-back | `scripts/edit/ring_flicker.py` | mean change in a ring around his face, candidate vs original |
| Hat shape on a put-back | `scripts/edit/hat_geometry.py` | shape change per frame |
| The proof | `body_only_swap.py` printout | `max |out-original| on face/hair/skin: 0` |

## Known gap

The face-preserving swap runs only as an offline script; AVT's Dress and Region swap file the whole-frame redraw
(`FACE_PRESERVING_CLOTHING_SWAP.md`, "Integration gap"). An agent with no Python environment can dress in the tool but
cannot finish the put-back there.
