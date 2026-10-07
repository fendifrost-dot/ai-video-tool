# Integration agent → next agent / Fendi · Interrupted Broadcast: variations live, links + routing + references · 7 October 2026

Session: `session_013iHNJWu2P5zW1W9Fn8H9Vx`. Spend: **$0.00** (no generation, no writer call). Full record:
`docs/research/results/2026-10-07-ib-variations/IB_VARIATIONS_RECORD_2026-10-07.md`.

## Where things stand

| | state | evidence |
|---|---|---|
| YSL variations (data) | **LIVE** | Paris Black Runway `86fe511a` (runway treatment `4e97e41a` restored; 48 shots / 100 assignments / 3 entities / 89 jobs untouched). Interrupted Broadcast `d5a4fb03` — **active**, saved treatment (5,615 chars), 0 shots, 0 entities, notes / mood / visual style null. Snapshot of what was replaced: `pre_ops_snapshot.json` |
| Cast records (other session, #183) | CODED on main; **migration `20261007170000_cast_members.sql` — see "Deploy" below** | |
| Links, production routing, garments, reference planning (#182) | CODED, merged `2ba2270` | tsc clean; vitest 2,327 passed; local browser e2e PASS |
| Reference delivery in `world-still-proxy` (#185) | **DRAFT — Class C, needs sign-off**; NOT deployed | vitest 8 server tests; deno check clean; security review findings fixed (`90c1c06`, `321f96e`) |
| IB storyboard | **NOT WRITTEN** | needs a signed-in browser (below) |

## Deploy (Lovable, DEPLOY ONLY) — order matters

1. Migration `20261007170000_cast_members.sql` **before** any Publish of main ≥ `1a5783f` — the Cast panel reads its columns.
2. Redeploy `treatment-writer-proxy` (links, production method, link pass).
3. Publish.
4. Only after #185 is signed off and merged: redeploy `world-still-proxy`.

A DEPLOY ONLY message for 1–3 was sent at 14:31 UTC (`umsg_01m4bcdatsef6vcc2497vgfgmm`); check its outcome, do not resend blindly.

**Verify (cheap, distinguishes outcomes):**
```sql
-- 3 rows = cast migration applied; 0 = not applied (do NOT publish)
select column_name from information_schema.columns
 where table_schema='public' and table_name='continuity_entities' and column_name in ('cast_role','identity_mode','artist_id');
```
- Writer redeployed: write the IB board (next section) and check that `shots.generated_json->'production'` exists on the new rows (`select count(*) from shots where variation_id='d5a4fb03-c478-4696-bdd4-f0162dd805cd' and generated_json ? 'production'` = the number of shots). A count of 0 with shots present = the old writer answered.
- Reference delivery live (after #185): the storyboard's shot editor no longer shows "The image generator does not take reference pictures yet" on a shot that has references; the dry-run answer of `world-still-proxy` contains `referencesAccepted: true`.

## What only a signed-in browser can do

**Write the Interrupted Broadcast board** — Treatment page, variation chip reads "Interrupted Broadcast", press **"Write the shots from this treatment"** (`treatment-write-shots`) and confirm **"Write the shots"** — the text is kept word for word. NOT "Generate treatment", which replaces it. One writer call (grok-4-fast, cents). Expected: a full board of shots stamped from fingerprint `5615:…`, each with `production`, some with `continuity.links` (CRT → burning-show shot; control room → screens; SUV exterior → reveals the control room; security monitor → rider). Report: shot count, how many links, which methods, any shot routed `elsewhere` / `unsupported`.

## Decisions only Fendi can make (asked, not assumed)

- **The "exact YSL denim look"** (the viewer scene): on file are Trucker Jacket – French Black Denim, Cassandre Overshirt – Trouville Beach Blue Denim, Mick Long Jeans – Westwood Black Denim, slim low-rise jeans. Which pieces are the look?
- **The "specified YSL jacket"** (blizzard): which one? On file: Track Jacket (Mastic Cotton Navy Stripe), cotton jacket, Trucker Jacket.
- **The YSL leather coat** (Chicago): **not on file.** Reference photos of the exact coat are needed; nothing can hold it exactly until then. A restaging cannot dress him in it (routes `elsewhere` → garment lane).
- **Cast for this variation**: the rider, the woman at the switch, the janitor, the crew, the models — none exist yet as characters in IB; their appearance is Fendi's to describe (never inferred).
- **Sign-off on #185** (Class C: provider + signed-URL logic).

## Guardrails

- Do not press "Release those N shots" on Paris Black Runway — that board is the runway video now, intact by design.
- Do not edit a migration to make it run; an error on a validated migration means the live database differs — that is the finding.
- Do not label any garment "exact" from words; `wardrobe.garments` (pictures) is the only exact path.
- No paid generation until the visual test below is authorised.

## The next visual test — proposal, NOT authorised

Prerequisites: steps 1–3 deployed, IB board written, #185 signed off and deployed, the denim look chosen.

| # | what | route | refs sent | cost at list |
|---|---|---|---|---|
| 1 | Opening: burning forest, YSL monogram cut into the floor, models in formation | Grok still, 2 candidates | none (generated world) | $0.14 |
| 2 | The viewer: CRT showing shot 1's chosen picture, Fendi in the denim look | xAI images/edits, 2 candidates | `<IMAGE_0>` shot 1's still (screen), garments ×1–2, Fendi's face (cast) — capped at 3 | $0.14 (edits price assumed = generation price; HYPOTHESIS) |
| 3 | Control room → SUV exterior (multi_shot, linked) | 2 stills | room: shot 1 still on a monitor | $0.28 |
| | **stills subtotal** | | | **$0.56**; cap incl. one retry each **$1.12** |
| 4 | Motion on the two best stills (only after still approval) | Kling 2.5 turbo i2v 5 s ×2 | the still | $0.70 |
| | **cap, whole test** | | | **$1.82** |

What it decides: (a) does xAI edits honour a screen picture + garment + identity together (mocked tests cannot prove this); (b) does `aspect_ratio` hold 9:16 when the first input is not 9:16 (documented by xAI, unverified by AVT); (c) does a linked interior/exterior pair read as one place across a cut. The Seedance restage control ($2.22) is priced separately and not part of this cap.

## Report back

Migration rows (3/0), writer redeploy confirmation, publish SHA, IB board counts (shots / links / methods / elsewhere / unsupported), and Fendi's answers to the decisions above.
