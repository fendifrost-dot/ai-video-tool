# Interrupted Broadcast — the rider sequence rebuilt as 2 s cuts, M5 placed (13 Oct 2026)

YSL (Ice On) `764a63d2…`, variation **Interrupted Broadcast · candidate 5** `882ec381-0fa0-4a76-b23b-b83ebc157372`.
Follows [`PROMPT_FOREST_MOTION_NEXT_2026-10-13.md`](PROMPT_FOREST_MOTION_NEXT_2026-10-13.md) (M5 approved, not placed) and
[`IB_FIRST_HALF_CUT_2026-10-10.md`](IB_FIRST_HALF_CUT_2026-10-10.md) (the first-half cut and its shot table).

Labels follow CLAUDE.md: **VERIFIED** / **OBSERVED** / **HYPOTHESIS** / **DECISION** / **RECOMMENDATION**.

## Where things stand

| | State |
|---|---|
| M5 `fed968b9` | **APPROVED by Fendi, 13 Oct.** Now selected on `c008_2`, its first placement. VERIFIED from the assignment row `de8e2b99`. |
| 7 new rider clips (K1, K3–K8) | **Selected on the board, PENDING director review.** Not approved, and `approval_status` is `pending` on every asset. |
| The 4 clips they replaced | **Kept as unselected versions** on the same shots, each with a dated note saying why. Nothing was deleted. |
| Shots c008, c009, c010, c014 | **Each split into two halves of about 1.96 s.** The second halves are new rows: `c008_2`, `c009_2`, `c010_2`, `c014_2`. |
| First-half render | Built from the board through the app's own `buildTimeline` → `renderContract`, then `render_contract.py`. Covers 0–70.6 s at 1080×1920 and 30 fps, with the song. sha256 prefix `e82663b9d009154d`. **Not stored in AVT.** The file is in the session scratchpad, and a 720p copy was sent to Fendi in chat. |
| Code | `scripts/mcp/split.ts`: an MCP driver for the page's "Split shot here", using the app's own `planSplit`. Class A (a script). |
| Live / deploy | Nothing to redeploy or publish. No SQL, no edge function or front-end change. Every data change was a row write through the AVT MCP. |

### Why the old rider clips were replaced (OBSERVED)

The clips selected on 10 Oct for c008 `84c230bc`, c009 `164227f8`, c010 `0d2eb837` and c014 `91d456be` show a different
woman from the identity authority, ORIGINAL `3fce9cb5`, on a face strip. Each also ran 5 s against beats that should be
about 2 s. M5 matched ORIGINAL. The rebuild uses ORIGINAL as the only face reference, as M5's recipe did.

## The sequence as it now plays (VERIFIED from the render's scene-change times, within 1 frame)

Beat grid: 122 BPM, one bar = 1.96 s.

| Cut | Song window | Clip (asset) | Picture |
|---|---|---|---|
| c008 | 27.45–29.41 | K1 `dcb45b02` | colour; she stands at the horse with the models behind |
| c008_2 | 29.41–31.37 | **M5** `fed968b9` (approved) | colour; mounted, slow push-in. **Letterboxed** (see defects) |
| c009 | 31.37–33.33 | K3 `d81576b5` | colour; side-on walk through the burning trees |
| c009_2 | 33.33–35.29 | K4 `acd2797b` | the drain to black and white; closer side-on |
| c010 | 35.29–37.25 | K5 `8049a6bc` | B&W; hooves through ash and smoke |
| c010_2 | 37.25–39.22 | K6 `627a0c79` | B&W; profile close-up riding |
| c011–c013 | 39.22–50.98 | unchanged | the viewer's room and the TV |
| c014 | 50.98–52.94 | K7 `51519b24` | B&W; rides toward the camera |
| c014_2 | 52.94–54.90 | K8 `a668ffdb` | B&W; push-in as she looks into the lens |

Each clip was generated at 2.04 s: 49 frames at 24 fps, 704×1280. Each plays for one bar, about 1.96 s, so it runs past the
shot end and **never freezes on its last frame**. Generation length ≠ screen time; the tail is simply not shown.

Ground-level forest and rider shots: **neither blind reviewer found lettering, a logo, a monogram or a letter-shaped
path** in any frame. The YSL formation stays an aerial-only device.

## Review evidence

- `docs/review/ib_rider_2026-10-13/render_cut_frames.jpg`: frames taken from the render either side of every cut, 26.9–55.1 s.
- `stills_A.jpg` / `stills_B.jpg`: the seven Gemini source stills.
- `blind_key.txt`: which blind label was which clip. The reviewers saw only the labels.
- `data/rider_still_requests.json`: the 7 still prompts (`ib-rider-v1`) with sha256_16. `data/motion_requests.json`: still → job → Grok request.

