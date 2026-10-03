-- =============================================================================
-- Treatment history (Fendi, 2026-10-03: "The production test irreversibly replaced earlier Treatment/notes text.
-- That must not happen again.")
--
-- The treatment (video_projects.treatment_json → treatment.text) and what the writer is told with it (notes, mood,
-- visual direction) were single values: a Generate, a manual save or a delete simply replaced them. From here the
-- database itself keeps what is being replaced, whoever writes — the app, a script, a SQL editor:
--
--   • treatment_versions      one row per replaced version: the text, who wrote it, the notes, mood and visual
--                             direction that stood beside it, and the whole treatment record (minus the stored
--                             second-opinion review, which is not part of the treatment);
--   • a BEFORE UPDATE trigger on video_projects that writes that row whenever the text or its context changes.
--
-- Nothing is ever restored BY this migration and nothing existing is changed: the current treatment stays current.
-- Restoring a version is an ordinary update made by the app (which this same trigger then records).
--
-- Additive and idempotent.
-- =============================================================================

create table if not exists public.treatment_versions (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.video_projects(id) on delete cascade,
  user_id              uuid not null,
  created_at           timestamptz not null default now(),
  -- what replaced this version: generate | edit | delete | restore | context (only notes / mood / visual changed)
  replaced_by          text not null default 'edit',
  treatment_text       text not null default '',
  treatment_mode       text,
  treatment_model      text,
  treatment_updated_at text,
  notes                text,
  mood                 text,
  visual_style         text,
  treatment_json       jsonb
);

create index if not exists treatment_versions_project_created_idx
  on public.treatment_versions (project_id, created_at desc);

comment on table public.treatment_versions is
  'Every treatment a project has had, kept when it is replaced (trigger video_projects_keep_treatment_version). Append-only: the app reads it and restores from it; nothing updates or deletes rows.';

grant select on public.treatment_versions to authenticated;
grant all on public.treatment_versions to service_role;
alter table public.treatment_versions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'treatment_versions' and policyname = 'treatment_versions_owner_select') then
    create policy treatment_versions_owner_select on public.treatment_versions
      for select to authenticated using (user_id = auth.uid());
  end if;
end $$;
-- No insert / update / delete policy on purpose: rows are written by the trigger (security definer) and never changed.

-- The treatment text inside treatment_json, read the way the app reads it (src/lib/treatment/treatmentDoc.ts
-- parseTreatmentDoc): the current shape's treatment.text; else an older structured treatment's concept + narrative;
-- else the first prose envelope's text.
create or replace function public.treatment_text_of(j jsonb)
returns text
language sql
immutable
as $$
  select case
    when jsonb_typeof(j -> 'treatment' -> 'text') = 'string' then j -> 'treatment' ->> 'text'
    else coalesce(
      nullif(concat_ws(E'\n\n', nullif(btrim(coalesce(j ->> 'concept', '')), ''), nullif(btrim(coalesce(j ->> 'narrative', '')), '')), ''),
      btrim(coalesce(j ->> 'text', ''))
    )
  end
$$;

create or replace function public.keep_treatment_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_json   jsonb := coalesce(old.treatment_json, '{}'::jsonb);
  new_json   jsonb := coalesce(new.treatment_json, '{}'::jsonb);
  old_text   text  := coalesce(public.treatment_text_of(old_json), '');
  new_text   text  := coalesce(public.treatment_text_of(new_json), '');
  old_dnotes text  := btrim(coalesce(old_json -> 'treatment' ->> 'notes', ''));
  new_dnotes text  := btrim(coalesce(new_json -> 'treatment' ->> 'notes', ''));
  old_notes  text  := btrim(coalesce(old.notes, ''));
  text_changed    boolean := old_text is distinct from new_text;
  context_changed boolean :=
       old_notes is distinct from btrim(coalesce(new.notes, ''))
    or old_dnotes is distinct from new_dnotes
    or coalesce(old.mood, '') is distinct from coalesce(new.mood, '')
    or coalesce(old.visual_style, '') is distinct from coalesce(new.visual_style, '');
begin
  if not (text_changed or context_changed) then
    return new;
  end if;
  -- a project that had no treatment and no context has nothing to keep
  if old_text = '' and old_notes = '' and old_dnotes = '' and coalesce(old.mood, '') = '' and coalesce(old.visual_style, '') = '' then
    return new;
  end if;
  insert into public.treatment_versions
    (project_id, user_id, replaced_by, treatment_text, treatment_mode, treatment_model, treatment_updated_at, notes, mood, visual_style, treatment_json)
  values (
    old.id,
    old.user_id,
    case
      when not text_changed then 'context'
      -- the app says what the write was (treatment.change), stamped so an old label is never read as this write's
      when nullif(new_json -> 'treatment' ->> 'change', '') is not null
        and (new_json -> 'treatment' ->> 'change_at') is distinct from (old_json -> 'treatment' ->> 'change_at')
        then new_json -> 'treatment' ->> 'change'
      when new_text = '' then 'delete'
      else 'edit'
    end,
    old_text,
    old_json -> 'treatment' ->> 'mode',
    coalesce(old_json -> 'treatment' ->> 'model', old_json ->> 'model'),
    coalesce(old_json -> 'treatment' ->> 'updated_at', old_json ->> 'generated_at'),
    -- the two older notes fields are one text to the director (treatmentDoc.ts directorNotes)
    nullif(case when old_dnotes = '' or old_dnotes = old_notes then old_notes else concat_ws(E'\n\n', nullif(old_notes, ''), old_dnotes) end, ''),
    old.mood,
    old.visual_style,
    old_json - 'astra_review'
  );
  return new;
end
$$;

drop trigger if exists video_projects_keep_treatment_version on public.video_projects;
create trigger video_projects_keep_treatment_version
  before update on public.video_projects
  for each row
  execute function public.keep_treatment_version();
