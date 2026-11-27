# PR #528 — Class C reviews · effects preview · 23 November 2026

`docs/ARCHITECTURE_REVIEW.md` requires three sign-offs before a Class C change merges: architecture, product,
security. The architecture and security reviews were each run as an independent, read-only review of the branch
(`effects-preview-cut-page`, first at `a7616325`, diff against `origin/main`) by a separate reviewer agent that was
given the code and the design note, not the author's conclusions. Each returned a verdict and numbered findings. The
dispositions below are what the authoring agent did about each. The reviewers are agents; neither is the director,
and neither verdict is his.

Product is the director's. Fendi, 23 Nov 2026, asking for it: "we need to have a way to preview post production and
what's been built with effects in real time without rendering." After seeing it run on Partnership (screenshot and
the preview copy posted to him): "We'll hand everything over to grokbot when we merge and publish you can do that on
your end now."

Labels follow the repo taxonomy: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION.

## Verdicts

| review | first pass (`a7616325`) | blocking | after fixes (`cf083403`) |
|---|---|---|---|
| Architecture | APPROVE WITH CHANGES | A1, A2 | **APPROVE** (same reviewer, re-check of `git diff a7616325 cf083403`: A1 CLOSED, A2 CLOSED, nothing new blocking) |
| Security | APPROVE WITH CHANGES | none | dispositions below |
| Product | the director's words above | | |

## Architecture findings

- **A1 (blocking) — a copy took its stretch before its file could be shown.** With a wrong path, a deleted file or a
  refused link, the board's video rested and the "effects" badge showed over a frozen frame for the whole stretch
  (VERIFIED by the reviewer's scratch test). **Applied:** in `SequencePlayer.tsx` a copy owns the moment only when
  its element exists, has no error and has metadata; `onLoadedMetadata` and `onError` re-run the sync. On the Cut
  page the copy is put up only after `loadeddata`. Tests: "keeps the board on the stage until the copy can be
  shown", "plays the board, unmarked, when the copy's link is refused or its file is broken", "takes the copy off
  again when its file fails".
- **A2 (blocking) — the note said a copy could not be selected as footage; two lists offered it.** The Cut page's
  Versions panel (`groupVersions`) and Setup's "Already in this project". **Applied:** both leave out any row that
  carries the `effects_preview` key, readable or not (`MediaAsset.isEffectsPreview`). Test:
  `versionLabels.test.ts`. OBSERVED, left: the specialist tools' generic "pick a video" lists still offer it; the
  design note now says so.
- **A3 — an ended copy could be restarted by `play()` on the Cut page.** **Applied:** the copy's own length is passed
  to `effectsMediaTime`, it does not run while held, and `syncElement` does not play an ended copy (`holdAtEnd`).
- **A4 — a black beat at the start of a stretch on the Cut page.** **Applied** with A1: the copy is opaque only once
  a frame is loaded.
- **A5 — the layer was rebuilt on every edit of the cut.** **Applied:** two memos; the layer depends on the
  project's files alone.
- **A6 (HYPOTHESIS) — when a copy ends mid-shot the board's video is cued one tick late.** Not changed. Named test:
  a real run across the end of a copy that ends inside a shot, watching for a stale frame.
- **A7 — doc drift; a comment on the wrong line.** **Applied.**
- **A8 — test gaps.** **Partly applied:** the no-link, not-ready, broken-file and event-suppression paths are now
  pinned. Still open: every Review test runs with no song, so the copy's playhead against a moving clock is proven
  only by the manual in-app run (below); the Python ramp test tolerates about two frames (the reviewer separately
  VERIFIED the maker frame-exact at 10 offsets on three kinds of source).
- **A9 — rejecting the newest version brings back the one before it.** DECISION: kept, and now written in the design
  note and the recipe (reject every version to get the plain clip back).

Raised by the re-check at `cf083403`, all non-blocking, none applied (the merged code is the code that was approved):

- **N1 (HYPOTHESIS)** — a browser that ignores `preload="metadata"` (some phones) never reports the copy ready, so
  the copy never shows there. It fails open: the board plays, the strip stays blue. RECOMMENDATION: call `load()`
  once on the hit copy while it is at `readyState 0`. Named test: Review on a phone.
- **N2 (VERIFIED, read)** — the Cut page reads the copy element's length during render; right after a switch between
  two copies it can be the previous file's for one render, and corrects itself on `loadeddata`.
- **N3 (HYPOTHESIS)** — in Review a copy with metadata but no decoded frame yet is opaque black for a moment.
- **N4 (VERIFIED, read)** — the specialist tools' "pick a video" lists still offer a copy (same as the A2 note).

Checked and found sound by the reviewer: no behaviour change for projects with no copies; spans sorted, disjoint
and independent of input order under a 400-round fuzz; clean hand-off at span boundaries; section playback keeps
song addressing; the maker's record matches the parser.

## Security findings (none blocking)

- **S1 — the design note claimed more than the code enforced.** The query is by project, and with SEC-4 open
  (`RISK_REGISTER.md`) `project_assets` and `project-exports` are writable beyond the owner; one inserted row puts a
  picture over a stretch of the players. Not a new signing primitive (the board already signs every row's bucket
  and path). **Applied:** only a file in `project-exports` under `effects_preview/` is played
  (`isEffectsPreviewFile`); the note's Security section rewritten; a dated entry under SEC-4.
- **S2 (HYPOTHESIS, older than this PR) — `signRefs` passes a row's bucket to the storage client without an
  allowlist, and the client puts it in the request path unencoded.** Not changed here: it is the shared signed-link
  code, its own Class C change. Recorded under SEC-4 with its named test. S1's fix keeps the new code path off it.
- **S3 — `effectsLayer` grew cubically on hostile rows** (1000 rows 3.5 s). **Applied:** the newest 50 sections at
  most; test with 1000 hostile rows under 500 ms.
- **S4 — maker script.** **Applied:** `fullmatch` on the section slug (a trailing newline passed `match`); the two
  ids validated as ids; a path starting with `-` is passed as `./-…`.
- **S5 — doc drift.** **Applied.**

Checked and found sound by the reviewer: links are built by the storage client from the project's own storage
origin and appear only in `src` (no logging, snapshots or error text); row strings reach only React text, `title`
and `aria-label`; strip positions are finite and clipped; every `subprocess` call is an argument list; no token,
key, signed link, e-mail address or media in the diff; the CI job that gained a test path uses no secrets; no file
under `supabase/` changed, so no RLS integration test is required by this change.

## What was run

- VERIFIED: 22 unit, 15 mocked-integration, 14 Python cases added (3 encode synthetic media with ffmpeg). 0
  provider-live, 0 real-media-benchmark, 0 deployment-smoke. CI green on `a7616325`.
- OBSERVED (dev Mac, full `npm test` at `cf083403`): 3284 passed, 3 failed; the 3 are older style/vfx tests that
  shell out to `python3` and need numpy, which that machine's system Python lacks.
- VERIFIED (manual, twice: at `a7616325` and again after the fixes): the branch served locally, signed in as the
  owner, Review of Partnership. One bar at 2:07 to 3:27; with the song playing the copy was 0.03 s from
  `song time - song_start` at two readings; Effects off gives the board back, on gives the copy back.
- NOT verified: the Cut page against a real cut; phones.

## After merge

Lovable **Publish** only. No SQL, no edge function redeploy.
