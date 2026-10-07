# Handoff → the test agent · Interrupted Broadcast: write the board, prove reference delivery, run visual test v2 · 7 Oct 2026, 17:1x UTC

Written by the integration agent for the agent Fendi assigns to run the tests ("We're going to have an agent conduct
the tests, not me" — Fendi, 7 Oct ~17:08 UTC). Nothing below is verified until the test agent pastes real output.
Everything you need is in this file; the long form is `IB_STORYBOARD_AND_VISUAL_TEST_2026-10-07.md` (same folder).

## 0. What you need, and what you must not do

| need | why |
|---|---|
| A browser signed in to `aivideotool.lovable.app` **as Fendi's durable account** (`3ca10935-8c3d-4479-9a0c-8bfe8050840c`), not an anonymous session | the write and every still go through the app with the user's JWT; `world-still-proxy` refuses anonymous sessions (403 `sign_in_required`) |
| Lovable MCP `query_database` on project `bd21b544-c7b8-4780-bdde-391ac9d4bfa8` (AVT, Supabase ref `qoyxgnkvjukovkrvdaiq`) | the count checks below are SQL. **No supabase CLI, no supabase.com dashboard** (a CLI 403 is a false wall) |
| Read access to `fendifrost-dot/ai-video-tool` | to record results in this file |

Spend cap for this handoff: **$2.30 total**, list prices, xAI key on AVT (Fendi's). Stop at the cap. Break-down in §3.
Do not: lift a JWT out of the browser; top up or change any subscription; press "Release those N shots" on the Paris
Black Runway variation; edit a migration to make it run; label any garment "exact" from words — a garment is exact only
when its picture is sent (`wardrobe.garments`); run the forest aerial unless §3 step 5's cap allows it.

Ids you will use:

| thing | id |
|---|---|
| project (YSL) | `764a63d2-93cd-44f3-905f-292f14ab2f51` |
| variation Interrupted Broadcast (active) | `d5a4fb03-c478-4696-bdd4-f0162dd805cd` |
| character THE_RIDER (recurring) | `48735a9c-3710-467a-b201-c5d437620fe5` |
| character WOMAN_AT_THE_SWITCH (recurring) | `0eb3ade8-c15d-44c5-8730-c8842be6241f` |
| character FENDI (primary_artist, preserve) → artist | `8d4a4d22-41c0-43ab-ba99-92750f81e335` |
| Fendi face pictures (8 `face` rows, `artist-assets`) | e.g. neutral `b5b29a79-af75-4c80-8dc9-01cf7f34acf6`, three-quarter left `ddec5925-6698-405b-84e8-737d091bec7a` |
| Trucker Jacket — French Black Denim (`wardrobe_outerwear`, `wardrobe-refs`) | `f6455042-faec-4a07-b6a2-cb0525a69c65` |
| Mick Long Jeans — Westwood Black Denim (`wardrobe_bottom`) | `df104591-5015-4b1f-98a7-7842c5001037` |

## 1. Pre-flight (free) — expected values, in this order

1. **Main is what you think it is.** `git log --oneline -1 origin/main` → `c16c5fc` or later. PR #190 (planner overflow
   blocks; five proxies refuse anonymous) may or may not be merged; the test below needs at most 3 pictures per still,
   so it runs either way. If #190 is merged, Fendi decides on the five redeploys; they are not needed for this test.
2. **Zero shots, six characters, treatment intact:**
   ```sql
   select (select count(*) from shots where variation_id='d5a4fb03-c478-4696-bdd4-f0162dd805cd') shots,
          (select count(*) from continuity_entities where variation_id='d5a4fb03-c478-4696-bdd4-f0162dd805cd' and kind='character') characters,
          (select length(treatment_text) from video_variations where id='d5a4fb03-c478-4696-bdd4-f0162dd805cd') treatment_chars;
   ```
   Expected `0 | 6 | 5615`. Anything else: stop and report (someone else moved first; do not "fix" it).
   (If `treatment_text` is not the column name, read `src/lib/treatment/api.ts` for where the saved treatment lives;
   do not guess a second table.)
3. **The generator takes pictures** (free dry run, done by the app): open the project's storyboard; the first shot
   card's generate confirmation (`box-generate-image`) runs the probe `src/lib/queries/stillReferences.ts`. There are no
   shots yet, so do this after §2 step 1. Expected on the confirmation: no line "the image generator is not taking
   reference pictures". If that line shows → `world-still-proxy` is not live with reference delivery; stop; nothing
   is billed for shots that need pictures (`undeliveredProblem` blocks them). Report it.

## 2. Write the board (one text call, ≈ $0.02–0.05)

1. Treatment page of project `764a63d2…`; the variation chip must read **Interrupted Broadcast**. Press **"Write the
   shots from this treatment"** (`treatment-write-shots`), confirm **"Write the shots"**. NOT "Generate treatment"
   (that replaces the saved text). The response carries `actualCostUsd` — record it.
2. Expected afterwards (any other number is a finding, not something to repair):
   ```sql
   select count(*) shots,
          count(*) filter (where generated_json->'cast'->'members' <> '[]') cast_shots,
          count(*) filter (where generated_json->'cast'->>'none'='true') no_people,
          count(*) filter (where jsonb_array_length(generated_json->'continuity'->'links') > 0) linked,
          count(*) filter (where generated_json->'production'->>'method' <> '') routed
   from shots where variation_id='d5a4fb03-c478-4696-bdd4-f0162dd805cd';
   ```
   - `shots` ≈ 43–47; `cast_shots` > 0; `linked` ≥ 3; `routed` = `shots`.
   - `cast_shots = 0` with shots present ⇒ the old writer answered (its redeploy is not live) → stop, report, no stills.
   - Treatment text unchanged: `treatment_chars` still `5615`.
3. Find the test shots by their text (`select shot_number, left(generated_json->>'description',80) …`): the rider
   side-on between walls of fire that "loses its color"; **the viewer** (pull back from that image on a small
   black-and-white CRT); the control room (monitors); the SUV exterior. Record their shot numbers.
4. On the viewer shot, Production section (`shot-production`): tick the exact garment **Trucker Jacket — French Black
   Denim** (`shot-garment`). This is the test agent's reading of the treatment's "denim" with the only denim outerwear
   on file; Fendi's per-scene outfit answers (Choices page) supersede it later. Tick nothing else there (the screen and
   the face take the other two slots; a fourth picture would block the shot, by design).
   Check `box-cast` shows FENDI; check the link to the rider shot exists (`screen_shows`); if the writer missed it, add
   it in the shot's continuity editor rather than generating without it.

