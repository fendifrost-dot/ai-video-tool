# One real composite from an original take · 4 October 2026

**The ask:** produce one playable composite from existing original footage that preserves the recorded performance,
with its strengths and defects shown. **$0** — no paid generation, no subscription, no paid compute.

**The verdict: USABLE WITH SPECIFIC LIMITATIONS.** The performance survives bit-exact; the matte is good on the body,
the cap, the beard and the glasses; and it fails in two named, measured ways — pieces of the room that travel with
him on a minority of frames, and a light fringe on motion-blurred limbs. Both have specific fixes, one of them a
recording change.

---

## 1 · What already existed, and the correction that forced

Before writing anything I inventoried the repo's segmentation and matting. **`scripts/edit/composite_environment.py`
already does this**: RobustVideoMatting (ONNX, CPU, recurrent — so the alpha is temporally coherent), a rembg/U²-Net
alternative, shadow-aware refinement in the uncertain band, component cleanup, hole filling, temporal median,
feathering, and a matte export for re-compositing.

**So the gap I reported in PR #168 — "AVT has no matte step for ordinary footage" — was wrong.** I had read a handoff
summary instead of the file. `compatibility.ts` now says what is true: the matting exists but only as a local script
nothing in the app can call, and it has measured failure modes. Nothing new was added to do the matting; this work
uses what was there.

## 2 · The segment

**S06, 0.00–2.50 s** — the busiest 2.5 s in the take by frame-to-frame difference (mean |Δ| 7.16 against 5.56 for the
quietest candidate window), chosen because it contains the fast hand gestures and the motion blur that a matte is
worst at. 75 frames at 30 fps, 1080 × 1920. The **original performance take**, not a restaged result.

## 3 · Colour, explicitly

These takes are **HLG** (`arib-std-b67`, BT.2020). Decoding one with a plain `scale` — which is what the compositor
does — does not apply the HLG curve. Measured on this frame: mean channel spread **22.6 naive against 41.4
converted**. `colour_naive_vs_converted.jpg` shows it; the flag patch and the shelf go from washed out to real.

So the harness converts **once**, at the cut:

```
zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,
tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p
```

…and tags the intermediate `bt709`, which the harness then asserts, so a second pass downstream cannot double
tone-map it. **The original file is only ever read.**

## 4 · The performance is bit-exact, and that took a finding

The brief says not to regenerate the performer. Three measurements, over the eroded matte core:

| | |
|---|---|
| the matter's exported foreground vs the source | **max \|Δ\| on any channel of any pixel, 19 frames = 0** |
| my blend from its own fg + alpha, encoded and decoded identically | `out = 0.9989 × src − 1.16`, mean \|Δ\| 1.72/255 |
| **the compositor's own output** | `out = 1.0512 × src − 12.53`, mean \|Δ\| 8.84/255 |
| **the delivered composite**, measured on the shipped file | `out = 0.9993 × src − 1.19`, mean \|Δ\| 1.31/255 |

The matting is exact. The **blend** is not: `composite_environment.py` line 469 applies
`(fg − 128) × 1.06 + 124` — a 6 % contrast stretch and a black crush — unconditionally, and `--cool 0` does not turn
it off. The middle row rules out the encode: same frames, same `libx264 -crf 16`, same decode.

**That file was not changed.** Other sections were graded while this was in place. The harness asks for
`--matte-only` and blends itself, which keeps the performance bit-exact. Reported to that lane in
`docs/handoffs/COMPOSITE_FINDINGS_2026-10-04.md`.

## 5 · The defects, measured and shown

Two renders from one matte: the composite on a plain teal cyc, and a **magenta/green checker** so nothing hides.
The cyc was chosen to contrast with khaki, cream and skin — no hue in the take is near it, so spill shows.

**`edges_head_cap_glasses.jpg`** — five frames of the checker render, cropped to his head. The cap's brim and crown,
the beard, the ear, the collar and the **thin metal arms of the glasses** all cut cleanly, and the skin keeps its
colour with no checker contamination — no magenta or green bleeds into him anywhere. The defect visible here is a
**thin light fringe, 1–2 px**, along the top of the cap and the near shoulder: residue of the cream door behind him.
It is small, and it is present on every frame.

**`edges_hands_motion_blur.jpg`** — five frames of the same render, cropped to his hands. This is the real failure and
it is worse than the head crop suggests. Where a hand is moving fast the matte gives it **partial alpha, so the
checker shows through his fingers and forearm** — on f0 the sweeping arm is a translucent smear with the background
pattern legible inside it, and on f14 the fingertips are see-through. Where the blur is milder the edge is cut but
keeps a **bright fringe** from the door. A blurred edge genuinely contains background, so neither is a matter bug in
the usual sense; the matte is being asked a question the frame does not answer.

**Leaks** — pieces of the room detached from his body, over 2000 px:

