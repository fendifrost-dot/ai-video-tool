-- SEC-4 full-state verification for prop-refs and project-references (12 Oct 2026).
-- Read-only. Raises if the live policy state differs from the reviewed design in ANY way that matters to these two
-- buckets: the exact set of policies naming them, each policy's command, roles and expressions, the single_tenant_storage
-- array, the grants table lock-down and the predicate's privileges. Run it after the migration and after any later
-- storage change; it is the check the migration's own preflight (one policy's name/role/command) does not make.
do $$
declare
  bad text := '';
  expected text[] := array[
    'project-references_delete_legacy_grant|DELETE|{authenticated}|((bucket_id = ''project-references''::text) AND storage_legacy_folder_access(bucket_id, name))|',
    'project-references_delete_own|DELETE|{public}|((bucket_id = ''project-references''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))|',
    'project-references_insert_own|INSERT|{public}||((bucket_id = ''project-references''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',
    'project-references_select_legacy_grant|SELECT|{authenticated}|((bucket_id = ''project-references''::text) AND storage_legacy_folder_access(bucket_id, name))|',
    'project-references_select_own|SELECT|{public}|((bucket_id = ''project-references''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))|',
    'project-references_update_own|UPDATE|{public}|((bucket_id = ''project-references''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))|((bucket_id = ''project-references''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',
    'prop-refs_delete_own|DELETE|{public}|((bucket_id = ''prop-refs''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))|',
    'prop-refs_insert_own|INSERT|{public}||((bucket_id = ''prop-refs''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))',
    'prop-refs_select_own|SELECT|{public}|((bucket_id = ''prop-refs''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))|',
    'prop-refs_update_own|UPDATE|{public}|((bucket_id = ''prop-refs''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))|((bucket_id = ''prop-refs''::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))'
  ];
  actual text[];
  unfiltered int; st_qual text; grants int; anon_exec boolean; auth_exec boolean; auth_grants boolean; rls boolean;
begin
  -- 1. Every policy that mentions either bucket, with full expressions, must equal the expected set exactly.
  select coalesce(array_agg(policyname || '|' || cmd || '|' || roles::text || '|' || coalesce(qual,'') || '|' || coalesce(with_check,'') order by policyname), '{}')
    into actual
    from pg_policies where schemaname='storage' and tablename='objects'
     and (coalesce(qual,'') || coalesce(with_check,'')) ~ '(prop-refs|project-references)';
  if actual <> expected then bad := bad || format(' policy set differs: actual=%s;', actual); end if;
  -- 2. No storage.objects policy may lack a bucket_id filter.
  select count(*) into unfiltered from pg_policies where schemaname='storage' and tablename='objects'
     and coalesce(qual,'') not ilike '%bucket_id%' and coalesce(with_check,'') not ilike '%bucket_id%';
  if unfiltered <> 0 then bad := bad || format(' %s unfiltered storage policies;', unfiltered); end if;
  -- 3. single_tenant_storage names exactly the nine remaining buckets.
  select qual into st_qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='single_tenant_storage';
  if st_qual is distinct from '(bucket_id = ANY (ARRAY[''artist-assets''::text, ''project-audio''::text, ''project-clips''::text, ''project-exports''::text, ''wardrobe-refs''::text, ''location-refs''::text, ''look-composites''::text, ''style-references''::text, ''training-zips''::text]))'
    then bad := bad || format(' single_tenant_storage qual=%s;', st_qual); end if;
  -- 4. Grants: exactly 7, all for the owner; table locked; predicate executable by authenticated only.
  select count(*) into grants from public.storage_legacy_folder_grants where bucket_id='project-references' and user_id='3ca10935-8c3d-4479-9a0c-8bfe8050840c';
  if grants <> 7 or (select count(*) from public.storage_legacy_folder_grants) <> 7 then bad := bad || format(' grants=%s;', grants); end if;
  select relrowsecurity into rls from pg_class where oid='public.storage_legacy_folder_grants'::regclass;
  if not rls then bad := bad || ' grants table RLS off;'; end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='storage_legacy_folder_grants') then bad := bad || ' grants table has policies;'; end if;
  select has_table_privilege('authenticated','public.storage_legacy_folder_grants','select') into auth_grants;
  if auth_grants then bad := bad || ' authenticated can read grants;'; end if;
  select has_function_privilege('anon','public.storage_legacy_folder_access(text,text)','execute'), has_function_privilege('authenticated','public.storage_legacy_folder_access(text,text)','execute') into anon_exec, auth_exec;
  if anon_exec or not auth_exec then bad := bad || format(' predicate privileges anon=%s auth=%s;', anon_exec, auth_exec); end if;
  -- 5. Both buckets private.
  if exists (select 1 from storage.buckets where id in ('prop-refs','project-references') and public) then bad := bad || ' a bucket is public;'; end if;
  if bad <> '' then raise exception 'SEC-4 VERIFY FAILED:%', bad; end if;
  raise notice 'SEC-4 VERIFY OK: % policies, 7 grants, locked table, private buckets', array_length(actual, 1);
end $$;
