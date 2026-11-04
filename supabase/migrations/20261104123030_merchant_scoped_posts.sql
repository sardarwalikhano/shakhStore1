-- Merchant-owned posts alongside Shakh Store platform announcements.
-- Platform posts keep store_id NULL; merchant posts are bound to one active store.
ALTER TABLE public.posts
  ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT;

CREATE INDEX posts_store_created_idx
  ON public.posts (store_id, created_at DESC)
  WHERE store_id IS NOT NULL;

-- Public readers can see only published platform posts or published posts
-- belonging to an active merchant store. Admins can inspect every post.
DROP POLICY IF EXISTS posts_public_read_published ON public.posts;
CREATE POLICY posts_public_read_published ON public.posts
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    AND published_at IS NOT NULL
    AND published_at <= now()
    AND (
      store_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.stores s
        WHERE s.id = posts.store_id
          AND s.is_platform_store = false
          AND s.status = 'active'
      )
    )
  );

CREATE POLICY posts_admin_read_all ON public.posts
  FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('admin', 'super_admin'));

-- Admin-created content is always platform content ("Shakh Store").
DROP POLICY IF EXISTS posts_admin_insert ON public.posts;
CREATE POLICY posts_admin_insert ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() IN ('admin', 'super_admin')
    AND store_id IS NULL
  );

-- Merchants see only posts authored by themselves for a store matching
-- their trusted app_metadata role and owned by their authenticated user.
CREATE POLICY posts_merchant_read_own ON public.posts
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('restaurant', 'supermarket', 'produce_vendor', 'meat_seafood_vendor')
    AND author_user_id = (SELECT auth.uid())
    AND store_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = posts.store_id
        AND s.owner_id = (SELECT auth.uid())
        AND s.is_platform_store = false
        AND s.merchant_category = CASE public.current_app_role()
          WHEN 'restaurant' THEN 'restaurant'
          WHEN 'supermarket' THEN 'supermarket'
          WHEN 'produce_vendor' THEN 'fruits_vegetables'
          WHEN 'meat_seafood_vendor' THEN 'meat_seafood'
          ELSE NULL
        END
    )
  );

CREATE POLICY posts_merchant_insert_own ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_app_role() IN ('restaurant', 'supermarket', 'produce_vendor', 'meat_seafood_vendor')
    AND author_user_id = (SELECT auth.uid())
    AND store_id IS NOT NULL
    AND status = 'draft'
    AND published_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = posts.store_id
        AND s.owner_id = (SELECT auth.uid())
        AND s.is_platform_store = false
        AND s.status = 'active'
        AND s.merchant_category = CASE public.current_app_role()
          WHEN 'restaurant' THEN 'restaurant'
          WHEN 'supermarket' THEN 'supermarket'
          WHEN 'produce_vendor' THEN 'fruits_vegetables'
          WHEN 'meat_seafood_vendor' THEN 'meat_seafood'
          ELSE NULL
        END
    )
  );

CREATE POLICY posts_merchant_update_own ON public.posts
  FOR UPDATE TO authenticated
  USING (
    public.current_app_role() IN ('restaurant', 'supermarket', 'produce_vendor', 'meat_seafood_vendor')
    AND author_user_id = (SELECT auth.uid())
    AND store_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = posts.store_id
        AND s.owner_id = (SELECT auth.uid())
        AND s.is_platform_store = false
        AND s.merchant_category = CASE public.current_app_role()
          WHEN 'restaurant' THEN 'restaurant'
          WHEN 'supermarket' THEN 'supermarket'
          WHEN 'produce_vendor' THEN 'fruits_vegetables'
          WHEN 'meat_seafood_vendor' THEN 'meat_seafood'
          ELSE NULL
        END
    )
  )
  WITH CHECK (
    public.current_app_role() IN ('restaurant', 'supermarket', 'produce_vendor', 'meat_seafood_vendor')
    AND author_user_id = (SELECT auth.uid())
    AND store_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = posts.store_id
        AND s.owner_id = (SELECT auth.uid())
        AND s.is_platform_store = false
        AND s.merchant_category = CASE public.current_app_role()
          WHEN 'restaurant' THEN 'restaurant'
          WHEN 'supermarket' THEN 'supermarket'
          WHEN 'produce_vendor' THEN 'fruits_vegetables'
          WHEN 'meat_seafood_vendor' THEN 'meat_seafood'
          ELSE NULL
        END
        AND (
          posts.status <> 'published'
          OR (
            s.status = 'active'
            AND posts.published_at IS NOT NULL
            AND posts.published_at <= now()
          )
        )
    )
  );

