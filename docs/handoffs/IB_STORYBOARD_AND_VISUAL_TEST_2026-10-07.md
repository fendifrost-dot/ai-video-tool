# Integration agent → Fendi / next agent · Interrupted Broadcast: board ready to write, reference delivery live, visual test v2 · 7 October 2026 (evening)

Supersedes the morning handoff (`IB_LINKS_ROUTING_REFERENCES_2026-10-07.md`) where they differ. Spend: **$0.00**.

## Where things stand (VERIFIED unless marked)

| | state |
|---|---|
| Interrupted Broadcast variation | **active**; saved treatment unchanged (5,615 chars); 0 shots; **6 characters** created from the treatment's own words (FENDI → artist record; THE_RIDER, WOMAN_AT_THE_SWITCH recurring; THE_JANITOR fictional; THE_MODELS, THE_CREW background) |
| Cast migration `20261007170000` | applied (3 columns on `continuity_entities`) |
| Writer with People + cast per shot (#188) | merged `2b857ab`; `treatment-writer-proxy` **redeployed** 16:3x UTC; frontend published `b8cfda9` |
| Reference delivery (#185, Class C, three reviews recorded) | merged `7babdc4`; `world-still-proxy` redeploy **requested** 16:4x UTC — check: dry-run answer carries `referencesAccepted: true` |
| IB storyboard | **NOT WRITTEN** — one press in the app (below) |

## 1. The storyboard write — exact blocker, one press

"Write the shots from this treatment" calls `treatment-writer-proxy` with the **signed-in user's JWT**; the xAI key
lives only in Lovable's edge secrets. This session has no browser and no session token (and does not lift tokens),
so it cannot press the button or make the call. Nothing else is missing.

**Press:** Treatment page · variation chip reads *Interrupted Broadcast* · **"Write the shots from this treatment"**
(`treatment-write-shots`) · confirm **"Write the shots"**. The text is kept word for word. (Not "Generate
treatment" — that replaces it.)

**Cost:** one grok-4-fast call, ~2 k input tokens × (5 + 3 link/rewrite passes) ≈ **$0.02–0.05** (actual on the
response: `actualCostUsd`; report it).

**Expected after the press** (any other number is a finding):
```sql
select count(*) shots, count(*) filter (where generated_json->'cast'->'members' <> '[]') cast_shots,
       count(*) filter (where generated_json->'cast'->>'none'='true') no_people,
       count(*) filter (where jsonb_array_length(generated_json->'continuity'->'links') > 0) linked,
       count(*) filter (where generated_json->'production'->>'method' <> '') routed
from shots where variation_id='d5a4fb03-c478-4696-bdd4-f0162dd805cd';
```
- `shots` = the grid size (≈43–47); `cast_shots` > 0 with THE_RIDER on the burning-show shots and FENDI only from
  "The viewer" on; `linked` ≥ 3 (CRT → rider shot; control-room monitors → earlier shots; SUV exterior → reveals the
  control room; security monitor → rider); `routed` = `shots`.
- `cast_shots = 0` with shots present ⇒ the old writer answered (redeploy not live) — do not generate; report.
- Shots the treatment dresses (viewer, Chicago, blizzard) show "the treatment dresses him in … — not held exactly"
  on their cards until a garment is ticked (the exact garments are chosen in each shot's Production section). This
  is a per-shot flag; it does not block the write.

## 2. Reference delivery — what is now enforced

- A still that needs a **screen picture**, an **exact garment** or an **identity** is **blocked** until the pictures
  can go (probe says the proxy takes them) — in the confirmation and again in the runner. "Not sent" never lets money
  move for those shots.
- Order: screen → cast → garments → place → props, capped at 3 on `grok-imagine-image-quality`; an identity that does
  not fit **blocks**; a garment that does not fit is a warning (described in words).
- THE_RIDER and WOMAN_AT_THE_SWITCH are *recurring*: their shots stay blocked until a reference picture of each is
  approved (Continuity panel → character → generate picture → approve; 2 candidates, $0.14).
- The proxy refuses anonymous sessions and signs files as the caller. **This is not a security clearance** — see
  `docs/security/SECURITY_TRIAGE_2026-10-07.md` (SEC-4: `_open_test` policies on every table and bucket, open).

## 3. The visual test, v2 — follows the treatment (NOT authorised; $0 spent)

The treatment: "A side-on shot of the rider suddenly loses its color. — The viewer — We pull back from that same
image playing on a small black-and-white CRT." So the CRT shows **the rider**, not the forest aerial.

| # | shot (treatment) | needs first | references sent (≤3) | cost at list |
|---|---|---|---|---|
| 0 | THE_RIDER reference picture (character, not a shot) | — | none | $0.14 (2 candidates) → approve one |
| 1 | The rider, side-on, riding the cleared route between walls of fire; the shot that loses its colour | 0 approved | `<IMAGE_0>` the rider (cast) | $0.14 |
| 2 | **The viewer**: pull back from that same image on a black-and-white CRT; Fendi in his exact YSL denim look, watching | 1 chosen; denim piece ticked | `<IMAGE_0>` shot 1's still (screen) · `<IMAGE_1>` Fendi's face (cast) · `<IMAGE_2>` the ticked denim piece (garment); a second piece is words | $0.14 |
| 3 | Control room (monitors show Fendi in Chicago, the blizzard, the burning show) → SUV exterior, linked `reveals` | 1 chosen | room: `<IMAGE_0>` shot 1's still (screen) | $0.28 |
| | **stills, treatment fidelity** | | | **$0.70**; cap incl. one retry each **$1.40** |
| 4 | motion on the two best stills, only after approval | | the still | Kling 2.5 turbo i2v 5 s ×2 = $0.70 |
| | **cap, whole test** | | | **$2.10** |

**Separate, labelled as a technical diagnostic, not treatment fidelity:** the burning-forest aerial with the monogram
(no references, $0.14) — a cheap check that the writer's `generate` route and the `NO_MARKS` rule draw the monogram
the treatment names. Approving it says nothing about the treatment; keep it out of the fidelity count.

What the test decides: (a) does xAI edits honour a screen picture + an identity + a garment together (mocked tests
cannot show this); (b) does `aspect_ratio` hold 9:16 when the first input is not 9:16 (documented, unverified);
(c) does a `reveals` pair read as one place across a cut; (d) the edits route's real price (`cost_basis` on the job
until then). Seedance restage control ($2.22) is priced separately and not in this cap.

## 4. Decisions only Fendi can make

Collected on the page **"Interrupted Broadcast Choices"** (claude.ai artifact, private): the denim pieces (5 on
file, photos), the blizzard jacket (3 on file), the leather coat (**not on file** — add photos or name a stand-in,
labelled an interpretation), cast notes, and the test approval. Paste the copied answers back.

## 5. Guardrails

- Do not press "Release those N shots" on Paris Black Runway.
- Do not label any garment "exact" from words; `wardrobe.garments` (pictures) is the only exact path.
- A validated migration that errors means the live database differs — that is the finding; do not edit it.
- No paid generation until the test above is approved as written or trimmed.

## 6. Report back

`actualCostUsd` of the write; the five counts from §1; `referencesAccepted` on the proxy dry run; the answers from
the Choices page.
