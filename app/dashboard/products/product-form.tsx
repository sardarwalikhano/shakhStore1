"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CategoryOption = { id: string; name_ckb: string };

export function ProductCreateForm({ storeId, categories }: { storeId: string; categories: CategoryOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState("piece");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const priceValue = Number(price);
    const stockValue = stock.trim() ? Number(stock) : null;
    if (!categoryId) {
      setError("تکایە پۆلی بەرهەم دیاری بکە.");
      return;
    }
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
        category_id: categoryId,
        name: name.trim(),
        description: description.trim() || null,
        price_iqd: priceValue,
        stock_quantity: stockValue,
        unit,
      });
      if (insertError) throw insertError;
      setName("");
      setDescription("");
      setPrice("");
      setStock("");
      setCategoryId("");
      setUnit("piece");
      setSuccess("بەرهەمەکە وەک ڕەشنووس پاشەکەوت کرا؛ دوای پشکنینی بەڕێوەبەر بڵاو دەکرێتەوە.");
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
        <div className="merchant-field"><label htmlFor="product-name">ناوی بەرهەم *</label><input className="plain-field" id="product-name" required minLength={2} maxLength={180} value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="merchant-field">
          <label htmlFor="product-category">پۆلی بەرهەم *</label>
          <select id="product-category" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="" disabled>پۆلێک هەڵبژێرە</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name_ckb}</option>)}
          </select>
        </div>
        <div className="merchant-field"><label htmlFor="product-price">نرخ بە دینار *</label><input className="plain-field" id="product-price" type="number" min="1" step="1" required value={price} onChange={(event) => setPrice(event.target.value)} /></div>
        <div className="merchant-field"><label htmlFor="product-stock">بڕی کۆگا</label><input className="plain-field" id="product-stock" type="number" min="0" step="1" value={stock} onChange={(event) => setStock(event.target.value)} /></div>
        <div className="merchant-field">
          <label htmlFor="product-unit">یەکە</label>
          <select id="product-unit" value={unit} onChange={(event) => setUnit(event.target.value)}>
            <option value="piece">دانە</option><option value="kg">کیلۆگرام</option><option value="gram">گرام</option><option value="liter">لیتر</option><option value="pack">پاکەت</option>
          </select>
        </div>
        <div className="merchant-field merchant-field-wide"><label htmlFor="product-description">وەسف</label><textarea id="product-description" rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
        {error && <p className="form-error merchant-field-wide" role="alert">{error}</p>}
        {success && <p className="form-success merchant-field-wide" role="status">{success}</p>}
        <div className="merchant-field-wide"><button className="button" type="submit" disabled={busy}><PackagePlus size={17} /> {busy ? "پاشەکەوت دەکرێت..." : "زیادکردنی بەرهەم"}</button></div>
      </form>
      <p className="muted" style={{ fontSize: ".82rem", marginBottom: 0 }}>
        دوکاندار تەنها زانیاری بەرهەم دەنووسێت؛ دۆخی بڵاوکردنەوە لەلایەن بەڕێوەبەرەوە و بە مێژووی Audit دەگۆڕدرێت.
      </p>
    </section>
  );
}
