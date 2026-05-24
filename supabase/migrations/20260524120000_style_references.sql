-- Style reference photos for personal style LoRA v2 training

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'character_features_feature_type_check') then
    alter table public.character_features drop constraint character_features_feature_type_check;
  end if;
  alter table public.character_features
    add constraint character_features_feature_type_check
    check (feature_type in (
      'face','teeth','hands','tattoos','jewelry','hair','body',
      'wardrobe_top','wardrobe_bottom','wardrobe_outerwear',
      'wardrobe_footwear','wardrobe_accessory',
      'style_reference'
    ));
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('style-references','style-references',true,20971520,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "style_references_anon_select" on storage.objects;
drop policy if exists "style_references_anon_insert" on storage.objects;
drop policy if exists "style_references_anon_update" on storage.objects;
drop policy if exists "style_references_anon_delete" on storage.objects;

create policy "style_references_anon_select" on storage.objects
  for select to anon, authenticated using (bucket_id = 'style-references');
create policy "style_references_anon_insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'style-references');
create policy "style_references_anon_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'style-references') with check (bucket_id = 'style-references');
create policy "style_references_anon_delete" on storage.objects
  for delete to anon, authenticated using (bucket_id = 'style-references');
