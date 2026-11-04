"use client";

import { useActionState, useRef, useState } from "react";
import { Archive, FileText, Pencil, Plus, RotateCcw, Send } from "lucide-react";
import { savePostAction, updatePostStatusAction, type PostActionState } from "@/app/dashboard/posts/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getPostStatusLabel, getPostStatusTargets, type PostStatus } from "@/lib/post-rules";

export type PostRecord = {
  id: string; title: string; slug: string; excerpt: string; body: string;
  cover_image_url: string | null; status: PostStatus; published_at: string | null;
  store_id: string | null; category: string; updated_at: string;
};
export type PostAuditRecord = {
  id: string; post_id: string; title_snapshot: string; action: string;
  previous_status: string | null; new_status: string; actor_role: string; created_at: string;
};
const initialState: PostActionState = { status: "idle", message: "" };

function actionLabel(status: string) {
  if (status === "published") return "بڵاوکردنەوە";
  if (status === "archived") return "ئەرشیفکردن";
  return "گەڕاندنەوە بۆ ڕەشنووس";
}

function StatusForm({ post }: { post: PostRecord }) {
  const [state, formAction, pending] = useActionState(updatePostStatusAction, initialState);
  const targets = getPostStatusTargets(post.status);
  if (!targets.length) return null;
  return (
    <form action={formAction} className="post-status-form">
      <input type="hidden" name="post_id" value={post.id} />
      <select name="new_status" defaultValue={targets[0]} aria-label="دۆخی نوێی پۆست">
        {targets.map((status) => <option key={status} value={status}>{actionLabel(status)}</option>)}
      </select>
      <button type="submit" className="button" disabled={pending}>
        {post.status === "archived" ? <RotateCcw size={16} /> : post.status === "published" ? <Archive size={16} /> : <Send size={16} />}
        {pending ? "چاوەڕێ بکە..." : post.status === "draft" ? "بڵاوکردنەوەی پۆست" : post.status === "published" ? "گۆڕینی دۆخی پۆست" : "گەڕاندنەوەی پۆست"}
      </button>
      {state.message && <p className={state.status === "success" ? "form-success" : "form-error"} role={state.status === "success" ? "status" : "alert"}>{state.message}</p>}
    </form>
  );
}

function PostEditor({ post, storeId }: { post?: PostRecord; storeId?: string | null }) {
  const [state, formAction, pending] = useActionState(savePostAction, initialState);
  const suffix = post?.id ?? "new";
  return (
    <form id={!post ? "new-post-editor" : undefined} action={formAction} className="merchant-form post-editor-form">
      {post && <input type="hidden" name="post_id" value={post.id} />}
      {!post && storeId && <input type="hidden" name="store_id" value={storeId} />}
      <div className="merchant-field">
        <label htmlFor={`post-title-${suffix}`}>ناونیشان *</label>
        <input className="plain-field" id={`post-title-${suffix}`} name="title" required minLength={3} maxLength={180} defaultValue={post?.title ?? ""} />
      </div>
      <div className="merchant-field">
        <label htmlFor={`post-slug-${suffix}`}>Slug *</label>
        <input className="plain-field" id={`post-slug-${suffix}`} name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={180} defaultValue={post?.slug ?? ""} dir="ltr" />
      </div>
      <div className="merchant-field merchant-field-wide">
        <label htmlFor={`post-excerpt-${suffix}`}>پوختە *</label>
        <textarea id={`post-excerpt-${suffix}`} name="excerpt" required minLength={10} maxLength={360} rows={2} defaultValue={post?.excerpt ?? ""} />
      </div>
      <div className="merchant-field merchant-field-wide">
        <label htmlFor={`post-body-${suffix}`}>ناوەڕۆک *</label>
        <textarea id={`post-body-${suffix}`} name="body" required minLength={20} maxLength={30000} rows={8} defaultValue={post?.body ?? ""} />
      </div>
      <div className="merchant-field merchant-field-wide">
        
        <input type="hidden" name="cover_image_url" value={coverUrl} />
        <label htmlFor={`post-cover-file-${suffix}`}>وێنەی پۆست (JPG، PNG، WEBP، AVIF تا ٥ MB)</label>
        <input ref={fileRef} id={`post-cover-file-${suffix}`} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e=>uploadCover(e.target.files?.[0])} />
        {uploading && <small>وێنە بار دەکرێت...</small>}
        {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
        {coverUrl && <div><img src={coverUrl} alt="پێشبینینی وێنەی پۆست" style={{maxWidth:220,maxHeight:150,objectFit:"contain"}}/><button type="button" onClick={()=>setCoverUrl("")}>لابردنی وێنە</button></div>}
      </div>
      {state.message && <p className={state.status === "success" ? "form-success merchant-field-wide" : "form-error merchant-field-wide"} role={state.status === "success" ? "status" : "alert"}>{state.message}</p>}
      <div className="merchant-field-wide">
        <button className="button" type="submit" disabled={pending}><Pencil size={16} /> {pending ? "پاشەکەوت دەکرێت..." : post ? "نوێکردنەوەی پۆست" : "پاشەکەوتکردنی ڕەشنووس"}</button>
      </div>
    </form>
  );
}

