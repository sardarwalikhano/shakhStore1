"use client";

import { useActionState, useRef, useState } from "react";
import { Archive, FileText, Gift, ImagePlus, Pencil, Plus, RotateCcw, Send } from "lucide-react";
import { savePostAction, updatePostStatusAction, type PostActionState } from "@/app/dashboard/posts/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getPostStatusLabel, getPostStatusTargets, type PostStatus } from "@/lib/post-rules";

export type LinkedPostProduct = {
  id: string;
  name: string;
  price_iqd: number;
  unit: string;
  image_url: string | null;
  status: string;
};
export type PostRecord = {
  id: string; title: string; slug: string; excerpt: string; body: string;
  cover_image_url: string | null; status: PostStatus; published_at: string | null;
  store_id: string | null; product_id: string | null; category: string; updated_at: string;
  linked_product?: LinkedPostProduct | null;
  share_reward?: PostShareRewardCampaign | null;
};
export type OrderablePostProduct = LinkedPostProduct & {
  store_name: string;
};
export type ProductCategoryOption = { id: string; name_ckb: string };
export type PostShareRewardCampaign = {
  post_id: string;
  reward_amount_iqd: number;
  max_claims: number | null;
  reserved_amount_iqd: number;
  paid_amount_iqd: number;
  status: "configured" | "active" | "completed" | "closed";
};
export type PostAuditRecord = {
  id: string; post_id: string; title_snapshot: string; action: string;
  previous_status: string | null; new_status: string; actor_role: string; created_at: string;
};
const initialState: PostActionState = { status: "idle", message: "" };

