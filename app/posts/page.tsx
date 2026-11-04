import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PublicPostsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return <><SiteHeader /><main className="container section"><div className="empty-state">پۆستەکان لەم کاتەدا بەردەست نین.</div></main></>;
  }

  const { data, error } = await supabase.from("posts")
    .select("id,title,slug,excerpt,published_at")
    .eq("status", "published")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) notFound();

  return (
    <>
      <SiteHeader />
      <main className="container section public-posts-page">
        <div className="section-heading">
          <div><span className="eyebrow"><FileText size={15} /> شاخ ستور</span><h1>پۆست و ئاگادارییەکان</h1><p>نوێکاری، ڕاگەیاندن و هەواڵەکانی پلاتفۆرم.</p></div>
          <Link href="/" className="text-link">گەڕانەوە بۆ بازاڕ <ArrowLeft size={16} /></Link>
        </div>
        {(data ?? []).length === 0 ? (
          <div className="empty-state"><FileText size={30} /><strong>هێشتا پۆستێکی بڵاوکراوە نییە</strong><span className="muted">هەواڵ و ئاگاداری نوێ لێرە دەردەکەون.</span></div>
        ) : (
          <div className="public-post-grid">
            {(data ?? []).map((post) => (
              <article className="public-post-card" key={post.id}>
                <div className="public-post-card-content">
                  {post.published_at && <time dateTime={post.published_at}>{new Date(post.published_at).toLocaleDateString("ckb-IQ", { dateStyle: "long" })}</time>}
                  <h2><Link href={`/posts/${post.slug}`}>{post.title}</Link></h2>
                  <p>{post.excerpt}</p>
                  <Link href={`/posts/${post.slug}`} className="text-link">خوێندنەوەی پۆست <ArrowLeft size={15} /></Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