### Blind review (2 independent reviewers, ORIGINAL as reference, plus a decoy frame)

| Clip | Reviewer 1 | Reviewer 2 | Reading |
|---|---|---|---|
| K1 (c008) | same, conf 3 | **same, conf 4 (strongest match)** | OBSERVED match |
| M5 (c008_2) | same, conf 3; "jaw rounder and softer" | **leans different, conf 3** | Both flag it as the weakest frontal match. **Already approved by Fendi, so the approval is not reopened.** Recorded so the next identity pass knows. |
| K3 (c009) | face too small | face too small | not judgeable at this framing |
| K4 (c009_2) | profile, cannot tell | same (profile), conf 3 | weak positive |
| K5 (c010) | no face | no face | n/a (hooves) |
| K6 (c010_2) | profile, cannot tell | same (profile), conf 3 | weak positive |
| K7 (c014) | face too small | same, conf 2 | weak |
| K8 (c014_2) | same, conf 3; "loose strands, not sleek" | same, borderline, conf 2; "wider nose and mouth" | borderline |
| decoy (old c008 `84c230bc`) | cannot tell; hair and glove continuity broken | face not visible | Neither confirmed the decoy as her, but neither could reject it: the frame was a poor decoy because her face is turned away. |

The reviewers also flagged these artefacts, all OBSERVED on stills at 540×960:

- K1: the reins loop over the horse's neck attached to nothing, and two blonde extras stand behind her.
- K5: the stirrup iron hangs behind the boot.
- K3: a near foreleg dissolves into flame.
- K8: loose strands of hair.
- K4, from my own pass: her head turns three-quarters toward the camera instead of holding profile.

## Remaining visible defects (what a viewer of the render sees)

1. **M5 plays letterboxed**: black bars top and bottom on c008_2. The source is 848×1056, and the renderer only does
   `contain`. VERIFIED in the render. The fix is either a renderer `cover` fit (Class C, rendering), or an outpaint or regenerate
   to 9:16. **That is Fendi's call, because M5 is his approved take.**
2. **The CRT in c011, c012, c013 and c015 still shows the old rider.** They share keyframe `5d175ab3`, a rider and horse on
   the TV. The figure is too small to read a face, but it is the 10-10 picture, not ORIGINAL. OBSERVED.
3. **c013 holds near-static** for about 1.6 s (47.07–48.77 s, freezedetect) and again at 50.4–50.8 s. This is a pre-existing shot,
   not touched here.
4. The identity spread above: M5 is the weakest frontal match, and K8 is borderline.
5. Not touched: c001–c007, c015–c018, and the open items from 10 Oct (wardrobe, Chicago, c019–c043 empty). The render
   range ends at 70.6 s because c019 onward has nothing selected.

**Motion at normal speed: LIMITATION.** This session cannot watch video in real time. Motion was judged from:

- frame strips at 10 fps,
- scene-change and freeze detection over 27–56 s (cuts land on the bars; no freezes inside the new cuts),
- the per-clip review done before placement.

Smoothness at playback speed is **not verified**. Fendi's viewing of the 720p copy is the check.

## Spend (13 Oct, this pass)

| Provider | What | Billed / basis | Status |
|---|---|---|---|
| Google (Gemini, `world-still-proxy`, `gemini-nano-banana-2.1`, 2k) | 7 stills, jobs `f1df460f`, `0ba94eb7`, `9ac641d6`, `f8c61e7d`, `6cba6c02`, `3848b5af`, `105af67d` | $1.89 at the proxy's conditional rate ($0.27 per still); about $0.53 usage-based; **invoice unknown** | Google billing, under the "more than enough in Gemini" authorization |
| xAI (Grok, `grok-broll-proxy`, image-to-video 2 s, 720p) | 7 clips, request ids in `data/motion_requests.json` | **$0.994** (7 × $0.142, by the usage ticks) | IB lane |
| Re-rolls | none | $0 | No request was repeated. |

Total for the pass: about $2.88 at the conditional rate, or about $1.52 usage-based.

IB lane after this pass, on the conservative reading of the 10-10 count: about $24 before this pass, less $0.99, leaves
**about $23**. The figure is UNCERTAIN: [`LEDGER_YSL_TESTING_BUDGET.md`](../LEDGER_YSL_TESTING_BUDGET.md) has not been
reconciled since 10-01, and the Gemini invoice is unknown. No purchases or top-ups were made.

