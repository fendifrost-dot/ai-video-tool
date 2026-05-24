-- Update character_features feature_type CHECK constraint to include 'style_reference'
ALTER TABLE public.character_features
DROP CONSTRAINT character_features_feature_type_check;

ALTER TABLE public.character_features
ADD CONSTRAINT character_features_feature_type_check
CHECK (feature_type = ANY (ARRAY[
  'face'::text,
  'teeth'::text,
  'hands'::text,
  'tattoos'::text,
  'jewelry'::text,
  'hair'::text,
  'body'::text,
  'wardrobe_top'::text,
  'wardrobe_bottom'::text,
  'wardrobe_outerwear'::text,
  'wardrobe_footwear'::text,
  'wardrobe_accessory'::text,
  'style_reference'::text
]));

-- Make the style-references bucket public
UPDATE storage.buckets
SET public = true
WHERE id = 'style-references';

-- Create storage policies for anon read/write access on style-references bucket
CREATE POLICY "style_references_select_anon"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'style-references');

CREATE POLICY "style_references_insert_anon"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'style-references');

CREATE POLICY "style_references_update_anon"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'style-references')
WITH CHECK (bucket_id = 'style-references');

CREATE POLICY "style_references_delete_anon"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (bucket_id = 'style-references');