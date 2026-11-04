import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ slug: string }> };
export const dynamic = "force-dynamic";

export default async function PublicPostDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  const { data: post, error } = await supabase.from("posts")
    .select("title,slug,excerpt,body,published_at,store_id")
    .eq("slug", slug)
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .maybeSingle();

  if (error || !post) notFound();

  let publisher = "شاخ ستور";
  if (post.store_id) {
    const { data: store } = await supabase.from("stores")
      .select("id,name").eq("id", post.store_id).maybeSingle();
    publisher = store?.name ?? "فرۆشگا";
  }

  return (
    <>
      <SiteHeader />
      <main className="container section public-post-detail">
        <Link href="/posts" className="auth-back"><ArrowRight size={17} /> گەڕانەوە بۆ پۆستەکان</Link>
        <article className="post-article">
          <span className="eyebrow"><FileText size={15} /> {publisher}</span>
          <h1>{post.title}</h1>
          {post.published_at && <time dateTime={post.published_at}>{new Date(post.published_at).toLocaleDateString("ckb-IQ", { dateStyle: "long" })}</time>}
          <p className="post-article-excerpt">{post.excerpt}</p>
          <div className="post-article-body">{post.body}</div>
        </article>
      </main>
    </>
  );
}
