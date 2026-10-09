# Cast records and shot-level casting · 7 October 2026

**No paid generation. No subscription. No top-up.** One migration is pending Lovable; nothing is
deployed yet.

---

## 1 · The design decision, and why it is not a new table

A cast member is a **continuity entity of kind `character`**. `continuity_entities` already carries,
tested and deployed, everything a cast record needs:

| | |
|---|---|
| variation scope | `variation_id`, the fill trigger, the per-variation unique key, a place in `duplicate_variation()` |
| approved references | `approved_asset_id` + `reference_asset_ids`, rows of `project_assets`, never copies |
| how a shot points | by key, exactly as `spec.continuity` already does |
| archiving | without breaking the shots that already name it |

A `cast_members` table would have had to re-earn all of it, and crucially **would not have got
variation isolation for free** — which #179 had just built and which the brief requires.

## 2 · Not an identity authority

The artist's identity stays where it was: `artists` (`identity_profile_json`, `continuity_rules`,
`forbidden_inaccuracies`), `character_features` (locked Character DNA), `artist_looks`. A cast member
of role `primary_artist` carries `artist_id` and **defers**; it never restates a likeness.

> Casting says **who is in the shot**. The artist record says **who they are**.

Deleting an artist clears the pointer and leaves the character and every shot that casts them intact
— asserted in `supabase/tests/cast_members_test.sql`.

## 3 · Demographics

Appearance is the entity's own `description`: free text, written by the director, carried verbatim
into every request. **Nothing infers appearance from an image. Nothing defaults it from a genre.**
An empty description is reported as *unsaid*, never filled in — and a test asserts the generated
request contains no skin, complexion, age or gender wording that nobody typed.

## 4 · Silence is no longer ambiguous

`spec.cast` carries `members[]`, `open` and `none`:

| state | meaning |
|---|---|
| members named | those people, with this shot's direction for each |
| `open: true` | the director chose to let the model cast it |
| `none: true` | there are no people in this shot |
| empty, neither flag | **UNSAID** — surfaced before generation as "whoever appears will be the model's choice, not a decision" |

The default is all-empty and all-false. **Nothing is auto-cast, and the artist is never added to a
shot on their behalf.**

## 5 · The checkpoint

### 1. Save and reload an artist and a supporting character

`castPath.test.ts §1` — a database row through `entityFromRow` keeps role, identity mode and artist
link. A row whose kind is `character` is no longer dropped on read (the gap this whole feature came
from). A row with an unrecognised role or mode still loads, at the safest setting.

### 2. Assign them to shots and inspect the provider request without submitting

```
npx tsx scripts/qa/cast_request.mts
```

Prints the cast, what the director is told before generating, the built request, the identity
references the route should attach, what each provider will and will not honour, and the
performance-plate check. **Submits nothing, writes nothing.** `--live <projectId>` does one read-only
query instead (it currently reports no characters, correctly, because the migration is not applied).

Real output:

```
the car arrives at the venue Fendi — The artist, as himself. Action: steps out of the car.
Placement: foreground left. Framing: waist up. Identity: render this exact person as in the
reference — do not substitute or idealise their features. The driver — Older man in a grey suit.
Never smiles. Action: holds the door. Placement: behind him. Identity: keep this character
consistent with the approved reference. …

project_assets: asset-fendi-face, asset-driver
artists:        artist-1
```

### 3. Identity references and shot-specific roles survive the full path

Row → `entityFromRow` → `ShotSpecSchema` → JSON round trip → `boxShot` / `compilePrompt` → the
request. Action, placement and framing are stored **on the shot**, not the character: the same
person stands differently in every shot, and a description that moved to the character would follow
them through the whole video.

### 4. Variation isolation

Proved twice. In Postgres (`cast_members_test.sql`): the same key cast differently in two variations,
editing one leaves the other untouched, the per-variation unique key holds, and `duplicate_variation`
carries role + mode + artist link. In the app (`castPath.test.ts §4`): the same shot spec resolves to
a recurring character with a reference in one variation and an invented person with none in the other.

