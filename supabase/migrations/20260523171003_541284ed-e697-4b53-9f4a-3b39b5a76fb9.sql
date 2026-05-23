-- DEV ONLY: open all access to anon role on these tables + look-composites bucket.
-- WARNING: removes per-user isolation. Revert before production.

-- artists
DROP POLICY IF EXISTS artists_select_own ON public.artists;
DROP POLICY IF EXISTS artists_insert_own ON public.artists;
DROP POLICY IF EXISTS artists_update_own ON public.artists;
DROP POLICY IF EXISTS artists_delete_own ON public.artists;
CREATE POLICY artists_anon_all ON public.artists FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- character_features
DROP POLICY IF EXISTS "Users access own character_features" ON public.character_features;
CREATE POLICY character_features_anon_all ON public.character_features FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- location_library
DROP POLICY IF EXISTS "Users access own location_library" ON public.location_library;
CREATE POLICY location_library_anon_all ON public.location_library FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- prop_library
DROP POLICY IF EXISTS "Users access own prop_library" ON public.prop_library;
CREATE POLICY prop_library_anon_all ON public.prop_library FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- artist_looks
DROP POLICY IF EXISTS "Users access own artist_looks" ON public.artist_looks;
CREATE POLICY artist_looks_anon_all ON public.artist_looks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- storage bucket: look-composites — open to anon
DROP POLICY IF EXISTS "look_composites_anon_select" ON storage.objects;
DROP POLICY IF EXISTS "look_composites_anon_insert" ON storage.objects;
DROP POLICY IF EXISTS "look_composites_anon_update" ON storage.objects;
DROP POLICY IF EXISTS "look_composites_anon_delete" ON storage.objects;
CREATE POLICY "look_composites_anon_select" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'look-composites');
CREATE POLICY "look_composites_anon_insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'look-composites');
CREATE POLICY "look_composites_anon_update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'look-composites') WITH CHECK (bucket_id = 'look-composites');
CREATE POLICY "look_composites_anon_delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'look-composites');