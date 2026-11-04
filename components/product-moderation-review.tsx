"use client";

import { useActionState } from "react";
import { CheckCircle2, Clock3, PackageSearch, ShieldCheck } from "lucide-react";
import { moderateProductStatusAction, type ProductModerationActionState } from "@/app/dashboard/product-moderation/actions";
import { getProductModerationTargets, getProductStatusLabel, type ProductStatus } from "@/lib/product-moderation";

export type ProductModerationItem = {
  id: string; name: string; storeName: string; isPlatformStore: boolean;
  categoryName: string | null; priceIqd: number; stockQuantity: number | null;
  unit: string; status: ProductStatus; isAvailable: boolean; updatedAt: string;
};
export type ProductModerationAuditItem = {
  id: string; productName: string; storeName: string; actorRole: string;
  previousStatus: string; newStatus: string; reason: string; createdAt: string;
};

const initialState: ProductModerationActionState = { status: "idle", message: "" };
function roleLabel(role: string): string { return role === "super_admin" ? "سوپەر ئەدمین" : "بەڕێوەبەر"; }
function formatDate(value: string): string {
  return new Date(value).toLocaleString("ckb-IQ", { dateStyle: "medium", timeStyle: "short" });
}

function ProductReviewForm({ product }: { product: ProductModerationItem }) {
  const [state, formAction, pending] = useActionState(moderateProductStatusAction, initialState);
  const targets = getProductModerationTargets(product.status);
  if (!targets.length) return null;

  return (
    <form action={formAction} className="merchant-form" style={{ marginTop: 16 }}>
      <input type="hidden" name="product_id" value={product.id} />
      <input type="hidden" name="expected_updated_at" value={product.updatedAt} />
      <div className="merchant-field">
        <label htmlFor={`moderation-status-${product.id}`}>دۆخی نوێ</label>
        <select id={`moderation-status-${product.id}`} name="new_status" defaultValue={targets[0]} required>
          {targets.map((status) => <option key={status} value={status}>{getProductStatusLabel(status)}</option>)}
        </select>
      </div>
      <div className="merchant-field merchant-field-wide">
        <label htmlFor={`moderation-reason-${product.id}`}>هۆکاری بڕیار *</label>
        <textarea id={`moderation-reason-${product.id}`} name="reason" minLength={2} maxLength={1200} rows={2} required placeholder="هۆکاری بڕیار بنووسە." />
      </div>
      {state.message && <p className={state.status === "success" ? "form-success merchant-field-wide" : "form-error merchant-field-wide"} role={state.status === "success" ? "status" : "alert"}>{state.message}</p>}
      <div className="merchant-field-wide">
        <button className="button" type="submit" disabled={pending}><ShieldCheck size={17} /> {pending ? "بڕیار تۆمار دەکرێت..." : "تۆمارکردنی بڕیار"}</button>
      </div>
    </form>
  );
}

export function ProductModerationReview({ products, events }: { products: ProductModerationItem[]; events: ProductModerationAuditItem[] }) {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="dashboard-welcome">
        <span className="role-badge"><ShieldCheck size={15} /> پشکنینی بەڕێوەبەر</span>
        <h2>بڵاوکردنەوەی بەرهەم</h2>
        <p>هەر بڕیارێک بە هۆکار و کاتی بڕیار لە تۆماری چاودێریدا دەمێنێتەوە.</p>
      </section>
      <section className="dashboard-panel">
        <h3><PackageSearch size={19} /> لیستی بەرهەمەکان ({products.length})</h3>
        {products.length === 0 ? (
          <div className="empty-state"><PackageSearch size={27} /><strong>هیچ بەرهەمێک بۆ پشکنین نییە</strong></div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {products.map((product) => (
              <article key={product.id} className="merchant-form-card" style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "start" }}>
                  <div>
                    <strong>{product.name}</strong>
                    <p className="muted" style={{ margin: "6px 0" }}>{product.storeName}{product.isPlatformStore ? " · فرۆشگای پلاتفۆرم" : ""}</p>
                    <small className="muted">{product.categoryName ?? "پۆل دیاری نەکراوە"} · {product.priceIqd.toLocaleString("en-US")} دینار · {product.stockQuantity ?? "—"} {product.unit}</small>
                  </div>
                  <span className="role-badge">{getProductStatusLabel(product.status)}</span>
                </div>
                <p className="muted" style={{ margin: "10px 0 0", fontSize: ".84rem" }}>
                  بەردەست: {product.isAvailable ? "بەڵێ" : "نەخێر"} · نوێکراوەتەوە: {formatDate(product.updatedAt)}
                </p>
                <ProductReviewForm product={product} />
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="dashboard-panel">
        <h3><Clock3 size={19} /> تۆماری بڕیارەکان</h3>
        {events.length === 0 ? (
          <div className="empty-state"><CheckCircle2 size={25} /><strong>هێشتا هیچ بڕیارێکی پشکنین تۆمار نەکراوە</strong></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>بەرهەم / فرۆشگا</th><th>گۆڕانکاری</th><th>بڕیاردەر</th><th>هۆکار</th><th>کات</th></tr></thead>
              <tbody>{events.map((event) => (
                <tr key={event.id}>
                  <td>{event.productName}<br /><small className="muted">{event.storeName}</small></td>
                  <td>{getProductStatusLabel(event.previousStatus)} ← {getProductStatusLabel(event.newStatus)}</td>
                  <td>{roleLabel(event.actorRole)}</td><td>{event.reason}</td>
                  <td><time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