## 3. Visual test v2 (treatment fidelity) — $2.10 cap for stills + motion; stop at any blocking problem

Every generate confirmation lists "Sent as pictures: …" and problems. A **blocking** problem means do not press
generate; record the text and move on. Never generate a shot whose confirmation says a required picture is not sent.

| step | where | expected on the confirmation | cost |
|---|---|---|---|
| 1. THE_RIDER reference picture | Continuity → characters → The rider → `entity-generate-picture`; approve one (`entity-picture-approve`) | 2 candidates; pick the one closest to the treatment's words; record its id | $0.14 |
| 2. rider side-on still | storyboard → that shot → `box-generate-image` | "Sent as pictures: The rider (cast)"; no blocking | $0.14 |
| 3. choose shot 2's still | approve it (`shot-continuity-approve-image`) so it becomes the screen picture | | — |
| 4. **the viewer** still | `box-generate-image` | "Sent as pictures: shot N (screen), Fendi (cast), Trucker Jacket — French Black Denim (garment)" — exactly three, in that order; no `shot-reference-not-sent` entry | $0.14 |
| 5. control room + SUV exterior | each `box-generate-image` | room: "shot N (screen)"; SUV: whatever the `reveals` link resolves to | $0.28 |
| 6. retries | only once per still that fails the read below | | ≤ $0.70 |
| 7. motion on the two best stills | `box-generate-clip`, Kling 2.5 turbo i2v 5 s | only after 4 and 2 are approved | $0.70 |
| separate diagnostic | the burning-forest aerial, no references, labelled DIAGNOSTIC in the report | says nothing about fidelity | $0.14 |

Running total: $0.70 stills, $1.40 with retries, $2.10 with motion, $2.24 with the diagnostic, + the write. Stop at $2.30.

After each still, record from the job row (`provider_jobs`, newest for the user): `references_sent`, `model`,
`cost_basis` ("generations list rate; edits rate unverified" is expected — that is the HYPOTHESIS this test prices),
`billed` / `possibly_billed`, `aspect_ratio` asked (9:16) vs the image's real size.

Read of each still (write it, do not score it in your head): identity held? exact garment held (cut, colour, seams,
marks)? screen shows shot N's picture as it is? 9:16 held? `reveals` pair reads as one place? Label each VERIFIED /
OBSERVED / HYPOTHESIS. The kill criterion is the repo's: if the viewer still cannot hold Fendi's identity + the exact
jacket + the rider on the screen at once, say so plainly; do not retry past once.

## 4. Report back (paste into the PR thread or this file under "## Results")

- `actualCostUsd` of the write; the five counts; the shot numbers found.
- Per still: job id, references sent (verbatim), model, cost_basis, billed, image size, the read.
- Total spent vs the $2.30 cap, at list prices; the xAI console figure if Fendi gives it (do not ask for the key).
- Anything that blocked, verbatim, and where (confirmation / runner / proxy 4xx with its `detail`).
- Do not write "verified" for anything you did not see in output; do not call the release security-cleared
  (`docs/security/SECURITY_TRIAGE_2026-10-07.md`, SEC-4 open).

## Results

(empty — filled by the test agent from real output)
