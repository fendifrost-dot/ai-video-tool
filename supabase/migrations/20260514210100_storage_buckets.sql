-- AI Music Video OS — Storage Buckets
-- Path convention: {user_id}/{rest}
-- All buckets are private (signed URLs only). Mime types unrestricted in MVP — gated on client.

-- =============================================================================
-- Buckets
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('artist-assets',       'artist-assets',       false,  52428800),     -- 50 MB
  ('project-audio',       'project-audio',       false, 209715200),     -- 200 MB
  ('project-references',  'project-references',  false, 104857600),     -- 100 MB
  ('project-clips',       'project-clips',       false, 524288000),     -- 500 MB
  ('project-exports',     'project-exports',     false, 1073741824)     -- 1 GB
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- =============================================================================
-- Storage RLS policies — owner-only access by leading folder = user_id
-- =============================================================================
-- Drop any prior policies for these buckets (idempotent reruns)
do $$
declare
  buckets text[] := array[
    'artist-assets','project-audio','project-references','project-clips','project-exports'
  ];
  b text;
  op text;
begin
  foreach b in array buckets loop
    foreach op in array array['select','insert','update','delete'] loop
      execute format(
        'drop policy if exists "%s_%s_own" on storage.objects',
        b, op
      );
    end loop;
  end loop;
end $$;

-- Generate the 4 standard policies per bucket
do $$
declare
  buckets text[] := array[
    'artist-assets','project-audio','project-references','project-clips','project-exports'
  ];
  b text;
begin
  foreach b in array buckets loop
    execute format($f$
      create policy "%1$s_select_own" on storage.objects
        for select
        using (
          bucket_id = %1$L
          and auth.uid()::text = (storage.foldername(name))[1]
        )
    $f$, b);

    execute format($f$
      create policy "%1$s_insert_own" on storage.objects
        for insert
        with check (
          bucket_id = %1$L
          and auth.uid()::text = (storage.foldername(name))[1]
        )
    $f$, b);

    execute format($f$
      create policy "%1$s_update_own" on storage.objects
        for update
        using (
          bucket_id = %1$L
          and auth.uid()::text = (storage.foldername(name))[1]
        )
        with check (
          bucket_id = %1$L
          and auth.uid()::text = (storage.foldername(name))[1]
        )
    $f$, b);

    execute format($f$
      create policy "%1$s_delete_own" on storage.objects
        for delete
        using (
          bucket_id = %1$L
          and auth.uid()::text = (storage.foldername(name))[1]
        )
    $f$, b);
  end loop;
end $$;

-- =============================================================================
-- Path conventions (documented, enforced by the upload helpers in src/lib/storage.ts)
-- =============================================================================
-- artist-assets        {user_id}/{artist_id}/{filename}
-- project-audio        {user_id}/{project_id}/{filename}
-- project-references   {user_id}/{project_id}/{filename}
-- project-clips        {user_id}/{project_id}/{shot_id?}/{filename}
-- project-exports      {user_id}/{project_id}/exports/{export_id}.zip