const unitsByStore: Record<string, { value: string; label: string }[]> = {
  meat_seafood: [
    { value: "kg", label: "کیلۆگرام" }, { value: "g", label: "گرام" },
    { value: "piece", label: "دانە" }, { value: "pack", label: "پاکەت" },
  ],
  fruits_vegetables: [
    { value: "kg", label: "کیلۆگرام" }, { value: "g", label: "گرام" },
    { value: "piece", label: "دانە" }, { value: "pack", label: "پاکەت" },
  ],
  supermarket: [
    { value: "piece", label: "دانە" }, { value: "kg", label: "کیلۆگرام" },
    { value: "g", label: "گرام" }, { value: "liter", label: "لیتر" },
    { value: "ml", label: "ملی‌لیتر" }, { value: "pack", label: "پاکەت" },
    { value: "bottle", label: "بوتڵ" }, { value: "box", label: "کارتۆن" },
    { value: "dozen", label: "دەستە (١٢ دانە)" },
  ],
  restaurant: [
    { value: "piece", label: "دانە" }, { value: "kg", label: "کیلۆگرام" },
    { value: "g", label: "گرام" }, { value: "liter", label: "لیتر" },
    { value: "ml", label: "ملی‌لیتر" }, { value: "pack", label: "پاکەت" },
  ],
};

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
  post, storeId, storeCategory, mode, orderableProducts, productCategories,
}: {
  post?: PostRecord;
  storeId?: string | null;
  storeCategory?: string | null;
  mode: "platform" | "merchant";
  orderableProducts: OrderablePostProduct[];
  productCategories: ProductCategoryOption[];
}) {
  const [state, formAction, pending] = useActionState(savePostAction, initialState);
  const [coverUrl, setCoverUrl] = useState(post?.cover_image_url ?? "");
  const [productId, setProductId] = useState(
    post?.linked_product && post.linked_product.status !== "published" ? post.linked_product.id : post?.product_id ?? "",
  );
  const [shareRewardAmount, setShareRewardAmount] = useState(String(post?.share_reward?.reward_amount_iqd ?? 0));
  const [newProductName, setNewProductName] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductCategory, setNewProductCategory] = useState(productCategories[0]?.id ?? "");
  const [newProductUnit, setNewProductUnit] = useState(
    storeCategory === "meat_seafood" || storeCategory === "fruits_vegetables" ? "kg" : "piece",
  );
  const [newProductStock, setNewProductStock] = useState("");
  const [newProductImageUrl, setNewProductImageUrl] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingProduct, setUploadingProduct] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [productUploadError, setProductUploadError] = useState("");
  const coverFileRef = useRef<HTMLInputElement>(null);
  const productFileRef = useRef<HTMLInputElement>(null);
  const rewardLocked = Boolean(post && post.status !== "draft");
  const units = unitsByStore[storeCategory ?? "supermarket"] ?? unitsByStore.supermarket;
  const suffix = post?.id ?? "new";

  async function uploadImage(file: File | undefined, kind: "cover" | "product") {
    if (!file) return;
    const setError = kind === "cover" ? setUploadError : setProductUploadError;
    const setBusy = kind === "cover" ? setUploadingCover : setUploadingProduct;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("تەنها JPG، PNG، WEBP یان AVIF تا ٥ MB پەسەندە.");
      return;
    }
    if (kind === "product" && !storeId) {
      setError("فرۆشگای چالاک نەدۆزرایەوە بۆ بارکردنی وێنەی بەرهەم.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("پێویستە بچیتە ژوورەوە.");
      const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = kind === "cover"
        ? "post-covers/" + user.id + "/" + crypto.randomUUID() + "." + ext
        : storeId + "/" + user.id + "/" + crypto.randomUUID() + "." + ext;
      const { error } = await supabase.storage.from("product-images").upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) throw error;
      const publicUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      if (kind === "cover") setCoverUrl(publicUrl);
      else setNewProductImageUrl(publicUrl);
    } catch (error) {
      setError(error instanceof Error ? error.message : "بارکردنی وێنە سەرکەوتوو نەبوو.");
    } finally {
      setBusy(false);
    }
  }

  const selectedProduct = orderableProducts.find((product) => product.id === productId);
  const linkedProduct = post?.linked_product ?? null;
  const showNewProductForm = mode === "merchant" && Boolean(storeId) && !post?.product_id;

  return (
    <form id={!post ? "new-post-editor" : undefined} action={formAction} className="merchant-form post-editor-form">
      {post && <input type="hidden" name="post_id" value={post.id} />}
      {!post && storeId && <input type="hidden" name="store_id" value={storeId} />}
      <div className="merchant-field">
        <label htmlFor={"post-title-" + suffix}>ناونیشان *</label>
        <input className="plain-field" id={"post-title-" + suffix} name="title" required minLength={3} maxLength={180} defaultValue={post?.title ?? ""} />
      </div>
      <div className="merchant-field">
        <label htmlFor={"post-slug-" + suffix}>Slug *</label>
        <input className="plain-field" id={"post-slug-" + suffix} name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={180} defaultValue={post?.slug ?? ""} dir="ltr" />
      </div>
      <div className="merchant-field">
        <label htmlFor={"post-category-" + suffix}>کاتەگۆری *</label>
        <select id={"post-category-" + suffix} name="category" defaultValue={post?.category ?? "general"} required>
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
        <label htmlFor={"post-product-" + suffix}>بەرهەمی بڵاوکراوە بۆ داواکاری</label>
        <select className="plain-field" id={"post-product-" + suffix} name="product_id" value={productId} onChange={(event) => setProductId(event.target.value)}>
          <option value="">پۆستی ئاسایی — بەرهەمی پەیوەست نییە</option>
          {linkedProduct && linkedProduct.status !== "published" && (
            <option value={linkedProduct.id}>بەرهەمی ڕەشنووس: {linkedProduct.name} — چاوەڕێی پشکنین</option>
          )}
          {orderableProducts.map((product) => (
            <option value={product.id} key={product.id}>
              {product.name} — {product.price_iqd.toLocaleString("en-US")} دینار / {product.unit} · {product.store_name}
            </option>
          ))}
        </select>
        {selectedProduct && (
          <div className="post-linked-product-preview">
            {selectedProduct.image_url && <img src={selectedProduct.image_url} alt={selectedProduct.name} />}
            <div><strong>{selectedProduct.name}</strong><bdi>{selectedProduct.price_iqd.toLocaleString("en-US")} دینار / {selectedProduct.unit}</bdi></div>
          </div>
        )}
        {linkedProduct && linkedProduct.status !== "published" && (
          <div className="post-linked-product-preview">
            {linkedProduct.image_url && <img src={linkedProduct.image_url} alt={linkedProduct.name} />}
            <div><strong>{linkedProduct.name}</strong><bdi>{linkedProduct.price_iqd.toLocaleString("en-US")} دینار / {linkedProduct.unit}</bdi><small className="muted">ڕەشنووسە؛ دوای پەسەندکردنی بەڕێوەبەر دەتوانرێت داوا بکرێت.</small></div>
          </div>
        )}
        <small className="muted">بەرهەمێکی پێشتر بڵاوکراوە هەڵبژێرە، یان بەرهەمی نوێ لە خانەی خوارەوە لەگەڵ نرخ و وێنە دروست بکە.</small>
      </div>

      {showNewProductForm && (
        <section className="merchant-field merchant-field-wide post-inline-product-editor">
          <div className="post-share-reward-editor-heading">
            <span className="post-share-reward-icon"><ImagePlus size={21} /></span>
            <div><strong>بەرهەم، نرخ و وێنە بۆ ئەم پۆستە</strong><small className="muted">بەرهەمەکە لەگەڵ پۆستەکە پاشەکەوت دەکرێت و وەک ڕەشنووس بۆ پشکنینی بەڕێوەبەر دەنێردرێت. تا پەسەند نەکرێت، داواکاری و بڵاوکردنەوەی پۆست ڕێگەپێدراو نابێت.</small></div>
          </div>
          <div className="post-share-reward-fields">
            <label>ناوی بەرهەم *<input className="plain-field" name="new_product_name" value={newProductName} onChange={(event) => setNewProductName(event.target.value)} minLength={2} maxLength={160} /></label>
            <label>نرخی فرۆشتن بە دینار *<input className="plain-field" name="new_product_price_iqd" type="number" min="1" step="1" value={newProductPrice} onChange={(event) => setNewProductPrice(event.target.value)} /></label>
            <label>پۆلی بەرهەم *<select className="plain-field" name="new_product_category_id" value={newProductCategory} onChange={(event) => setNewProductCategory(event.target.value)}><option value="">پۆل هەڵبژێرە</option>{productCategories.map((category) => <option key={category.id} value={category.id}>{category.name_ckb}</option>)}</select></label>
            <label>یەکە *<select className="plain-field" name="new_product_unit" value={newProductUnit} onChange={(event) => setNewProductUnit(event.target.value)}>{units.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></label>
            <label>بڕی کۆگا (ئارەزوومەندانە)<input className="plain-field" name="new_product_stock_quantity" type="number" min="0" step={newProductUnit === "kg" || newProductUnit === "liter" ? "0.1" : "1"} value={newProductStock} onChange={(event) => setNewProductStock(event.target.value)} /></label>
          </div>
          <input type="hidden" name="new_product_image_url" value={newProductImageUrl} />
          <div className="post-product-image-upload">
            <label htmlFor={"post-product-image-" + suffix}>وێنەی بەرهەم * (JPG، PNG، WEBP، AVIF تا ٥ MB)</label>
            <input ref={productFileRef} id={"post-product-image-" + suffix} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => uploadImage(event.target.files?.[0], "product")} />
            {uploadingProduct && <small>وێنەی بەرهەم بار دەکرێت...</small>}
            {productUploadError && <p className="form-error" role="alert">{productUploadError}</p>}
            {newProductImageUrl && <div className="post-linked-product-preview"><img src={newProductImageUrl} alt="پێشبینینی وێنەی بەرهەم" /><strong>وێنەی بەرهەم ئامادەیە</strong><button type="button" className="button button-secondary" onClick={() => { setNewProductImageUrl(""); if (productFileRef.current) productFileRef.current.value = ""; }}>گۆڕینی وێنە</button></div>}
          </div>
          {productCategories.length === 0 && <p className="form-error">هیچ پۆلێکی بەرهەمی چالاک نییە؛ سوپەر ئەدمین دەبێت پۆلێک چالاک بکات.</p>}
        </section>
      )}

      {mode === "merchant" && (
        <section className="merchant-field merchant-field-wide post-share-reward-editor">
          <div className="post-share-reward-editor-heading">
            <span className="post-share-reward-icon"><Gift size={21} /></span>
            <div>
              <strong>خەڵات بۆ هەر کڕینی تەواوبوو</strong>
              <small className="muted">کڕیار لینکی تایبەتی خۆی دروست دەکات. کاتێک داواکارییەک لەو لینکەوە تەواو بگات، ئەم بڕە لە جزدانی پێشەکی خاوەنی پۆست کەم و بۆ جزدانی خاوەن لینک زیاد دەکرێت.</small>
            </div>
          </div>
          <label htmlFor={"share-reward-amount-" + suffix}>
            خەڵات بۆ هەر داواکارییەکی گەیەنراو (دینار)
            <input className="plain-field" id={"share-reward-amount-" + suffix} name="share_reward_amount_iqd" type="number" min="0" max="10000000" step="1" value={shareRewardAmount} readOnly={rewardLocked} onChange={(event) => setShareRewardAmount(event.target.value)} />
          </label>
          <div className="post-share-reward-budget">
            {Number(shareRewardAmount) > 0 ? (
              <><strong>{Number(shareRewardAmount).toLocaleString("en-US")} دینار بۆ هەر کڕینێک</strong><small className="muted">سنووری ژمارەی کڕین نییە؛ هیچ بڕێک لە کاتی بڵاوکردنەوە بلۆک ناکرێت.</small></>
            ) : <span className="muted">بۆ ئەم پۆستە خەڵات دانەنراوە.</span>}
          </div>
          {post?.share_reward && <small className="muted">کۆی خەڵاتی گوازراوەتەوە: {post.share_reward.paid_amount_iqd.toLocaleString("en-US")} دینار. دۆخ: {post.share_reward.status === "active" ? "چالاک" : post.share_reward.status === "configured" ? "چاوەڕێی بڵاوکردنەوە" : "داخراو"}.</small>}
          {rewardLocked && <small className="muted">بڕی خەڵات دوای بڵاوکردنەوە ناگۆڕدرێت.</small>}
        </section>
      )}

      <div className="merchant-field merchant-field-wide">
        <label htmlFor={"post-excerpt-" + suffix}>پوختە *</label>
        <textarea id={"post-excerpt-" + suffix} name="excerpt" required minLength={10} maxLength={360} rows={2} defaultValue={post?.excerpt ?? ""} />
      </div>
      <div className="merchant-field merchant-field-wide">
        <label htmlFor={"post-body-" + suffix}>ناوەڕۆک *</label>
        <textarea id={"post-body-" + suffix} name="body" required minLength={20} maxLength={30000} rows={8} defaultValue={post?.body ?? ""} />
      </div>
      <div className="merchant-field merchant-field-wide">
        <input type="hidden" name="cover_image_url" value={coverUrl} />
        <label htmlFor={"post-cover-file-" + suffix}>وێنەی سەرەکی پۆست (JPG، PNG، WEBP، AVIF تا ٥ MB)</label>
        <input ref={coverFileRef} id={"post-cover-file-" + suffix} type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => uploadImage(event.target.files?.[0], "cover")} />
        {uploadingCover && <small>وێنەی پۆست بار دەکرێت...</small>}
        {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
        {coverUrl && <div className="post-linked-product-preview"><img src={coverUrl} alt="پێشبینینی وێنەی پۆست" /><button type="button" className="button button-secondary" onClick={() => { setCoverUrl(""); if (coverFileRef.current) coverFileRef.current.value = ""; }}>لابردنی وێنە</button></div>}
      </div>
      {state.message && <p className={state.status === "success" ? "form-success merchant-field-wide" : "form-error merchant-field-wide"} role={state.status === "success" ? "status" : "alert"}>{state.message}</p>}
      <div className="merchant-field-wide">
        <button className="button" type="submit" disabled={pending || uploadingCover || uploadingProduct}>
          <Pencil size={16} /> {pending ? "پاشەکەوت دەکرێت..." : post ? "نوێکردنەوەی پۆست" : "پاشەکەوتکردنی ڕەشنووس"}
        </button>
      </div>
    </form>
  );
}