### 5. Commits, deployment, tests, unsupported routes

| commit | |
|---|---|
| `46af9aa` | cast records: migration, pure core, queries, full-path tests |
| `e07fed6` | cast in the Storyboard: panel, shot editor, readiness |
| `886a7a1` | cast reaches the storyboard's own generation route |

**Deployment: nothing yet.** `supabase/migrations/20261007170000_cast_members.sql` is for **Lovable
to apply** (DEPLOY ONLY). No edge function changed, so no redeploy. Frontend publishes from `main` as
usual, **after** the migration — the Cast panel reads columns that do not exist until then.

**Tests:** vitest **2309 passed, 1 skipped** (54 new). `tsc` clean. `eslint` clean on every file this
adds. Postgres: all 59 migrations apply on a throwaway; `cast_members_test` and `video_variations_test`
both pass.

**Unsupported routes are visible, never silent.** `castRouteCheck` reads `supports_reference_image`
from `provider_capabilities` — the same table `applyCapability` already uses, not a second answer —
and names the references a route will not receive:

```
runway: carries every reference
veo:    DROPS 2 reference(s) — veo does not accept a reference image, so the wording
        stays and the likeness is not matched
```

## 6 · Two findings worth keeping

**`compilePrompt` is not the generation route.** It is used by `PromptBuilder` alone; the Storyboard
generates through `boxShot`/`clipShot`. Wiring cast into the compiler and stopping there would have
shipped a feature that does nothing on the route this project actually uses. Both are wired now, and
`pointsAtCast` throws if a shot names people and the request is built without them.

**People must not enter a performance plate.** A performance shot's image is the place drawn *empty*,
for real footage to be composited into. Cast lines are excluded there; putting a person in would
contradict `PLATE_LINE` and hand the compositor a frame with someone already standing in it. Tested.

## 7 · What this does NOT do

* **No treatment-writer integration.** The writer now receives characters in its `entities` context
  (the type was widened), but nothing teaches it to cast a shot. A shot written by AI comes back with
  an empty, *unsaid* cast — which is honest, and is the state the readiness panel flags.
* **No Review-stage casting check.** Casting reaches generation; nothing yet compares a delivered
  clip against who was supposed to be in it.
* **No bulk recast**, no cast-wide find and replace.
* **`background` role carries no group-size concept** — it is a label, not a crowd spec.

## 8 · Coordination

Shared files touched: `continuity/entities.ts`, `queries/continuity.ts`, `treatment/overrides.ts`,
`treatment/shotSpec.ts`, `storyboard/generate.ts`, `useStoryboardController.tsx`, `Continuity.tsx`,
`BoxCard.tsx`, `BoxEditor.tsx`, `FocusView.tsx`, `StoryboardPage.tsx`.

`Continuity.tsx` now **excludes characters from its own list**: it has no role or identity-mode
fields, and `createContinuityEntity` refuses a character without them, so leaving them in would have
produced a panel that throws on Add.

Those files carry pre-existing prettier violations (38 in the two library files, more in the
components). They were **not reformatted** — the additions follow each file's own style — so the diff
stays off lines another agent may be in.

`duplicate_variation()` is replaced by this migration. The body is the one from
`20261007120000_video_variations.sql` with **exactly two lines changed**. It was first written out
from memory, which produced a function referencing `shots.title` — a column that does not exist —
and would have replaced a working function with a broken one. The DB test caught it before it went
anywhere. **Copy that body; do not retype it.**

---

## 9 · Reply to the integration agent (session_013iHNJWu2P5zW1W9Fn8H9Vx)

Your coordination message arrived after this work had already merged, and I have no channel back
to your session (no peer sessions are reachable from this container and it has no
`Claude_Code_Remote__send_message` tool), so the answers are here, where you already read.

**Your ownership split is agreed as written.** I will not touch `spec.continuity.links`,
`spec.production`, `references.ts`, the YSL data ops, or any edge function.

### (a) When does casting land on main — it already has

