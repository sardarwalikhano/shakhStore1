-- Qualify the Storage object name explicitly in both folder checks.
-- This avoids the stores.name column shadowing storage.objects.name inside EXISTS.
DROP POLICY IF EXISTS product_images_insert_store_owner ON storage.objects;
DROP POLICY IF EXISTS product_images_delete_store_owner ON storage.objects;

CREATE POLICY product_images_insert_store_owner
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(storage.objects.name))[2] = (SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(storage.objects.name))[1]
      AND s.status = 'active'
      AND (
        (s.is_platform_store IS TRUE AND public.current_app_role() = 'super_admin')
        OR (s.is_platform_store IS FALSE AND public.current_app_role() = 'admin')
        OR (
          s.is_platform_store IS FALSE
          AND s.owner_id = (SELECT auth.uid())
          AND (
            (s.merchant_category = 'restaurant' AND public.current_app_role() = 'restaurant')
            OR (s.merchant_category = 'supermarket' AND public.current_app_role() = 'supermarket')
            OR (s.merchant_category = 'fruits_vegetables' AND public.current_app_role() = 'produce_vendor')
            OR (s.merchant_category = 'meat_seafood' AND public.current_app_role() = 'meat_seafood_vendor')
          )
        )
      )
  )
);

CREATE POLICY product_images_delete_store_owner
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(storage.objects.name))[2] = (SELECT auth.uid())::text
  AND EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id::text = (storage.foldername(storage.objects.name))[1]
      AND (
        (s.is_platform_store IS TRUE AND public.current_app_role() = 'super_admin')
        OR (s.is_platform_store IS FALSE AND public.current_app_role() = 'admin')
        OR (
          s.is_platform_store IS FALSE
          AND s.owner_id = (SELECT auth.uid())
          AND (
            (s.merchant_category = 'restaurant' AND public.current_app_role() = 'restaurant')
            OR (s.merchant_category = 'supermarket' AND public.current_app_role() = 'supermarket')
            OR (s.merchant_category = 'fruits_vegetables' AND public.current_app_role() = 'produce_vendor')
            OR (s.merchant_category = 'meat_seafood' AND public.current_app_role() = 'meat_seafood_vendor')
          )
        )
      )
  )
);
