# Interrupted Broadcast inside video variations — links, routing, references · 7 October 2026

Integration agent, session `session_013iHNJWu2P5zW1W9Fn8H9Vx`. Brief: take over the YSL variations / Interrupted
Broadcast work (Fendi's 00:46 + 00:49 messages of 7 Oct: persistent characters, explicit relationships between shots,
actual delivery of approved garment/face references, shot-specific production methods; Paris Black Runway and
Interrupted Broadcast as separate variations). Spend: **$0.00**.

Labels: VERIFIED / OBSERVED / HYPOTHESIS / DECISION / RECOMMENDATION (CLAUDE.md taxonomy).

## 1. What was already done, and by whom (no duplication)

- **VERIFIED** — video variations (#179) merged and deployed by the previous integration session; it stopped right
  after deploying, before the YSL data ops (its transcript ends at the browser step, 07:07 UTC).
- **VERIFIED** — persistent casting was being built in parallel by another session (`session_01H6y4…`), per its own
  brief; it merged as #183 (cast = continuity entity of kind `character`, `spec.cast`, readiness). Ownership split
  agreed (#184). This session built nothing that competes with it; its identity pictures flow through this work's
  reference planner (`references.ts` `extra`).
- The older realism-modifier experiment: out of scope, untouched.

## 2. YSL data (live, Lovable `query_database`, no schema change)

| | before | after |
|---|---|---|
| `86fe511a` | "Original": IB text on the runway board | **Paris Black Runway**: runway treatment `4e97e41a` restored with the app's own `restoreWrite`; 48 shots / 100 assignments / 3 entities / 89 jobs unchanged; IB text kept in its history (`restore`) |
| `d5a4fb03` | — | **Interrupted Broadcast**, active: the saved treatment (5,615 chars, Fendi's 02:40 save kept as-is), `setup.footage_confirmed_at` carried; notes / mood / visual style null; 0 shots, 0 entities; no runway `sections` / `clips` |

VERIFIED by query after the transaction. Pre-change snapshot: `pre_ops_snapshot.json`.

DECISION: nothing from the runway direction is carried into IB — the runway notes were rules for that concept
("PLACES (reuse these…)", "never write another outfit", "no logos"); the footage facts reach the writer separately
(the setup's footage statement), so dropping the notes loses no fact.

**Old runway instructions no longer reach IB requests** — VERIFIED by trace (`scripts/trace_ib_writer_prompt.ts`,
the writer's own `shotsSystemPrompt`): with IB's direction the shot writer's system prompt carries the IB treatment
and **none** of the runway instructions; with the runway notes/visual style attached (the pre-variation state) it
carried "PLACES (reuse these", "backstage fitting room", "Paris runway show at night".

## 3. Built (merged #182 `2ba2270`)

- **Links** `spec.continuity.links` — screen_shows / match_position / reveals / continues. Writer schema + rules; keys
  not on the board, self-links and unknown kinds dropped; linked shots rewritten once beside their partners' scenes
  (the writer's runs cannot see each other). `links.ts` reads both ends; each end's prompt says what it owes; a
  screen shot is **blocked** until the shot it shows has an image (its picture is then sent).
- **Production method** `spec.production` + `route.ts` — footage / restage / generate / edit_footage / composite /
  multi_shot, held against what the app can make: `storyboard`, `elsewhere` (named) or `unsupported`; an explicit
  method the storyboard cannot make is reported and not generated. A restage of a shot the treatment dresses →
  `elsewhere` (garment lane).
- **Exact garments** `wardrobe.garments` (the artist's wardrobe pictures), picked per shot in the shot editor.
- **Reference planning** `references.ts` — linked still → place → garments → cast identities → props, capped at the
  endpoint's limit; not-sent listed with why; missing = a problem before spend; a performance plate never carries
  garments or people. The runner records sent / not sent on every still job; pictures are sent only when the
  generator says it takes them; an image whose sent-count does not match is not used.
- **Request inspection** — `previewStillRequest`; "Show the image request (nothing is sent)" in the shot editor.
- Fixed: stored overrides dropped links / garments / production on reload (caught by the save/reload test); the e2e
  harness's treatment-restore race (failed identically on untouched main `a38a21a`).

Verification: tsc clean; vitest 195 files / 2,327 passed (14 path tests in `linksRoutes.test.ts`, 5 writer
contract tests); local browser e2e **PASS, 0 errors**, on the branch rebased onto the casting merge.

## 4. Reference delivery (#185, draft, Class C — not deployed)

`world-still-proxy` takes references **by record id**, holds each to the caller, signs it only from its own bucket
(wardrobe-refs / artist-assets / project-references / project-clips by kind), and draws on xAI `images/edits`
(`grok-imagine-image-quality`, 3 pictures — VERIFIED limit 2026-09-21). Over the limit or any failed check → refused,
nothing generated.

An independent security review found a **HIGH** issue in the first version (a client-written row could point at
another user's file); fixed: the file must sit in the project's / artist's own folder. VERIFIED against live data: all
17 wardrobe pictures, all 9 face pictures and all 151 YSL images pass the rule. Also fixed: token redaction, spend
accounting on partial failures, NaN guards, no bucket fall-through.

Pre-existing, reported not fixed: `grok-image-look-composite` signs caller-supplied paths with no folder check.

HYPOTHESIS (to test): `aspect_ratio` on edits holds 9:16 when the first input is not 9:16 (documented by xAI,
unverified); edits are priced like generations ($0.07/image).

Mocked tests do **not** prove a provider honours references — that is what the visual test is for.

## 5. Reference gaps (exact vs interpretable)

| treatment says | on file | status |
|---|---|---|
| "his exact YSL denim look" (viewer) | Trucker Jacket – French Black Denim; Cassandre Overshirt – Trouville Beach Blue Denim; Mick Long Jeans – Westwood Black Denim; slim low-rise jeans | pictures exist; **which pieces = the look is Fendi's call** |
| "his exact YSL leather coat" (Chicago) | **nothing** | cannot be held exactly; a restaging cannot dress him in it |
| "his specified YSL jacket" (blizzard) | Track Jacket (Mastic Cotton Navy Stripe); cotton jacket; Trucker Jacket | **unspecified — Fendi's call** |
| Fendi | 9 face pictures (artist record, `artist-assets`) | sent as the cast identity when the character has no picture of its own |
| rider, woman at the switch, janitor, crew, models | no characters in IB yet | to be cast (casting UI) — appearance is the director's words, never inferred |
| burning forest + monogram; 79th & Lafayette; CRT room; control room; Maybach SUV; blizzard | no entities in IB yet | interpretable until an approved picture exists |
| horse, polar bear, penguins, geese | — | generated, interpretable |

## 6. Not done

- IB board not written (needs a signed-in browser — see the handoff).
- Deploy: migration `20261007170000` + `treatment-writer-proxy` + Publish requested via Lovable DEPLOY ONLY at 14:31
  UTC; outcome in the handoff / PR thread.
- #185 awaits sign-off; no reference picture reaches a provider until it is deployed.
- No visual test run; proposal and cap in the handoff (stills $0.56, cap $1.82 incl. motion and one retry each).