function formatDate(value: string | null) {
  if (!value) return "بڵاونەکراوەتەوە";
  return new Date(value).toLocaleString("ckb-IQ", { dateStyle: "medium", timeStyle: "short" });
}

export function PostsManager({
  posts, events, mode = "platform", storeId = null, storeName = null, storeCategory = null,
  orderableProducts, productCategories,
}: {
  posts: PostRecord[];
  events: PostAuditRecord[];
  mode?: "platform" | "merchant";
  storeId?: string | null;
  storeName?: string | null;
  storeCategory?: string | null;
  orderableProducts: OrderablePostProduct[];
  productCategories: ProductCategoryOption[];
}) {
  return (
    <div className="posts-manager">
      <section className="dashboard-welcome">
        <span className="role-badge"><FileText size={15} /> {mode === "merchant" ? "پۆستی فرۆشگا" : "پۆستی پلاتفۆرم"}</span>
        <h2>{mode === "merchant" ? storeName ?? "فرۆشگای من" : "بڵاوکراوە و ئاگادارییەکانی شاخ"}</h2>
        <p>{mode === "merchant"
          ? "پۆستەکانت تەنها بە ناوی ئەم فرۆشگایە بڵاودەبنەوە؛ نرخ و وێنەی بەرهەم لە هەمان فۆڕم زیاد بکە."
          : "پۆستەکانی ئەم بەشە بە ناوی شاخ ستور بڵاودەبنەوە."}</p>
        <div className="dashboard-welcome-actions post-create-toolbar">
          <a href="#new-post-editor" className="button"><Plus size={18} /> دروستکردنی پۆستی نوێ</a>
        </div>
      </section>
      <section className="dashboard-panel">
        <h3>دروستکردنی پۆستی نوێ</h3>
        <PostEditor storeId={storeId} storeCategory={storeCategory} mode={mode} orderableProducts={orderableProducts} productCategories={productCategories} />
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
                {post.status === "draft" && <p className="post-draft-visibility-note">ئەم پۆستە هێشتا ڕەشنووسە؛ دوای پەسەندکردنی بەرهەم دەتوانرێت بڵاوبکرێتەوە.</p>}
                {post.linked_product && (
                  <div className="post-linked-product-preview">
                    {post.linked_product.image_url && <img src={post.linked_product.image_url} alt={post.linked_product.name} loading="lazy" />}
                    <div><strong>{post.linked_product.name}</strong><bdi>{post.linked_product.price_iqd.toLocaleString("en-US")} دینار / {post.linked_product.unit}</bdi><small className="muted">{post.linked_product.status === "published" ? "بڵاوکراوە" : "ڕەشنووس ـ چاوەڕێی پشکنین"}</small></div>
                  </div>
                )}
                {post.share_reward && <p className="muted">خەڵات: {post.share_reward.reward_amount_iqd.toLocaleString("en-US")} دینار بۆ هەر کڕینی گەیەنراو · {post.share_reward.status === "configured" ? "چاوەڕێی بڵاوکردنەوە" : post.share_reward.status === "active" ? "چالاک" : "داخراو"}</p>}
                <details>
                  <summary><Pencil size={15} /> دەستکاریکردنی ناوەڕۆک</summary>
                  <PostEditor post={post} storeId={storeId} storeCategory={storeCategory} mode={mode} orderableProducts={orderableProducts} productCategories={productCategories} />
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
                  <td>{event.title_snapshot}</td><td>{event.action}</td>
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
