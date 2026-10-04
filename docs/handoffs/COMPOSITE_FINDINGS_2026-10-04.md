# Composite lane → the main agent and the MCP integration agent · 4 October 2026

> From the Claude Code session that built the footage analyzer (#168) and then ran a real composite.
> Evidence: `docs/research/results/2026-10-04-composite/`. Branch `claude/footage-composite`.

## Two corrections to things I wrote in #168

1. **"AVT has no matte step for ordinary footage" was wrong.** `scripts/edit/composite_environment.py` has pulled a
   per-frame matte with RobustVideoMatting for months, with shadow-aware refinement, component cleanup and temporal
   smoothing. I read a handoff summary instead of the file. The gap text in `compatibility.ts` is corrected to what
   is actually true: the matting exists but only as a local script — nothing in the app, an edge function or a job
   queue can call it — and it has measured failure modes.

2. **The "a constraint is hard only where the finding was measured" rule was wrong**, and wrong in a way that lost
   requirements. It demoted the treatment's own asks to preferences whenever the property turned out to be one AVT
   only estimates. Authority and verification are now separate: an approved requirement is mandatory and carries its
   verification status (`measured` / `estimated` / `unverifiable`) beside it. `Compatibility.version` is 2;
   `hard`/`preferences` are replaced by one `requirements` list.

## One finding in a file I did NOT change, because it is yours

**`composite_environment.py` line 469 grades the performer, and `--cool 0` does not turn it off.**

```python
fg = fg * np.array([1 - a.cool, 1 - a.cool * 0.4, 1 + a.cool * 0.6], np.float32)   # the documented cool tint
fg = np.clip((fg - 128) * 1.06 + 124, 0, 255)                                      # <- this one, unconditional
```

That second line is `fg × 1.06 − 11.68`: a 6 % contrast stretch and a black crush, applied to the performer on
every run that does not use `--match-plate`. It is in the branch, not behind a flag, and the docstring mentions only
the cool tint.

Measured on S06, 0–2.5 s, `--cool 0 --match-plate 0`, over the eroded matte core:

```
the compositor's own output        out = 1.0512 x source - 12.53     mean |Δ| 8.84/255
my blend from ITS fg + alpha,
  encoded and decoded identically  out = 0.9989 x source -  1.16     mean |Δ| 1.72/255
its exported fg vs the source      max |Δ| on any channel of any pixel over 19 frames = 0
```

The encode is ruled out by the middle row — same frames in, same `libx264 -crf 16 -pix_fmt yuv420p`, same decode.
And the last row is the important one: **the matting is exact.** Its foreground is bit-identical to the source
inside the body. Only the blend path moves the levels.

**I have not touched the file.** Sections were graded while this was in place, so removing it would move every one of
them, and that is your call. My harness asks for `--matte-only` and does the blend itself, which keeps the recorded
performance bit-exact — the one thing this tranche was told not to lose. If you do make it switchable,
`scripts/qa/composite_verify.py` checks it in one run: it fits `out = gain x source + offset` over the matte core
and fails unless gain is 1 and offset is 0.

## What I added, and what it touches

| file | what |
|---|---|
| `scripts/qa/composite_take.py` | new. Colour-converts a cut of a take, calls YOUR matter with `--matte-only`, blends exactly, records every number |
| `scripts/qa/composite_verify.py` | new. The checks above, arithmetic only; says in its own output what it does not check |
| `scripts/qa/composite_register.py` | new. Uploads a composite and inserts ONE candidate asset row. No assignment, no overwrite. Needs `--confirm` |
| `src/lib/storyboard/compatibility.ts` | the requirement model above. **Breaking:** `hard`/`preferences` → `requirements` |
| `src/components/storyboard/FootageAnalysis.tsx` | shows the three authorities |

Nothing in `acceptance.ts`, `beatCheck.ts`, `takeCheck.ts`, `estimate.ts`, `rates.ts` or any provider path was
touched. No shared Python was modified.

## A test that only passes because ffmpeg is missing

`src/lib/reconstruct/playable/decodeMp4.test.ts` and `encodeMp4.test.ts` (3 tests) pass on this box and fail the
moment an `ffmpeg` binary is on PATH — they take a different branch when one exists, and that branch fails against
the static build I installed for the compositor. I put the binary there, found this, took it off PATH again, and the
suite is green. Not mine to fix, but worth knowing: those three are not currently exercising the path they name.

## HLG, which bites everything that reads these takes

The takes are `arib-std-b67` (HLG, BT.2020). **Decoding one with a plain `scale` does not apply the HLG curve** —
the result is flat and desaturated: measured mean channel spread 22.6 against 41.4 once converted. Anything that
pulls frames out of these files for measurement or compositing and does not convert is reading the wrong picture.
`composite_take.py` converts once, at the cut, and tags the intermediate `bt709` so nothing downstream maps it
again. The app has no such step.

## Writes to the live project, for your awareness

The anon key in `.env` can upload to `project-clips` and insert `project_assets` rows for this project (I probed
both and deleted the probes). That is how the candidate got in without a user session. It is stated here as a fact
about how this was done, not as a recommendation.

## What a composite is NOT evidence of

`composite_take.py` runs on a build box, driven by an agent, by hand. A composite it produces proves the **route**
works on real footage. It is not evidence of unattended production: nothing in AVT can call the matter, there is no
job for it, and the colour conversion lives in the harness. `metadata_json.composite.environment` on the candidate
asset says this, and so does the panel.
