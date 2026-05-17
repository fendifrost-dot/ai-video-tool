-- Phase A — One-shot copy from artist_assets into character_features.
-- Non-destructive: artist_assets is left in place. We copy each row, tagging
-- character_features.metadata_json.migrated_from_asset_id so we can reverse if
-- needed. Re-runs are idempotent — the WHERE NOT EXISTS check skips rows
-- already migrated.

insert into public.character_features (
  artist_id,
  feature_type,
  label,
  file_url,
  is_primary,
  is_locked,
  reinforce_on_drift,
  metadata_json,
  uploaded_at
)
select
  a.artist_id,
  case a.asset_type
    when 'face_front'    then 'face'
    when 'face_3q_left'  then 'face'
    when 'face_3q_right' then 'face'
    when 'face_left'     then 'face'
    when 'face_right'    then 'face'
    when 'face_top'      then 'face'
    when 'face_bottom'   then 'face'
    when 'mouth_open'    then 'face'
    when 'mouth_closed'  then 'face'
    when 'expression'    then 'face'
    when 'body'          then 'body'
    when 'hair'          then 'hair'
    when 'tattoo'        then 'tattoos'
    when 'wardrobe'      then 'body'
    when 'jewelry'       then 'jewelry'
    when 'other'         then 'body'
    else 'body'
  end as feature_type,
  case a.asset_type
    when 'face_front'    then 'neutral'
    when 'face_3q_left'  then 'three_quarter_left'
    when 'face_3q_right' then 'three_quarter_right'
    when 'face_left'     then 'side_profile_left'
    when 'face_right'    then 'side_profile_right'
    when 'face_top'      then 'looking_up'
    when 'face_bottom'   then 'looking_down'
    when 'mouth_open'    then 'mouth_open'
    when 'mouth_closed'  then 'neutral_mouth_closed'
    when 'expression'    then 'smiling'
    when 'body'          then 'silhouette_front'
    when 'hair'          then 'natural'
    when 'tattoo'        then 'arm_left'
    when 'wardrobe'      then 'wardrobe_legacy'
    when 'jewelry'       then 'chain'
    when 'other'         then 'other_legacy'
    else 'other_legacy'
  end as label,
  a.file_url,
  coalesce(a.is_primary_reference, false) as is_primary,
  coalesce(a.is_primary_reference, false) as is_locked,
  true as reinforce_on_drift,
  jsonb_build_object(
    'migrated_from_asset_id', a.id::text,
    'migrated_from_asset_type', a.asset_type::text,
    'original_metadata', coalesce(a.metadata_json, '{}'::jsonb),
    'tags', coalesce(a.tags, array[]::text[]),
    'description', a.description
  ) as metadata_json,
  coalesce(a.created_at, now()) as uploaded_at
from public.artist_assets a
where not exists (
  select 1 from public.character_features cf
  where cf.metadata_json ->> 'migrated_from_asset_id' = a.id::text
);
