# Video variations — live; YSL data ops not yet done · 7 October 2026

> Integration agent → whichever agent executes next. Spend so far: **$0.00**. Paid generation is NOT authorised.

## What is live

- PR #179 merged (`bcc5678`). Lovable applied `supabase/migrations/20261007120000_video_variations.sql` (no errors),
  redeployed `grok-voice-director-proxy`, published https://aivideotool.lovable.app. Lovable's own commits on main:
  `536bccf`, `f7ecb8b` (drizzle copy of the migration + regenerated `src/integrations/supabase/types.ts` only). `git fetch` first.
- Verified in the live database after the migration: every project has one active **Original** variation; no row of
  shots / shot_asset_assignments / continuity_entities / treatment_versions / provider_jobs / timeline_manifests has a
  null `variation_id`; the moved direction columns on `video_projects` are empty.
- Local checks on the merged code: `tsc` clean; vitest 191 files / 2,255 passed; `scripts/e2e-local` browser run PASS
  including the new step (new variation = own treatment, empty board, no entities; first untouched; duplicate carries
  shots + footage under new ids; page chip names the variation). SQL test: `scripts/db/throwaway.sh`.

## YSL state right now (project `764a63d2-93cd-44f3-905f-292f14ab2f51`)

| | |
|---|---|
| Only variation | **Original** `86fe511a-b88a-47af-812f-7bf169c5c1af` — active |
| It holds | 48 shots, 100 assignments (incl. composite `a84ea8e5…` on shot_number 18 / board 17, restagings), 3 entities (PARIS_BLACK_RUNWAY + 2 lighting), 3 kept versions, 89 jobs, 1 timeline manifest |
| Its current treatment text | the saved **Interrupted Broadcast** treatment (manual, 5,615 chars, updated 2026-10-07T02:40:51Z) — i.e. the new treatment is sitting on the runway board's variation |
| Runway treatment to restore | `treatment_versions` `4e97e41a-2647-4483-8a30-bd27b5dd27e0` (grok-4-fast, 1,047 chars, "A lone performer owns the empty Paris Black Runway…", replaced_by `edit` on 2026-10-07) |
| `setup.footage_confirmed_at` | `2026-10-03T03:04:19.884Z` (carry to the new variation so Setup stays confirmed) |

## The four data ops still to do (either route; the app route also verifies the published build)

Through the app (sidebar switcher under the project title):
1. **Rename** Original → `Paris Black Runway`.
2. **New variation…** name `Interrupted Broadcast`, paste the saved treatment text (read it from the Original variation's Treatment page first, or from `video_variations.treatment_json->'treatment'->>'text'`). The dialog carries the footage confirmation and makes it active.
3. Switch back to Paris Black Runway → Treatment → **Versions** → open `4e97e41a` → **Restore** (the Interrupted Broadcast text it replaces is kept as a version there too — harmless, but the authority for IB is the IB variation).
4. Switch to **Interrupted Broadcast** (active). Confirm: Storyboard empty with "Write the shots from this treatment"; Continuity empty; Review/Export show the chip "Interrupted Broadcast"; switching back shows 48 shots with the composite on 17.

Through SQL (Lovable `query_database`, in this order):
```sql
update video_variations set name = 'Paris Black Runway' where id = '86fe511a-b88a-47af-812f-7bf169c5c1af';
insert into video_variations (project_id, user_id, name, treatment_json, mood, visual_style, notes)
select project_id, user_id, 'Interrupted Broadcast',
       jsonb_build_object('treatment', treatment_json->'treatment', 'text', treatment_json->'treatment'->>'text', 'concept', treatment_json->'treatment'->>'text', 'narrative', '', 'setup', treatment_json->'setup'),
       null, null, null
from video_variations where id = '86fe511a-b88a-47af-812f-7bf169c5c1af' returning id;
-- then restore the runway text on the runway variation (the trigger keeps the replaced IB text as a version there):
update video_variations v set treatment_json = v.treatment_json || jsonb_build_object('treatment', jsonb_build_object('text', t.treatment_text, 'mode', t.treatment_mode, 'model', t.treatment_model, 'updated_at', t.treatment_updated_at, 'notes', '', 'storyboard', null, 'change', 'restore', 'change_at', now()), 'text', t.treatment_text, 'concept', t.treatment_text)
from treatment_versions t where t.id = '4e97e41a-2647-4483-8a30-bd27b5dd27e0' and v.id = '86fe511a-b88a-47af-812f-7bf169c5c1af';
update video_projects set active_variation_id = '<id returned by the insert>' where id = '764a63d2-93cd-44f3-905f-292f14ab2f51';
```
Mood / visual_style / notes are deliberately left on Paris Black Runway only: they are runway-specific ("A Paris runway show at night…", 1,100-char notes) and would leak old instructions into Interrupted Broadcast.

## Then (unchanged scope from Fendi's 00:46 / 00:49 messages)

Build Interrupted Broadcast's storyboard from its treatment (writer call, cents; no paid rendering); character entities
with references; explicit links between connected shots; reference delivery to endpoints recorded on the job; per-shot
production method; exact reference-gap list (leather coat, denim outfit, blizzard jacket — none on file); dry-run
representative requests; revised capped test batch; correct the composite validation record (lip result = source mouth
motion preserved, song sync unverified); timeline_items drift verdict (columns come from
`20260920120000_performance_sync_source_ranges.sql:43-53` — generated-file lag, not missing migration; the
`@lovable.dev/vite-tanstack-config` 2.23.1→2.25.2 bump is Lovable's and untested here).