## Row writes (for audit or undo)

**Shots split:**

- c008 `91809455` now ends at 29.41; c008_2 `032dac9d-41dc-4a84-aa3a-c7ca8907201f` (#44).
- c009 `df2db039` now ends at 33.33; c009_2 `9b1a7fdf-f34f-4c6e-9c92-fb031da9e659` (#45).
- c010 `5c904aa3` now ends at 37.25; c010_2 `311d5e24-9265-4a1f-ac35-dea422cf1c5e` (#46).
- c014 `20ff9ca5` (locked) now ends at 52.94; c014_2 `0201d32c-494b-4128-a8cd-760d82b3f8eb` (#47, locked).

**Unselected, with a note:** `b76deb7d` (c008), `8e6fc93e` (c009), `b4e3671c` (c010), `668c9802` (c014).

**Primary clip assignments:**

| Shot | Assignment |
|---|---|
| c008 | `1571bb2f` |
| c008_2 (M5) | `de8e2b99` |
| c009 | `6b6307fa` |
| c009_2 | `5afc7f19` |
| c010 | `5839b6e9` |
| c010_2 | `b9b1ef5e` |
| c014 | `bebc105c` |
| c014_2 | `19fa6931` |

**Non-primary still assignments:** `22f6a8a1`, `358e3666`, `6fdb0c6b`, `f954ce10`, `76188227`, `1b68dfbc`, `b887452b`.

**To undo one cut:** set its new primary `is_primary=false` and the superseded row's back to `true`.

## How to check this cheaply (expected values)

- `avt_select shot_asset_assignments` where `variation_id = 882ec381…`, `is_primary = true`, `role = generated_clip`, shot ∈
  the 8 ids above → **exactly 8 rows**, one per shot, with the assets in the table above.
- `avt_select shots` where `variation_id = 882ec381…` → **47 rows**. The 4 `_2` rows have `box_origin` = `split`.
- `npx tsx scripts/mcp/contract.ts <workdir> 0 70.6` (PR #223's driver, on a fresh bundle) → `DONE {"frames":2118, "segments":23, … "ready":true}`.
  Segments 8–13 and 17–18 are the eight cuts above.
  - Fewer than 47 shots, or a c008_2 that shows nothing, means a write did not land.
- Bundle note: `project_assets` for this project is over 500 rows. The 500 limit truncates it, and `contract.ts` refuses a
  read at its limit. Fetch the assigned asset ids separately, then keep only the assigned rows.

## Next concrete task

1. **Fendi watches the 720p rider excerpt, 24–57 s** (sent in chat), and approves or rejects each of K1 and K3–K8 by
   name. Record each verdict in the asset's `approval_status` and `notes`. Do not mark anything approved before that.
2. **Re-film the CRT picture** (c011/c012/c013/c015, keyframe `5d175ab3`) so the TV carries K6's profile, or a frame of it,
   with the ORIGINAL rider. This is a world-still edit with the K6 frame as the `screen` reference: one Gemini still,
   about $0.27 conditional. Then re-run the four TV clips only if their motion depends on the screen.
3. **Decide M5's letterbox** (Fendi). Option (a) is renderer `cover` support (Class C). Option (b) is a 9:16 outpaint of
   M5. **Never regenerate M5 itself.**
4. If any of K1/K3–K8 is rejected: re-run only that beat from its still with the same `ib-motion-v1` prompt (about $0.14). Or
   re-draw the still first if the face is the problem (Gemini, ORIGINAL as the only `cast` reference).
5. Carried from 13 Oct:
   - The `grok-broll-proxy` ingest writes `lane: grok_broll_text_to_video` and `source_image_path: null` for image-to-video runs. These are metadata gaps, so the still → clip link lives only in the notes and in `data/motion_requests.json`.
   - CC's 60-cent Grok placeholder needs replacing with the measured rate, $0.071 per second.

## Guardrails for the next agent

- Do not reopen M5's approval, regenerate M5, or repeat these generations. The beats exist; fix only what Fendi rejects.
- Do not delete the superseded clips; they are the previous versions.
- Do not merge PR #223 to get `contract.ts`. It is Class C and needs its reviews. Use it from a local checkout of the PR head, as this pass did.
- Never re-submit a request that may have been billed. Check `provider_jobs` and the xAI request id first.
- Lovable only: no Supabase CLI or dashboard, and no SQL from chat. This pass needed none.

## Report back

For each of K1 and K3–K8, report Fendi's verdict. Also report the M5 letterbox decision, the CRT re-film job and asset ids
with their cost, and an updated 47-row check.
