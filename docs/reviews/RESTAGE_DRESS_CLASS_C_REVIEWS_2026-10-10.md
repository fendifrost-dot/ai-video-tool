# Dressed restaging — Class C reviews · 10 October 2026 · NOT MERGED

Branch `feat/restage-dresses-from-outfit`, reviewed at `88a89da` (diff against `main` `d892359`). Three independent,
read-only reviews, each by a separate reviewer with no shared context beyond the repository and a brief. The reviewers
are agents; none is the director and none of their verdicts is his.

**State: draft. Two of three reviews REQUEST CHANGES, and two merge gates are the director's, not the author's. Nothing
below is fixed yet on purpose — the change is not worth finishing until he has said whether this is the route.**

What the director said (9 Oct 2026): "The performance shot was never meant to be a stand alone shot. That footage is
supposed to be incorporated in some of the AI footage and the clothing swap is to be utilized when inputting me in the
AI footage." The evidence the change rests on: `docs/research/results/2026-10-10-dressed-restage/` (PROVISIONAL, no
verdict).

| review | verdict | blocking |
|---|---|---|
| Architecture | REQUEST CHANGES | A1–A6 |
| Product | REQUEST CHANGES | P1–P5 |
| Security | APPROVE WITH CHANGES | S1 |

## Merge gates that are the director's

- **A1 / P4 — the change contradicts two rules on file.** `CLAUDE.md` hard rule 2: "No AI-regeneration of garment
  imagery; pixel preservation is mandatory." `docs/VIDEO_SWAP_ARCHITECTURE.md` (LOCKED): keyframe + propagation,
  composited onto the original footage; its last line requires any supersession to be "explicit and dated in this
  file — never by a silent drift in runtime code". This route draws him and the garments again. A dated section in
  that document and in the `CLAUDE.md` block, written from his verdict, comes before any merge.
- **A2 / P4 — his verdict on the test.** By `docs/REPRODUCIBLE_BENCHMARK_SYSTEM.md` an agent may not approve its own
  benchmark. The results artifact now exists (the reviewers read the branch before it was written); the verdict does
  not.

## Blocking findings in the code (open)

- **A3 — an outfit can be quietly not applied.** A performance shot whose scene names an outfit key the variation
  lacks, or an outfit with no pieces, plans `{dress: null, problems: []}`: it is restaged in the take's clothes and
  the confirmation says "He keeps … what he wears in the take". `outfitFlags` returns nothing for a performance shot.
  Fix: both cases become problems of `planRestageDress`; the restage path stops bypassing blocking outfit flags.
- **A4 / S2 / P9 — refusals that arrive after the confirmation.** The prompt-length refusal and a garment that cannot
  be read both fire inside `submitShot`: after the cut is uploaded and, when the shot had no place picture, after the
  paid place still. A two-piece dressed prompt is already 1793 of 2000 characters before a light sentence or a timed
  script. Fix: build the dressed prompt and probe the garment pictures before the confirmation; say what is taking the
  room; shorten `dressSentences`.
- **A5 / P5 — acceptance has no line for what this promises.** A dressed clip can read "meets" in Review with nobody
  having held a garment against its photograph; the card chip says "exact garments". Fix: carry `settings.dress` into
  the clip's ask; add by-eye "Wardrobe" and "His face" requirements that stay unverified until judged.
- **A6 — the outfit-provenance check misreads the new record.** A dressed restaging into the shot's own place image
  reads "made from a picture made with other pieces", permanently; a shot dressed from its own list with no outfit
  reads "requested pieces are not recorded". Fix: `displayedOutfitOutdated` certifies from `settings.dress.pieces`.
- **P1 — the refusal tells him to do something the app has no control for.** "Name on this shot the pieces that must
  be exact": the shot wardrobe editor returns null for a performance shot (`Outfits.tsx`). On the real shots (a
  four-piece outfit) every Restage press would refuse with no way forward on the shot. Fix: the editor on performance
  shots, or the refusal as a chooser of two.
