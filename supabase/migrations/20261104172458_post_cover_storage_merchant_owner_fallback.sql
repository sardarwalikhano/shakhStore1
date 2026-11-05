-- Allow merchant owners with an active, non-platform store to upload
-- their own post covers even when the app_metadata role in their JWT is stale.
-- The object remains isolated under post-covers/{auth.uid()}/.
DROP POLICY IF EXISTS post_covers_insert_manager ON storage.objects;
CREATE POLICY post_covers_insert_manager ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'post-covers'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND (
    public.current_app_role() IN ('admin','super_admin')
    OR EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.owner_id = (SELECT auth.uid())
        AND s.is_platform_store IS FALSE
        AND s.status = 'active'
        AND s.merchant_category IN ('restaurant','supermarket','fruits_vegetables','meat_seafood')
    )
  )
);

DROP POLICY IF EXISTS post_covers_delete_manager ON storage.objects;
CREATE POLICY post_covers_delete_manager ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'post-covers'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND (
    public.current_app_role() IN ('admin','super_admin')
    OR EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.owner_id = (SELECT auth.uid())
        AND s.is_platform_store IS FALSE
        AND s.status = 'active'
        AND s.merchant_category IN ('restaurant','supermarket','fruits_vegetables','meat_seafood')
    )
  )
);
