"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function ProductCreateForm({ storeId }: { storeId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState("piece");
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess("");
    const priceValue = Number(price);
    const stockValue = stock.trim() ? Number(stock) : null;
    if (!Number.isSafeInteger(priceValue) || priceValue <= 0) {
      setError("نرخ دەبێت ژمارەیەکی تەواوی زیاتر لە سفر بێت.");
      return;
    }
    if (stockValue !== null && (!Number.isSafeInteger(stockValue) || stockValue < 0)) {
      setError("بڕی کۆگا دەبێت ژمارەیەکی تەواوی سفر یان زیاتر بێت.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: insertError } = await supabase.from("products").insert({
        store_id: storeId,
        name: name.trim(),
        description: description.trim() || null,
        price_iqd: priceValue,
        stock_quantity: stockValue,
        unit,
        status: publish ? "published" : "draft",
        is_available: publish,
      });
      if (insertError) throw insertError;
      setName(""); setDescription(""); setPrice(""); setStock(""); setPublish(false);
      setSuccess(publish ? "بەرهەمەکە زیاد و بڵاوکرایەوە." : "بەرهەمەکە وەک Draft پاشەکەوت کرا.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "زیادکردنی بەرهەم سەرکەوتوو نەبوو.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="merchant-form-card" style={{ marginBlock: 22 }}>
      <h2>زیادکردنی بەرهەم</h2>
      <form onSubmit={submit} className="merchant-form">
        <div className="merchant-field"><label htmlFor="product-name">ناوی بەرهەم *</label><input className="plain-field" id="product-name" required minLength={2} maxLength={180} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="merchant-field"><label htmlFor="product-price">نرخ بە دینار *</label><input className="plain-field" id="product-price" type="number" min="1" step="1" required value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        <div className="merchant-field"><label htmlFor="product-stock">بڕی کۆگا</label><input className="plain-field" id="product-stock" type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} /></div>
        <div className="merchant-field"><label htmlFor="product-unit">یەکە</label><select id="product-unit" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="piece">دانە</option><option value="kg">کیلۆگرام</option><option value="gram">گرام</option><option value="liter">لیتر</option><option value="pack">پاکەت</option></select></div>
        <div className="merchant-field merchant-field-wide"><label htmlFor="product-description">وەسف</label><textarea id="product-description" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <label className="publish-check merchant-field-wide"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> بڵاوکردنەوەی بەرهەم دوای زیادکردن</label>
        {error && <p className="form-error merchant-field-wide" role="alert">{error}</p>}
        {success && <p className="form-success merchant-field-wide" role="status">{success}</p>}
        <div className="merchant-field-wide"><button className="button" type="submit" disabled={busy}><PackagePlus size={17} /> {busy ? "پاشەکەوت دەکرێت..." : "زیادکردنی بەرهەم"}</button></div>
      </form>
      <p className="muted" style={{ fontSize: ".82rem", marginBottom: 0 }}>نووسین لە خشتەی products بە policy ـی RLS دەکرێت؛ هیچ دەسەڵاتێکی تایبەت لە browser نیشان نادرێت.</p>
    </section>
  );
}