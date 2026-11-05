"use client";

import { useActionState, useRef, useState } from "react";
import { Archive, FileText, Gift, Pencil, Plus, RotateCcw, Send } from "lucide-react";
import { savePostAction, updatePostStatusAction, type PostActionState } from "@/app/dashboard/posts/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getPostStatusLabel, getPostStatusTargets, type PostStatus } from "@/lib/post-rules";

export type PostRecord = {
  id: string; title: string; slug: string; excerpt: string; body: string;
  cover_image_url: string | null; status: PostStatus; published_at: string | null;
  store_id: string | null; product_id: string | null; category: string; updated_at: string;
  share_reward?: PostShareRewardCampaign | null;
};
export type OrderablePostProduct = {
  id: string;
  name: string;
  store_name: string;
  price_iqd: number;
  unit: string;
};
export type PostShareRewardCampaign = {
  post_id: string;
  reward_amount_iqd: number;
  max_claims: number;
  reserved_amount_iqd: number;
  paid_amount_iqd: number;
  status: "configured" | "active" | "completed" | "closed";
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

function PostEditor({
  post, storeId, mode, orderableProducts, merchantWalletBalanceIqd,
}: {
  post?: PostRecord;
  storeId?: string | null;
  mode: "platform" | "merchant";
  orderableProducts: OrderablePostProduct[];
  merchantWalletBalanceIqd: number | null;
}) {
  const [state, formAction, pending] = useActionState(savePostAction, initialState);
  const [coverUrl, setCoverUrl] = useState(post?.cover_image_url ?? "");
  const [productId, setProductId] = useState(post?.product_id ?? "");
  const [shareRewardAmount, setShareRewardAmount] = useState(
    String(post?.share_reward?.reward_amount_iqd ?? 0),
  );
  const [shareRewardMaxClaims, setShareRewardMaxClaims] = useState(
    String(post?.share_reward?.max_claims ?? 10),
  );
  const rewardLocked = Boolean(post && (
    post.status !== "draft"
    || (post.share_reward && post.share_reward.status !== "configured")
  ));
  const rewardBudget = Math.max(0, Number(shareRewardAmount) || 0)
    * Math.max(0, Number(shareRewardMaxClaims) || 0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  async function uploadCover(file?: File) {
    if (!file) return;
    setUploadError("");
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setUploadError("JPG، PNG، WEBP یان AVIF تا ٥ MB هەڵبژێرە.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("پێویستە بچیتە ژوورەوە.");
      const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `post-covers/${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
      if (error) throw error;
      setCoverUrl(supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "بارکردنی وێنە سەرکەوتوو نەبوو.");
    } finally {
      setUploading(false);
    }
  }
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
      <div className="merchant-field">
        <label htmlFor={`post-category-${suffix}`}>کاتەگۆری *</label>
        <select id={`post-category-${suffix}`} name="category" defaultValue={post?.category ?? "general"} required>
          <option value="general">گشتی</option>
          <option value="offers">ئۆفەر و داشکاندن</option>
          <option value="products">بەرهەمەکان</option>
          <option value="news">هەواڵ</option>
          <option value="announcements">ڕاگەیاندن</option>
          <option value="food">خواردن</option>
          <option value="meat">گۆشت</option>
          <option value="produce">سەوزە و میوە</option>
          <option value="supermarket">سوپەرمارکێت</option>
        </select>
      </div>
      <div className="merchant-field merchant-field-wide">
        <label htmlFor={`post-product-${suffix}`}>بەرهەمی پەیوەست بۆ داواکاری (ئارەزوومەندانە)</label>
        <select
          className="plain-field"
          id={`post-product-${suffix}`}
          value={productId}
          onChange={(event) => setProductId(event.target.value)}
        >
          <option value="">پۆستی ئاسایی — داواکاری نییە</option>
          {orderableProducts.map((product) => (
            <option value={product.id} key={product.id}>
              {product.name} — {product.price_iqd.toLocaleString("en-US")} دینار / {product.unit} · {product.store_name}
            </option>
          ))}
        </select>
        <small className="muted">تەنها بەرهەمی بڵاوکراوە و بەردەست هەڵبژێرە. بۆ پۆستی فرۆشگا، بەرهەمەکە دەبێت سەر بە هەمان فرۆشگا بێت.</small>
        {orderableProducts.length === 0 && (
          <small className="muted">هێشتا هیچ بەرهەمێکی بڵاوکراوە و داواکاری‌پەذیر نییە؛ سەرەتا بەرهەمێک زیاد بکە و لەلایەن بەڕێوەبەرەوە بڵاوی بکەرەوە.</small>
        )}
      </div>
      {mode === "merchant" && (
        <section className="merchant-field merchant-field-wide post-share-reward-editor">
          <div className="post-share-reward-editor-heading">
            <span className="post-share-reward-icon"><Gift size={21} /></span>
            <div>
              <strong>خەڵات بۆ هاوبەشکردنی پۆست</strong>
              <small className="muted">کڕیار پۆستەکە هاوبەش دەکات و بەڵگە دەنێرێت؛ سوپەر ئەدمین دوای پشکنین پاداشتەکە دەگوازێتەوە بۆ جزدانی کڕیار.</small>
            </div>
          </div>
          <input type="hidden" name="share_reward_amount_iqd" value={shareRewardAmount} />
          <input type="hidden" name="share_reward_max_claims" value={shareRewardMaxClaims} />
          <div className="post-share-reward-fields">
            <label htmlFor={`share-reward-amount-${suffix}`}>
              پاداشت بۆ هەر هاوبەشکردن (دینار)
              <input
                className="plain-field"
                id={`share-reward-amount-${suffix}`}
                type="number"
                min="0"
                max="10000000"
                step="1"
                value={shareRewardAmount}
                readOnly={rewardLocked}
                onChange={(event) => setShareRewardAmount(event.target.value)}
              />
            </label>
            <label htmlFor={`share-reward-max-${suffix}`}>
              زۆرترین ژمارەی پاداشت
              <input
                className="plain-field"
                id={`share-reward-max-${suffix}`}
                type="number"
                min="1"
                max="1000"
                step="1"
                value={shareRewardMaxClaims}
                readOnly={rewardLocked || Number(shareRewardAmount) <= 0}
                onChange={(event) => setShareRewardMaxClaims(event.target.value)}
              />
            </label>
          </div>
          <div className="post-share-reward-budget">
            {Number(shareRewardAmount) > 0 ? (
              <>
                <span>بودجەی پێویست پێش بڵاوکردنەوە</span>
                <strong>{rewardBudget.toLocaleString("en-US")} دینار</strong>
                <small className="muted">
                  {Number(shareRewardAmount).toLocaleString("en-US")} × {Number(shareRewardMaxClaims).toLocaleString("en-US")} کڕیار
                </small>
              </>
            ) : (
              <span className="muted">بۆ ئەم پۆستە پاداشت دانەنراوە.</span>
            )}
          </div>
          {merchantWalletBalanceIqd !== null && Number(shareRewardAmount) > 0 && (
            <small className={merchantWalletBalanceIqd >= rewardBudget ? "form-success" : "form-error"}>
              باڵانسی جزدانی پێشەکی: {merchantWalletBalanceIqd.toLocaleString("en-US")} دینار
              {merchantWalletBalanceIqd < rewardBudget ? " · باڵانسی جزدان بەشی بودجەکە ناکات." : " · باڵانسی پێویست هەیە."}
            </small>
          )}
          {post?.share_reward && post.share_reward.status !== "configured" && (
            <small className="muted">
              دۆخی بودجە: {post.share_reward.status === "active" ? "پارەکە پارێزراوە و پۆستەکە چالاکە" : post.share_reward.status === "completed" ? "هەموو پاداشتەکان دراون" : "پاداشت داخراوە"}.
              بودجەی پارێزراو: {post.share_reward.reserved_amount_iqd.toLocaleString("en-US")} دینار؛ دراو: {post.share_reward.paid_amount_iqd.toLocaleString("en-US")} دینار.
            </small>
          )}
          {rewardLocked && <small className="muted">دوای پاراستنی بودجە و بڵاوکردنەوە، بڕی پاداشت و ژمارەی سوودمەندان ناگۆڕدرێت.</small>}
          {!post && <small className="muted">بودجەکە کاتێک پۆستەکە بڵاو دەکرێتەوە لە جزدانی فرۆشگا دەگوازرێتەوە بۆ هەژماری پارێزراوی شاخ ستور؛ ئەگەر باڵانس بەشی نەکات، بڵاوکردنەوە ڕەت دەکرێتەوە.</small>}
        </section>
      )}
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
        <input type="hidden" name="product_id" value={productId} />
        <label htmlFor={`post-cover-file-${suffix}`}>وێنەی پۆست (JPG، PNG، WEBP، AVIF تا ٥ MB)</label>
        <input ref={fileRef} id={`post-cover-file-${suffix}`} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={e=>uploadCover(e.target.files?.[0])} />
        {uploading && <small>وێنە بار دەکرێت...</small>}
        {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
        {coverUrl && <div><img src={coverUrl} alt="پێشبینینی وێنەی پۆست" style={{maxWidth:220,maxHeight:150,objectFit:"contain"}}/><button type="button" onClick={()=>setCoverUrl("")}>لابردنی وێنە</button></div>}
      </div>
      {state.message && <p className={state.status === "success" ? "form-success merchant-field-wide" : "form-error merchant-field-wide"} role={state.status === "success" ? "status" : "alert"}>{state.message}</p>}
      <div className="merchant-field-wide">
        <button className="button" type="submit" disabled={pending || uploading}><Pencil size={16} /> {pending ? "پاشەکەوت دەکرێت..." : post ? "نوێکردنەوەی پۆست" : "پاشەکەوتکردنی ڕەشنووس"}</button>
      </div>
    </form>
  );
}

function formatDate(value: string | null) {
  if (!value) return "بڵاونەکراوەتەوە";
  return new Date(value).toLocaleString("ckb-IQ", { dateStyle: "medium", timeStyle: "short" });
}

export function PostsManager({
  posts, events, mode = "platform", storeId = null, storeName = null, orderableProducts, merchantWalletBalanceIqd = null,
}: {
  posts: PostRecord[];
  events: PostAuditRecord[];
  mode?: "platform" | "merchant";
  storeId?: string | null;
  storeName?: string | null;
  orderableProducts: OrderablePostProduct[];
  merchantWalletBalanceIqd?: number | null;
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
        <PostEditor storeId={storeId} mode={mode} orderableProducts={orderableProducts} merchantWalletBalanceIqd={merchantWalletBalanceIqd} />
      </section>
      <section className="dashboard-panel">
        <h3>پۆستەکان ({posts.length})</h3>
        {posts.length === 0 ? (
          <div className="empty-state"><FileText size={28} /><strong>هێشتا پۆستێک دروست نەکراوە</strong><span className="muted">پۆستی یەکەم وەک ڕەشنووس پاشەکەوت بکە.</span></div>
        ) : (
          <div className="posts-list">
            {posts.map((post) => (
              <article className="post-admin-card" key={post.id}>
                {post.cover_image_url && <img src={post.cover_image_url} alt={post.title} className="post-admin-card-cover" loading="lazy" />}
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
                {post.status === "draft" && (
                  <p className="post-draft-visibility-note">
                    ئەم پۆستە هێشتا ڕەشنووسە؛ وێنەکە دوای بڵاوکردنەوە لە پەڕە گشتییەکاندا دەردەکەوێت.
                  </p>
                )}
                {post.product_id && (
                  <p className="muted">
                    بەرهەمی پەیوەست بۆ داواکاری: {orderableProducts.find((product) => product.id === post.product_id)?.name ?? "بەرهەمەکە لەوانەیە چیتر بەردەست نەبێت"}
                  </p>
                )}
                {post.share_reward && (
                  <p className="muted">
                    پاداشتی هاوبەشکردن: {post.share_reward.reward_amount_iqd.toLocaleString("en-US")} دینار × {post.share_reward.max_claims.toLocaleString("en-US")} کەس ·
                    {post.share_reward.status === "configured" ? " چاوەڕێی بڵاوکردنەوە" : post.share_reward.status === "active" ? " چالاک" : post.share_reward.status === "completed" ? " تەواو" : " داخراو"}
                  </p>
                )}
                <details>
                  <summary><Pencil size={15} /> دەستکاریکردنی ناوەڕۆک</summary>
                  <PostEditor post={post} storeId={storeId} mode={mode} orderableProducts={orderableProducts} merchantWalletBalanceIqd={merchantWalletBalanceIqd} />
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