- **P2 — what happens to the pieces left off is overclaimed, then never said again.** The prompt says both "He does NOT
  wear the clothes of @Video1" and "anything else he has on … stays exactly as it is there"; which wins for trousers is
  the model's. The confirmation and the job record list only what was sent. With "glasses mandatory", leaving a piece
  to the take is his decision per piece. Fix: `dressNote` and the job name the pieces not sent and the words-only items.
- **P3 — a false note beside the refusal.** With pieces that cannot all go, the card still prints "A restaging keeps
  the clothes he was filmed in … it needs footage of him in that look". Fix: silent when the shot wears any exact
  piece; the route's limit speaks.
- **P4 — the route reads as proven.** `RESTAGE_DRESSED` says "draws him again in the outfit" under verdict
  "storyboard". Fix: say the count sent, "not exact", and — until he accepts the test — that it is unaccepted (a flag
  in the pattern of `LIP_MEASURE_VALIDATED`).
- **S1 — "wardrobe bucket only" is not enforced.** `dress[].path` is any string; storage-js builds the sign URL
  unencoded, so `../project-clips/…` signs in another bucket as the caller. No file the caller cannot already read
  becomes readable (the same weakness is in `still_path` / `source_path`), but the comment and the test claim more
  than the code holds, and the Runs page reaches `submitShot` with no cap of two. Fix: the server route's predicate
  (`_shared/stillReferences.ts`: no `..`, no scheme, image extension, inside the artist's folder) on the dialect and
  in `planRestageDress`; `dress` at most 2; the Runs page refuses or lists a dressed shot.

## Non-blocking (open)

A7 the picture limit belongs in a capability record and in `buildMotionRequest`, not a storyboard constant · A8 / P6
`dressSentences` names "his glasses, his jewellery" (this artist's look, and self-contradicting when a glasses piece is
sent), and repeats the garment sentence of `references.ts` without its yield clause · A9 "wardrobe still loading" can
be permanent (no artist, or a query error) · A10 text that is now false: `setup.ts`, `treatment-writer-proxy/contract.ts`
(an edge redeploy), `SetupPage.tsx`, `shotSpec.ts`, `restage.ts` header, `dialect.ts`, the Python docstring · A11 the
job records id and label, not the picture's path or version; the price rule is matched to charges with one picture
only · A12 dressing is keyed on shot type, not on the method (`footage` shots) · A13 `dress[]` on another route is
ignored; the Python refusal sits after the upload · A14 test gaps (controller, one-piece grammar, A3/A4/A6) · A15 / S5
`RISK_REGISTER.md` needs an entry (garment photographs to a video provider on 24-hour links, signed in the browser, no
server record check) · S3 signed-link tokens are not redacted from stored or shown error text on this route (the
channel is pre-existing) · S4 the 24-hour lifetime of the links · S6 "charged" price basis claimed for a request with
three pictures · S7 labels and outfit words can contain `@Image1` · S8 links are signed before the prompt can refuse ·
P7 "stays on the song clock" reads as sync held · P8 close framings untried in this wording · P10 small wording.

## Confirmed by the reviewers

- No file under `supabase/` is touched: no edge function, migration, policy or secret. Deploy would be Publish only.
- `@ImageN` and the order of `referenceImageUrls` come from the same value and cannot disagree, with or without a
  place picture; a short or empty garment link stops before the job row and the provider.
- Write-ahead order holds; no signed link is added to any row, log or toast by the diff; the estimate and the
  confirmation's price are unchanged; the undressed prompt is word for word what it was.
- `npx tsc --noEmit` clean; 2623 tests pass.

## What is NOT verified

- That the provider maps `referenceImageUrls[i]` to `@Image{i+1}` beyond the first (the two test results are
  consistent with it); that it takes more than three; that the tool's wording (labels, not hand-read garment facts)
  dresses him as the hand-built requests did; what a dressed request bills.
