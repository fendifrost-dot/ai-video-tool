# Interrupted Broadcast · first half · 9 Oct 2026

Working version: **candidate 5**, `882ec381-0fa0-4a76-b23b-b83ebc157372` (the project's active variation).
Baseline: **`e7dd9c47-f008-43e3-90e6-2a36ccf81be3`** — "BASELINE — candidate 5 as of 9 Oct 06:50 UTC, before
first-half repair (do not edit; comparison copy)".

**No generation was run. No spend, estimated or recorded, is attributable to this work.**

Labels per [`CLAUDE.md`](../../CLAUDE.md): **VERIFIED** / **OBSERVED** / **HYPOTHESIS**.

---

## 0 · A mistake, and its recovery

Writing shot 17's corrected override, I used a shot id taken from an **earlier, unrelated query dump** instead
of looking it up. That id was **shot 5 (`c005`)** — the telephoto forest-models shot — so Chicago-street cast
data was briefly written onto a forest b-roll shot.

Caught on the next read. `c005`'s `override_json` in the baseline was `null`; it was restored to exactly that.
`generated_json` and `spec_json` are separate columns and were never touched, so nothing else changed. Verified
after: `c005` has `override_json: null` and no shot-level garments.

The baseline duplicate, made minutes earlier, is what made the recovery exact. Every subsequent write looked the
id up by `spec_key` first.

## 1 · Confirmed board facts — VERIFIED

Active variation is candidate 5. Board runs **0 → 201.87 s**, 43 shots; the half-way point **100.94 s** falls
inside **shot 24** (96.08–101.96). Shots 1–7 forest b-roll, 8–11 rider/CRT, 12–16 the viewer, 17–18 the Chicago
switch, **19–24 performance**.

Scenes and the outfits they point at:

| scene | window | outfit |
|---|---|---|
| The viewer | 43.14–50.98 | `YSL_DENIM_LOOK` |
| The viewer, after the screen | 54.90–58.82 | `YSL_DENIM_LOOK` |
| Chicago, the switch | 62.75–96.08 | `YSL_LEATHER_COAT` |
| The cold front | 96.08–123.53 | `YSL_JACKET` (straddles the half-way point) |
| The clean entrance | 174.51–188.24 | `THE_CLEAN_ENTRANCE_LOOK` |

The wardrobe has **22** `wardrobe_%` rows on the artist, the coat and all three caps among them, so step 1 of
`WARDROBE_DECIDED_2026-10-09.md` had already landed. Five of those rows are glasses, including the Cazal set.

## 2 · The six reported findings, each checked

| # | finding | verdict |
|---|---|---|
| 1 | shots 19–24 have no replacement performance clip, so the cut plays the unchanged take | **VERIFIED** — no `performance`-role assignment exists on candidate 5; `media.ts:281` is `selected ?? base` |
| 2 | `scripts/mcp/still.ts` `cmdClip` refuses performance shots | **VERIFIED** — "A performance box is restaged from its take in the browser … which this driver cannot do: it refuses one" |
| 3 | routing contradicts itself | **VERIFIED, but better than reported** — `route.ts:110` already returns `verdict: "elsewhere"` and names "Garment lane — Hero Frame Studio (approved keyframe, then propagation)". The contradiction is not in the routing; it is that **nothing executes "elsewhere"** while the fallback made the shot look done |
| 4 | shot garment lists supersede complete outfits | **VERIFIED** — and this is the glasses defect (§3) |
| 5 | shot 17 sets the recurring woman to `invent`; viewer shots lack screen links | **VERIFIED** — `WOMAN_AT_THE_SWITCH` is `recurring`/`recurring` **with an approved reference**, so `invent` discarded her likeness. Screen-link gap also verified: `c017` has a `match_position` link to `c013`, but `c012`/`c013` carry no `screen_shows` link |
| 6 | Chicago reveal at 62.75 s vs the vocal entrance | **NOT VERIFIED — and not verifiable by me.** I cannot hear the song. Needs an audible check; see §6 |

## 3 · The glasses: root cause — VERIFIED

`effectiveGarments` gives a shot's own garment list precedence over its outfit's. The list **replaces** rather
than extends:

| shot | its own list | outfit carries | silently dropped |
|---|---|---|---|
| c012, c013, c015 | trucker jacket + Y cap (2) | denim look (6) | jeans, belt, sneakers, **glasses** |
| c017, c018 | coat (1) | leather coat (4) | trousers, beige cap, **glasses** |

`references.ts` is strict and correct — it blocks a piece whose picture it cannot send — but it **only ever saw
the pieces that survived `effectiveGarments`**. The drop happened upstream of anything that could object, and was
reported as an `info` reading "This shot names its own pieces", which named nothing.

Two outfits also simply lacked the glasses: `YSL_JACKET` and `THE_CLEAN_ENTRANCE_LOOK`.

**Provenance before changing anything:** c012/c013/c015 each carry the director's own note, "*He wears the YSL
denim look*" — the complete look — so the two-piece list contradicted its own direction. c017/c018 have no note
and predate the 9 Oct decision. None was a deliberate exception.

## 4 · What was changed

### Code — merged as PR #214, `240a4e4`

* `unmetRequirement(route, showing)` in `route.ts` + a red banner on `BoxCard`: a shot playing the inherited take
  while its route says the work happens elsewhere is reported as **unfinished**. A shot *meant* to play the take
  as filmed stays silent.
* `effectiveGarments` returns `dropped`; the flag names the pieces and is a **warning**, not an info.
  Precedence unchanged.
* `catalog.generated.ts` regenerated — it was stale on `main` before this branch.

13 new tests; vitest 2545 passed, 1 skipped; `tsc` clean.

### Data on candidate 5

| change | effect |
|---|---|
| glasses added to `YSL_JACKET` | v5 → **v6** (trigger-bumped) |
| glasses added to `THE_CLEAN_ENTRANCE_LOOK` | v2 → **v3** |
| c012, c013, c015, c017, c018: shot garment list cleared | each now inherits its scene outfit, glasses and hat included |
| c017: `WOMAN_AT_THE_SWITCH` `identityMode` `invent` → `null` | defers to her `recurring` mode and approved reference |
| c018: override removed entirely | its only content was the stale coat list |

All four looks now carry a hat **and** the glasses. The version bumps are what mark dependent outputs outdated —
that mechanism already existed (`tg_outfit_version`), so requirement 6 needed no new code.

`spec_json` is the column "every downstream consumer reads" (`boxes.ts:10`) and is **derived**. Direct writes to
`override_json` left it stale on c012 and c013; both were brought into line, and all six touched shots were
re-verified to hold no shot-level garments in either column. **This is the weakest part of the method**: these
edits went through the MCP rather than the app's own save path, so the derived column had to be maintained by
hand. Future reconciliation of this kind belongs in the app or in a script that calls `boxWrite`.

## 5 · The blocker: performance 19–24 — nothing I can honestly deliver yet

The treatment redresses him on every one of those shots. The only synced take is `hero_clip_hd_1080.mp4`, filmed
in a camo shirt and a navy cap. So they need a real garment change on real footage, and:

* `restage.ts` **preserves** the take's wardrobe by construction (`"every piece of his wardrobe … exactly as in
  @Video1"`). Restaging cannot do it. Relabelling the method would not change that.
* `route.ts` routes them to a garment lane and states the storyboard does not submit video edits.
* Infrastructure exists (`src/lib/reconstruct/`, `GrokVideoEditRunner`, `HeroFrameTemporalRunControl`,
  `playable/temporalChunk`) — **OBSERVED**, read but not exercised.
* [`CLAUDE.md`](../../CLAUDE.md)'s locked video-swap architecture requires, **before** scaling: a benchmark on a
  short clip of (a) Grok keyframe + optical-flow propagation against (b) a video-native VTON, and a **kill
  criterion** on a 2–4 s test — identity, exact jacket construction, stripe/logo placement, natural occlusion, no
  visible flicker or morphing. It also lists engineering prerequisites (per-chunk persisted status, retries,
  resume, a durable queue) that are not met.

That gate has not been run, so **no garment swap was attempted and none should be until it is**. This is also a
Class C change under [`docs/ARCHITECTURE_REVIEW.md`](../ARCHITECTURE_REVIEW.md) (rendering, providers,
orchestration) and needs sign-off.

**Next concrete step, bounded:** one 2–4 s segment of shot 19, both candidate routes, inspected frame by frame
against the kill criterion. Nothing beyond that short test should be generated.

## 6 · Not done, and not pretended

* **The rendered first half was never watched.** I inspected records and code, not pixels. No frames were
  extracted, no cut was assembled. The brief is right that completion requires inspecting the rendered result;
  this work does not reach that bar and does not claim to.
* **The vocal entrance was not verified.** I cannot hear the song. The 62.75 s reveal versus a reported ~14.7 s
  entrance is unresolved, and onset analysis would be a measurement, not the audible check asked for.
* **Forest opening untouched** — no aerial reference imported (the NPS Colony Fire asset was not fetched or
  inspected), and the ground-level "burning YSL monogram" wording is still in `c005`'s and its siblings'
  `environment` text.
* **Screen-content links for c012/c013 not added.**
* **c012, c013 and c015 are `locked: true`** — whole-board generation skips them. Pre-existing; not changed,
  because locking is a director's decision. It will block a board-wide regeneration of the viewer sequence.
* The clean-entrance look holds the **confetti shirt**, which the decision reserves for the second half — correct
  there, since that scene starts at 174.51 s.

## 7 · Requirements 1–7 against reality

| req | state |
|---|---|
| 1 · one operation resolving range, outfit version, identity refs, links, method, cost | **partly exists** — `referencesOf`, `outfitOf`, `routeOf`, `estimatesOf`, `generationNotes` each do a piece; not one call |
| 2 · execute performance edits as well as cutaways | **not done** — §5 |
| 3 · preserve provenance across tab/variation changes | variation scope holds (`provider_jobs.variation_id`); outfit version recorded on jobs — **OBSERVED**, not re-tested here |
| 4 · make original-footage fallback unmistakable | **done** (#214) |
| 5 · prevent "finished" concealing unmet requirements | **partly done** — fallback and dropped pieces now surface; no gate on marking a shot approved |
| 6 · mark outputs outdated when outfit changes | **already existed** (`tg_outfit_version`); exercised by the two version bumps |
| 7 · keep generation completion separate from visual approval | **already existed** — `acceptance` on the asset is distinct from job success |
