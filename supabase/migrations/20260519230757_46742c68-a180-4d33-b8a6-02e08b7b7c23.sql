ALTER TABLE public.character_features ADD COLUMN reference_images jsonb;
ALTER TABLE public.location_library ADD COLUMN reference_images jsonb;
ALTER TABLE public.prop_library ADD COLUMN reference_images jsonb;

UPDATE public.character_features
SET reference_images = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid(),
    'url', file_url,
    'storage_path', storage_path,
    'angle', 'front'
  )
)
WHERE file_url IS NOT NULL;

UPDATE public.location_library
SET reference_images = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid(),
    'url', file_url,
    'storage_path', storage_path,
    'angle', 'front'
  )
)
WHERE file_url IS NOT NULL;

UPDATE public.prop_library
SET reference_images = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid(),
    'url', file_url,
    'storage_path', storage_path,
    'angle', 'front'
  )
)
WHERE file_url IS NOT NULL;