function formatDate(value: string | null) {
  if (!value) return "بڵاونەکراوەتەوە";
  return new Date(value).toLocaleString("ckb-IQ", { dateStyle: "medium", timeStyle: "short" });
}

export function PostsManager({
  posts, events, mode = "platform", storeId = null, storeName = null,
}: {
  posts: PostRecord[];
  events: PostAuditRecord[];
  mode?: "platform" | "merchant";
  storeId?: string | null;
  storeName?: string | null;
}) {
  return (
    <div className="posts-manager">
      <section className="dashboard-welcome">
        <span className="role-badge"><FileText size={15} /> {mode === "merchant" ? "پۆستی فرۆشگا" : "پۆستی پلاتفۆرم"}</span>
        <h2>{mode === "merchant" ? storeName ?? "فرۆشگای من" : "بڵاوکراوە و ئاگادارییەکانی شاخ"}</h2>
        <p>{mode === "merchant"
          ? "پۆستەکانت تەنها بە ناوی ئەم فرۆشگایە بڵاودەبنەوە؛ پۆستی فرۆشگا و پلاتفۆرم لە یەکتر جیاوازن."
          : "پۆستەکانی ئەم بەشە بە ناوی شاخ ستور بڵاودەبنەوە."}</p>
        <div className="dashboard-welcome-actions post-create-toolbar">
          <a href="#new-post-editor" className="button"><Plus size={18} /> دروستکردنی پۆستی نوێ</a>
        </div>
      </section>
      <section className="dashboard-panel">
        <h3>دروستکردنی پۆستی نوێ</h3>
        <PostEditor storeId={storeId} mode={mode} />
      </section>
      <section className="dashboard-panel">
        <h3>پۆستەکان ({posts.length})</h3>
        {posts.length === 0 ? (
          <div className="empty-state"><FileText size={28} /><strong>هێشتا پۆستێک دروست نەکراوە</strong><span className="muted">پۆستی یەکەم وەک ڕەشنووس پاشەکەوت بکە.</span></div>
        ) : (
          <div className="posts-list">
            {posts.map((post) => (
              <article className="post-admin-card" key={post.id}>
                <div className="post-admin-card-heading">
                  <div>
                    <span className="role-badge">{getPostStatusLabel(post.status)}</span>
                    {mode === "platform" && <small className="muted">{post.store_id ? "پۆستی دوکاندار" : "شاخ ستور"}</small>}
                    <h4>{post.title}</h4>
                    <p className="muted" dir="ltr">/posts/{post.slug}</p>
                  </div>
                  <time dateTime={post.updated_at}>{formatDate(post.published_at ?? post.updated_at)}</time>
                </div>
                <p>{post.excerpt}</p>
                <details>
                  <summary><Pencil size={15} /> دەستکاریکردنی ناوەڕۆک</summary>
                  <PostEditor post={post} storeId={storeId} mode={mode} />
                </details>
                <StatusForm post={post} />
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="dashboard-panel">
        <h3>مێژووی بڵاوکردنەوە</h3>
        {events.length === 0 ? <p className="muted">هێشتا هیچ کردارێکی پۆست تۆمار نەکراوە.</p> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>پۆست</th><th>کردار</th><th>گۆڕانی دۆخ</th><th>بەڕێوەبەر</th><th>کات</th></tr></thead>
              <tbody>{events.map((event) => (
                <tr key={event.id}>
                  <td>{event.title_snapshot}</td>
                  <td>{event.action}</td>
                  <td>{event.previous_status ? `${getPostStatusLabel(event.previous_status)} ← ${getPostStatusLabel(event.new_status)}` : getPostStatusLabel(event.new_status)}</td>
                  <td>{event.actor_role === "super_admin" ? "سوپەر ئەدمین" : event.actor_role === "admin" ? "بەڕێوەبەر" : event.actor_role === "restaurant" ? "دوکانداری چێشتخانە" : event.actor_role === "supermarket" ? "دوکانداری سوپەرمارکێت" : event.actor_role === "produce_vendor" ? "فرۆشیاری سەوزە و میوە" : event.actor_role === "meat_seafood_vendor" ? "فرۆشیاری گۆشت و سپیاتی" : "بەکارهێنەر"}</td>
                  <td>{formatDate(event.created_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
