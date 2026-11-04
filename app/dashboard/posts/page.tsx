import { redirect } from "next/navigation";
import { DashboardFrame } from "@/components/dashboard-frame";
import { PostsManager, type PostAuditRecord, type PostRecord } from "@/components/posts-manager";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPostsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const roleValue = user.app_metadata?.role;
  const role = roleValue === "admin" || roleValue === "super_admin" ? roleValue : null;
  const identity = {
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email ?? "بەکارهێنەر",
    email: user.email ?? null,
    role,
  };

  if (!role) {
    return <DashboardFrame identity={identity} title="پۆست و ئاگاداری" subtitle="ئەم بەشە تەنها بۆ ئەدمین و سوپەر ئەدمینە." activePath="/dashboard/posts">
      <div className="empty-state"><strong>دەستڕاگەیشتنت بەم بەشە نییە</strong></div>
    </DashboardFrame>;
  }

  const [postsResult, eventsResult] = await Promise.all([
    supabase.from("posts").select("id,title,slug,excerpt,body,cover_image_url,status,published_at,updated_at").order("updated_at", { ascending: false }).limit(100),
    supabase.from("post_audit_events").select("id,post_id,title_snapshot,action,previous_status,new_status,actor_role,created_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const pageError = postsResult.error || eventsResult.error;
  const posts = (postsResult.data ?? []) as PostRecord[];
  const events = (eventsResult.data ?? []) as PostAuditRecord[];

  return (
    <DashboardFrame identity={identity} title="پۆست و ئاگاداری" subtitle="دروستکردن، دەستکاریکردن، بڵاوکردنەوە و ئەرشیفکردنی پۆستەکانی پلاتفۆرم." activePath="/dashboard/posts">
      {pageError
        ? <div className="empty-state"><strong>نەتوانرا پۆستەکان بخوێندرێنەوە</strong><span className="muted">RLS و دەستڕاگەیشتنی Database پشکنە.</span></div>
        : <PostsManager posts={posts} events={events} />}
    </DashboardFrame>
  );
}
