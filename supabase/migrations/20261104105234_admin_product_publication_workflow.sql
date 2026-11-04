-- Product publication workflow and append-only moderation audit.
-- Version 20261104105234 is already present in the linked Supabase history.
-- Keep this source in sync; do not re-apply it to that linked project.

CREATE TABLE public.product_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_role text NOT NULL CHECK (actor_role IN ('admin', 'super_admin')),
  previous_status text NOT NULL CHECK (previous_status IN ('draft', 'published', 'archived')),
  new_status text NOT NULL CHECK (new_status IN ('draft', 'published', 'archived')),
  reviewed_updated_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 2 AND 1200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_moderation_events_actor_created_idx ON public.product_moderation_events (actor_user_id, created_at DESC);
CREATE INDEX product_moderation_events_product_created_idx ON public.product_moderation_events (product_id, created_at DESC);

ALTER TABLE public.product_moderation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_moderation_events_select_admin ON public.product_moderation_events
  FOR SELECT TO authenticated USING (public.current_app_role() IN ('admin', 'super_admin'));
REVOKE ALL ON TABLE public.product_moderation_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.product_moderation_events TO authenticated;

CREATE OR REPLACE FUNCTION private.prevent_product_moderation_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'PRODUCT_MODERATION_EVENTS_APPEND_ONLY' USING ERRCODE = '55000';
END;
$function$;
REVOKE ALL ON FUNCTION private.prevent_product_moderation_event_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER product_moderation_events_append_only BEFORE UPDATE OR DELETE
  ON public.product_moderation_events FOR EACH ROW
  EXECUTE FUNCTION private.prevent_product_moderation_event_mutation();

CREATE OR REPLACE FUNCTION private.admin_set_product_status_v1(
  p_product_id uuid, p_new_status text, p_reason text, p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_actor_role text;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_product record;
  v_event_id uuid;
BEGIN
  IF v_actor_user_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;

  SELECT u.raw_app_meta_data ->> 'role' INTO v_actor_role
  FROM auth.users AS u WHERE u.id = v_actor_user_id;
  IF COALESCE(v_actor_role, '') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_product_id IS NULL THEN RAISE EXCEPTION 'PRODUCT_ID_REQUIRED' USING ERRCODE = '22023'; END IF;
  IF p_new_status IS NULL OR p_new_status NOT IN ('draft', 'published', 'archived') THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_STATUS' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_reason) < 2 OR char_length(v_reason) > 1200 THEN
    RAISE EXCEPTION 'INVALID_MODERATION_REASON' USING ERRCODE = '22023';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'EXPECTED_PRODUCT_VERSION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT p.id, p.store_id, p.status AS product_status, p.price_iqd, p.is_available,
         p.category_id, p.updated_at, s.status AS store_status, s.is_platform_store
    INTO v_product
  FROM public.products AS p JOIN public.stores AS s ON s.id = p.store_id
  WHERE p.id = p_product_id FOR UPDATE OF p, s;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF v_product.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'PRODUCT_CHANGED_REFRESH_AND_REVIEW_AGAIN' USING ERRCODE = '40001';
  END IF;
  IF v_product.is_platform_store IS TRUE AND v_actor_role <> 'super_admin' THEN
    RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED_FOR_PLATFORM_STORE' USING ERRCODE = '42501';
  END IF;

  IF v_product.product_status = p_new_status THEN
    RETURN pg_catalog.jsonb_build_object(
      'product_id', v_product.id, 'previous_status', v_product.product_status,
      'status', v_product.product_status, 'idempotent_replay', true
    );
  END IF;
  IF v_product.product_status = 'archived' AND p_new_status = 'published' THEN
    RAISE EXCEPTION 'ARCHIVED_PRODUCT_MUST_RETURN_TO_DRAFT_FIRST' USING ERRCODE = 'P0001';
  END IF;

  IF p_new_status = 'published' THEN
    IF v_product.store_status <> 'active' THEN RAISE EXCEPTION 'STORE_NOT_ACTIVE' USING ERRCODE = 'P0001'; END IF;
    IF v_product.price_iqd <= 0 OR v_product.is_available IS NOT TRUE OR v_product.category_id IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_INCOMPLETE' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM public.catalog_categories AS c
      WHERE c.id = v_product.category_id AND c.is_active IS TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_CATEGORY_NOT_ACTIVE' USING ERRCODE = '23514'; END IF;
  END IF;

  UPDATE public.products SET status = p_new_status WHERE id = v_product.id;
  INSERT INTO public.product_moderation_events (
    product_id, store_id, actor_user_id, actor_role, previous_status, new_status, reviewed_updated_at, reason
  ) VALUES (
    v_product.id, v_product.store_id, v_actor_user_id, v_actor_role,
    v_product.product_status, p_new_status, v_product.updated_at, v_reason
  ) RETURNING id INTO v_event_id;

  RETURN pg_catalog.jsonb_build_object(
    'product_id', v_product.id, 'store_id', v_product.store_id,
    'previous_status', v_product.product_status, 'status', p_new_status,
    'audit_event_id', v_event_id, 'actor_role', v_actor_role, 'idempotent_replay', false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_product_status_v1(
  p_product_id uuid, p_new_status text, p_reason text, p_expected_updated_at timestamptz
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT private.admin_set_product_status_v1(p_product_id, p_new_status, p_reason, p_expected_updated_at);
$function$;

REVOKE ALL ON FUNCTION private.admin_set_product_status_v1(uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.admin_set_product_status_v1(uuid, text, text, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_product_status_v1(uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_product_status_v1(uuid, text, text, timestamptz) TO authenticated;

DO $assertions$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.product_moderation_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.product_moderation_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.product_moderation_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.product_moderation_events', 'DELETE')
     OR has_table_privilege('anon', 'public.product_moderation_events', 'SELECT') THEN
    RAISE EXCEPTION 'Moderation audit privileges are not configured as expected';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.admin_set_product_status_v1(uuid,text,text,timestamptz)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admin_set_product_status_v1(uuid,text,text,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Moderation RPC privileges are not configured as expected';
  END IF;
END;
$assertions$;