-- Merchants can read audit events for their own posts; direct writes stay
-- revoked and the trigger remains the only audit writer.
ALTER TABLE public.post_audit_events
  DROP CONSTRAINT post_audit_events_actor_role_check;
ALTER TABLE public.post_audit_events
  ADD CONSTRAINT post_audit_events_actor_role_check
  CHECK (actor_role IN (
    'admin', 'super_admin',
    'restaurant', 'supermarket', 'produce_vendor', 'meat_seafood_vendor'
  ));

CREATE POLICY post_audit_events_merchant_read_own ON public.post_audit_events
  FOR SELECT TO authenticated
  USING (
    public.current_app_role() IN ('restaurant', 'supermarket', 'produce_vendor', 'meat_seafood_vendor')
    AND EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.id = post_audit_events.post_id
        AND p.author_user_id = (SELECT auth.uid())
        AND p.store_id IS NOT NULL
    )
  );

-- The audit trigger accepts trusted platform roles, or a merchant acting on
-- their own role-matched store. Publishing is blocked while the store is inactive.
CREATE OR REPLACE FUNCTION private.capture_post_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_actor_role text := public.current_app_role();
  v_action text;
  v_previous_status text;
  v_new_status text;
  v_post_id uuid;
  v_title text;
BEGIN
  IF v_actor_user_id IS NULL OR NOT (
    v_actor_role IN ('admin', 'super_admin')
    OR (
      v_actor_role IN ('restaurant', 'supermarket', 'produce_vendor', 'meat_seafood_vendor')
      AND NEW.author_user_id = v_actor_user_id
      AND NEW.store_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.stores s
        WHERE s.id = NEW.store_id
          AND s.owner_id = v_actor_user_id
          AND s.is_platform_store = false
          AND s.merchant_category = CASE v_actor_role
            WHEN 'restaurant' THEN 'restaurant'
            WHEN 'supermarket' THEN 'supermarket'
            WHEN 'produce_vendor' THEN 'fruits_vegetables'
            WHEN 'meat_seafood_vendor' THEN 'meat_seafood'
            ELSE NULL
          END
          AND (NEW.status <> 'published' OR s.status = 'active')
      )
    )
  ) THEN
    RAISE EXCEPTION 'POST_AUTHOR_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_post_id := NEW.id;
    v_title := NEW.title;
    v_new_status := NEW.status;
    v_previous_status := NULL;
    v_action := CASE WHEN NEW.status = 'published' THEN 'published' ELSE 'created' END;
  ELSE
    v_post_id := NEW.id;
    v_title := NEW.title;
    v_previous_status := OLD.status;
    v_new_status := NEW.status;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := CASE
        WHEN NEW.status = 'published' THEN 'published'
        WHEN NEW.status = 'archived' THEN 'archived'
        WHEN OLD.status = 'archived' AND NEW.status = 'draft' THEN 'restored'
        ELSE 'unpublished'
      END;
    ELSE
      v_action := 'updated';
    END IF;
  END IF;

  INSERT INTO public.post_audit_events (
    post_id, actor_user_id, actor_role, action,
    previous_status, new_status, title_snapshot
  )
  VALUES (
    v_post_id, v_actor_user_id, v_actor_role, v_action,
    v_previous_status, v_new_status, v_title
  );

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.capture_post_audit_event() FROM PUBLIC, anon, authenticated;

DO $assertions$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.posts'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.post_audit_events'::regclass) THEN
    RAISE EXCEPTION 'RLS must remain enabled on posts and post_audit_events';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.posts', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.posts', 'UPDATE')
     OR has_table_privilege('anon', 'public.posts', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.post_audit_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.post_audit_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.post_audit_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.post_audit_events', 'DELETE') THEN
    RAISE EXCEPTION 'Post and audit table privileges are not configured as expected';
  END IF;
END;
$assertions$;