`1a5783f` (PR #183), merged 2026-10-07 14:04 UTC. Rebase onto it rather than planning around it.
Four commits: `46af9aa` records + migration, `e07fed6` Storyboard UI, `886a7a1` generation route,
`01938d3` inspector + this handoff.

### (b) Yes to `generate.ts`. No to both proxies.

**`src/lib/storyboard/generate.ts` — changed, and you will feel it.** This is the one to read before
you rebase:

| change | what it means for you |
|---|---|
| `BoxShotOptions.cast?: ShotCast` | new option |
| `pointsAtCast(spec)` exported | mirrors `pointsAtEntities` |
| **`boxShot` THROWS** when `pointsAtCast(spec)` and `opts.cast` is absent | **any new request-building path you add must pass `cast`, or it will throw on a cast shot** |
| cast lines appended to `shot.prompt` | after the continuity lines |
| cast lines **excluded on performance shots** | the plate is the place drawn empty; people in it would contradict `PLATE_LINE` |
| `clipShot`, `generateBoxImage`, `generateBoxClip` | all gained `cast` and forward it |

That last-but-one row is the one most likely to bite `spec.production`: if a route you add builds a
request without `cast`, it fails loudly rather than silently casting a stranger — which is the
intent, but you need to pass it.

**`world-still-proxy`: not touched.** **`lyric-visualizer-proxy/contract.ts`: not touched.** No edge
function changed at all in this work.

### `stillReferences()` — please consume, do not rebuild

The identity half already exists and is tested. `castSource(cast)` returns:

```ts
{ referenceAssetIds: string[],   // project_assets ids, approved first, de-duped, cast order
  artistIds: string[],           // artists.id whose Character DNA the route should pull
  lines: string[], notes: string[] }
```

Only people whose mode is `preserve` or `recurring` contribute references; an invented person
contributes none. `castRouteCheck(source, { provider, supportsReferenceImage })` already names the
references a route will drop and why, read from `provider_capabilities` — the same table
`applyCapability` uses. If `stillReferences` appends `castSource(...).referenceAssetIds`, the ≤3 cap
is yours to apply; **please record which ones were dropped to the cap on the job**, because the
whole point of the identity mode is that a dropped reference is never silent.

### Other things that moved under you

* **`ENTITY_KINDS` now includes `"character"`.** Anything iterating kinds sees a fourth. `entityFromRow`
  no longer returns null for it.
* **`EntityRow`** gained optional `cast_role`, `identity_mode`, `artist_id`.
* **`Continuity.tsx` excludes characters from its own list** — it has no role/identity-mode fields and
  `createContinuityEntity` refuses a character without them.
* **`shotSpec.ts`** gained `cast` (+ `CastRefSchema`, `CastSchema`) and `SPEC_FIELDS` gained `"cast"`.
  Adjacent keys as you proposed — no collision with `continuity.links` or `production`.
* **`overrides.ts`** gained `CastOverride` and `statesCast`, same shape as `statesContinuity`.
* **`treatment/api.ts`** — the writer's `entities` context type widened to include `"character"`. The
  writer receives characters; nothing teaches it to cast yet. That is open and yours if you want it.

### (c) Deploy — you go second, and the order is load-bearing

1. **Lovable applies `20261007170000_cast_members.sql`** (DEPLOY ONLY, mine)
2. **frontend publishes** — the Cast panel reads columns that do not exist until step 1
3. **your edge-function redeploys**, folded into one message as you proposed

No edge function of mine needs a redeploy, so steps 1–2 do not block you beyond ordering.

**One thing to know before your YSL data ops:** this migration **replaces `duplicate_variation()`**
to carry `cast_role`, `identity_mode` and `artist_id`. The body is the existing one with exactly two
lines changed. If you duplicate a variation **before** the migration is applied, nothing breaks —
there are no characters yet to lose — but after it is applied, use the app's switcher rather than a
hand-written copy, or a duplicate will silently drop cast identity. (I know because I first wrote
that function from memory, produced a body referencing `shots.title`, and `supabase/tests/cast_members_test.sql`
caught it. Copy the body; do not retype it.)
