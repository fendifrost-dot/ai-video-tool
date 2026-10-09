-- =============================================================================
-- video_projects.aspect_ratio — the project's frame as canonical data
--
-- Until now every project was implicitly 9:16: the generators defaulted to it and nothing else said what shape the
-- video is. The frame is now a column on the project; storyboard and Review stages, image and clip requests and the
-- export's frame metadata derive from it (src/lib/project/aspect.ts).
--
-- Additive. The default is 9:16, so every existing project keeps exactly the frame it has been generated in and
-- nothing changes shape. No footage is cropped by this setting: media of another shape is shown whole inside the
-- frame.
-- =============================================================================

alter table public.video_projects
  add column if not exists aspect_ratio text not null default '9:16';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'video_projects_aspect_ratio_check') then
    alter table public.video_projects
      add constraint video_projects_aspect_ratio_check check (aspect_ratio in ('9:16', '16:9', '1:1', '4:5'));
  end if;
end $$;

comment on column public.video_projects.aspect_ratio is 'The project frame: 9:16 | 16:9 | 1:1 | 4:5. Stages, generation requests and export metadata derive from it.';
