ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general'
  CHECK (category IN ('general','offers','products','news','announcements','food','meat','produce','supermarket'));

CREATE INDEX IF NOT EXISTS posts_category_publication_idx
  ON public.posts (category, published_at DESC)
  WHERE status = 'published';
