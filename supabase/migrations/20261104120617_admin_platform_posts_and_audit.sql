-- Admin-managed platform posts, public published feed, and append-only audit.
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 180),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 180),
  excerpt text NOT NULL CHECK (char_length(btrim(excerpt)) BETWEEN 10 AND 360),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 20 AND 30000),
  cover_image_url text CHECK (cover_image_url IS NULL OR (char_length(cover_image_url) <= 2048 AND cover_image_url ~ '^https://')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX posts_publication_idx ON public.posts (published_at DESC, created_at DESC) WHERE status = 'published';
CREATE INDEX posts_author_created_idx ON public.posts (author_user_id, created_at DESC);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY posts_public_read_published ON public.posts
  FOR SELECT TO anon, authenticated
  USING (
    (status = 'published' AND published_at IS NOT NULL AND published_at <= now())
    OR public.current_app_role() IN ('admin', 'super_admin')
  );
CREATE POLICY posts_admin_insert ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('admin', 'super_admin'));
CREATE POLICY posts_admin_update ON public.posts
  FOR UPDATE TO authenticated
  USING (public.current_app_role() IN ('admin', 'super_admin'))
  WITH CHECK (public.current_app_role() IN ('admin', 'super_admin'));

REVOKE ALL ON TABLE public.posts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.posts TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.posts TO authenticated;

CREATE TABLE public.post_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_role text NOT NULL CHECK (actor_role IN ('admin', 'super_admin')),
  action text NOT NULL CHECK (action IN ('created', 'updated', 'published', 'unpublished', 'archived', 'restored')),
  previous_status text CHECK (previous_status IS NULL OR previous_status IN ('draft', 'published', 'archived')),
  new_status text NOT NULL CHECK (new_status IN ('draft', 'published', 'archived')),
  title_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX post_audit_events_post_created_idx ON public.post_audit_events (post_id, created_at DESC);
CREATE INDEX post_audit_events_actor_created_idx ON public.post_audit_events (actor_user_id, created_at DESC);
ALTER TABLE public.post_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY post_audit_events_admin_read ON public.post_audit_events
  FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('admin', 'super_admin'));
REVOKE ALL ON TABLE public.post_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.post_audit_events TO authenticated;

CREATE OR REPLACE FUNCTION private.set_post_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.set_post_updated_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER posts_set_updated_at BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.set_post_updated_at();

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
  IF v_actor_user_id IS NULL OR COALESCE(v_actor_role, '') NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED_FOR_POST_AUDIT' USING ERRCODE = '42501';
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
    post_id, actor_user_id, actor_role, action, previous_status, new_status, title_snapshot
  )
  VALUES (
    v_post_id, v_actor_user_id, v_actor_role, v_action, v_previous_status, v_new_status, v_title
  );
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.capture_post_audit_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER posts_capture_audit_event AFTER INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION private.capture_post_audit_event();

CREATE OR REPLACE FUNCTION private.prevent_post_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'POST_AUDIT_EVENTS_APPEND_ONLY' USING ERRCODE = '55000';
END;
$function$;
REVOKE ALL ON FUNCTION private.prevent_post_audit_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER post_audit_events_append_only BEFORE UPDATE OR DELETE ON public.post_audit_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_post_audit_mutation();

DO $assertions$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.posts'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.post_audit_events'::regclass) THEN
    RAISE EXCEPTION 'RLS must be enabled on posts and post_audit_events';
  END IF;
  IF NOT has_table_privilege('anon', 'public.posts', 'SELECT')
     OR has_table_privilege('anon', 'public.posts', 'INSERT')
     OR has_table_privilege('anon', 'public.posts', 'UPDATE')
     OR has_table_privilege('anon', 'public.posts', 'DELETE') THEN
    RAISE EXCEPTION 'Public posts privileges are not configured as expected';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.post_audit_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.post_audit_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.post_audit_events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.post_audit_events', 'DELETE')
     OR has_table_privilege('anon', 'public.post_audit_events', 'SELECT') THEN
    RAISE EXCEPTION 'Post audit privileges are not configured as expected';
  END IF;
END;
$assertions$;
