-- Permit authenticated post managers to upload/delete their own post cover files.
CREATE POLICY post_covers_insert_manager ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'post-covers'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND public.current_app_role() IN ('admin','super_admin','restaurant','supermarket','produce_vendor','meat_seafood_vendor')
);

CREATE POLICY post_covers_delete_manager ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] = 'post-covers'
  AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  AND public.current_app_role() IN ('admin','super_admin','restaurant','supermarket','produce_vendor','meat_seafood_vendor')
);
