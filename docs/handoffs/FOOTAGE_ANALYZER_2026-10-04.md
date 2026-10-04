# Footage analyzer → the testing and integration agents · 4 October 2026

> From the Claude Code session building the source-footage analyzer (branch `claude/footage-analyzer`).
> Full write-up and the real-footage reports: `docs/research/results/2026-10-04-footage-analyzer/`.

## What landed, in one line

A take can now be READ before anything is generated against it — framing, where he stands and how far he travels,
whether the camera moved, how it is lit, how sharp it is, how hard he is to cut out — and that reading is turned into
what a background would have to be, plus one recommended route with its reasons. Advisory: no clip is regenerated, no
asset replaced, no treatment edited, no timeline moved. **$0 — no provider call of any kind.**

## Shared files I touched, so a rebase is predictable

| file | change | risk to you |
|---|---|---|
| `src/lib/media/mp4.ts` | `Mp4Track` gains `rotation` and `transfer`, read from `tkhd`'s display matrix and `colr` | additive; nothing existing reads them |
| `src/lib/storyboard/media.ts` | `MediaAsset` gains `footageAnalyses?` | additive |
| `src/lib/queries/storyboard.ts` | one line parsing `metadata_json.footage_analysis` | one line |
| `src/components/storyboard/FocusView.tsx` | one block, on the source take only, above `BeatCheckPanel` | small |
| `src/components/storyboard/useStoryboardController.tsx` | three new members (`analyzeFootage`, `footageAnalysisOf`, `analyzingOf`) | **if you add controller members too, this conflicts** |
| `src/components/storyboard/storyboardUi.test.tsx` | three lines in the stub controller | **same stub you would edit** |

Nothing in `acceptance.ts`, `beatCheck.ts`, `takeCheck.ts`, `estimate.ts`, `rates.ts` or `provider_rates.json` was
touched, so the rate correction and the acceptance record are untouched by this.

## Storage

Readings are kept on the TAKE's own record at `project_assets.metadata_json.footage_analysis`, as a list — two shots
using different stretches of one take legitimately keep two readings. Each carries a fingerprint of the file (bucket,
path, bytes, duration, picture size), the stretch analyzed, the analyzer and spec versions, and the settings. A
reading of a file that has been replaced at the same path is **void** and never shown; an older analyzer's reading is
**stale**, shown with a warning and an offer to read again. **No migration: the column already exists.**

## What this says about restaging, since it bears on your lane

On all three real takes checked (S06, S09, S11 — the originals behind shots 39–42) the recommendation is **composite,
not restage**, and the reason is the one your acceptance work keeps measuring: a composite preserves his performance,
timing and lip movement exactly, and a restage re-renders them. The panel names, in the same breath, the two things
AVT cannot do to deliver a composite today — there is no matte step for ordinary footage, and no colour-transfer step
for the HLG these takes are shot in. A recommendation is not proof it can be executed, and it says so.

## Deployment

The work is on `main` behind no flag, but it is **inert until pressed**: the panel appears on a source take in the
Media view and does nothing until someone clicks *Read the footage*. Nothing runs on load, nothing runs on a
generated clip, and no existing measurement changes.

**For the testing agent:** if you want your measurements tied to a known build, this is the build boundary — it
changes no number any existing check produces. The only behaviour change to an existing surface is that `Mp4Track`
now carries two more fields.

## What is NOT built, deliberately

A compositor, a keying/matte step, rendering infrastructure and garment replacement are all out of this tranche and
reported as gaps where a route needs them. **Wearing green does not enable garment replacement** — background removal
and garment replacement are different operations; the analyzer speaks only to the first.

## Known holes, named rather than left to be found

* Four estimates remain uncalibrated: softness, key direction, subject-vs-background sharpness, separation
  difficulty. All four are marked `estimated` with a stated limit, and by the module's own rule they can only ever
  produce a *preference*, never a hard constraint.
* `faceNearEdge` reads his **face**. A shoulder or an elbow leaving frame will not show up in it.
* The panel defaults to the whole file rather than the stretch a shot uses. Plumbing the box's range through is the
  next sensible piece of work, and until then a narrower reading shows as stale.
* Validated on two takes from one room, one camera, one light. A moving camera, a second person, a dark take and a
  wide lens are all unproven.

## Green screen

Fendi does not have one yet and the analyzer does not need one. The validation procedure for when the footage arrives
is §8 of the results doc — three takes (screen, control wall, and one where he deliberately touches the edge), with
four stated things that should be true and **can fail**.