| matte | frames affected | worst piece | body kept |
|---|---|---|---|
| default | **12 of 75** | 35,731 px | 622,788 px |
| `--rvm-peel` | **7 of 75** | 14,760 px | 615,719 px (−1.1 %) |

The peel roughly halves the leaks and costs 1.1 % of the body, so the delivered composite uses it. The worst leak
is a dark bag on the closet floor that reads as attached to him.

**Temporal stability** — frame-to-frame change in matted area: median **0.76 %**, max **4.4 %**, seven frames over
2 %. The jumps are at the fastest limb motion, which is where the matter gains or drops a hand. That reads as
flicker on exactly the frames the fringing is worst.

## 6 · Timing — nothing was retimed

| | |
|---|---|
| source cut | 2.50 s, 30 fps, **75 frames** |
| composite | 2.50 s, 30 fps, **75 frames** |
| expected (2.50 − 0.00) × 30 | **75** |

Frame for frame with the cut. No frames dropped, duplicated or resampled; the compositor is run at the source's own
rate (its default is 24, which would have retimed this).

## 7 · What was checked by arithmetic, and what was not

**Checked** (`scripts/qa/composite_verify.py`, all of it over the files themselves): frame count, rate and duration
against the cut and against (end − start) × fps; the performer's pixels against the source as a fitted gain and
offset; detached matte components per frame; frame-to-frame area jump; output mean and spread.

**Not checked, and the report says so in its own output:**

* **Lip sync.** It is a comparison against a performance, not a property of one file — `takeCheck.ts` does that, and
  this take carries no audio track at all. **No audiovisual sync verification was performed and none is claimed.**
* Whether the background's perspective and light are plausible for this room — a visual judgement. By eye the teal
  cyc is a flat field with no perspective to contradict him, and its soft top-down falloff does not fight the take's
  overhead key; a plate with real geometry would be a harder test and has not been run.
* Whether the edges look right. That is what the diagnostic render is for, and it is judged above by eye, not by a
  number.

## 8 · Verdict

**Usable with specific limitations.** Usable because the performance is bit-exact, the timing is frame-exact, the
colour conversion is correct and explicit, and the matte holds on the body, the cap, the beard and the glasses.
Limited by two defects, both **matting**, neither **capture quality** nor **colour processing** nor **compositing**:

1. **Detached room fragments on 7 of 75 frames** (worst 14,760 px, 2.4 % of his area). Fix: the component filter
   drops pieces below 3 % of the largest, and the worst leak is 2.4 % — raising that threshold, or requiring
   components to touch the body, would remove it. A code change in the matter's cleanup, not a recording change.
2. **Light fringing on motion-blurred limbs.** Not solvable in the matte: a blurred edge genuinely contains the
   background. **This is the recording change that would help most.**

## 9 · The recording changes that would improve this, in order

1. **A faster shutter.** The fringing and the flicker are both motion blur. More light on him, so the shutter can be
   shorter, removes the single worst defect. Nothing downstream recovers it.
2. **Move him off the wall.** He performs a hand's width from a cream door; the door's shadow and its colour are what
   the matte fights. A metre of separation, and a background darker than his shirt, removes most of the fringe.
3. **Clear the floor behind him.** The worst leak is a bag on the closet floor. A clear floor removes that failure
   outright.
4. **Record audio**, even when the music is added later. There is none on this take, so lip sync cannot be verified
   at all, by this or anything else.
5. A green screen would help, but none of the above requires one, and **wearing green does not enable garment
   replacement** — that is a different operation.

## 10 · Where it is in AVT

`scripts/qa/composite_register.py --confirm` put it in, and that is the whole write:

| | |
|---|---|
| asset | `395f799e-6e52-4acf-8d5a-99af4239ae1d` — `edited_clip`, version 1, **pending** |
| parent | `939662aa-…` the S06 take it was cut from, which is **unchanged** (still version 1, still pending, created 2026-09-20) |
| file | `project-clips/…/composites/S06_composite_cyc_0.00-2.50.mp4`, with `diagnostic.mp4` beside it |
| assignment | **none.** `shot_asset_assignments` has no row for it and its `shot_id` is null |
| record | the harness record and the verification JSON both sit on `metadata_json.composite` |

It is one of ten `edited_clip` candidates hanging off that take — the existing parent/version mechanism, used as it
already is. **Nothing was overwritten, no shot silently starts playing it, and the accepted timeline is untouched.**
A person selects it in Storyboard, or does not.

## 11 · What is executable today, and what is not

**Today, by hand, on a build box:** everything above. `scripts/qa/composite_take.py` (convert → matte → blend →
record), `composite_verify.py` (the checks), `composite_register.py` (upload + one candidate asset row).

**Not today, in AVT:** nothing in the app, an edge function or a job queue can call the matter. There is no colour
conversion step in the app. There is no compositor UI, and this tranche did not build one. **A composite produced by
this harness proves the route; it is not evidence of unattended production**, and the candidate asset says so on its
own record (`metadata_json.composite.environment`).
