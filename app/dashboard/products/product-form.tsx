"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, PackagePlus, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getDefaultOrderRules, getUnitLabelCkb } from "@/lib/marketplace-rules";

type CategoryOption = { id: string; name_ckb: string };
type UnitOption = { value: string; label: string };

const unitOptionsByStore: Record<string, UnitOption[]> = {
  meat_seafood: [
    { value: "kg", label: "کیلۆگرام" },
    { value: "g", label: "گرام" },
    { value: "piece", label: "دانە" },
    { value: "pack", label: "پاکەت" },
  ],
  fruits_vegetables: [
    { value: "kg", label: "کیلۆگرام" },
    { value: "g", label: "گرام" },
    { value: "piece", label: "دانە" },
    { value: "pack", label: "پاکەت" },
  ],
  supermarket: [
    { value: "piece", label: "دانە" },
    { value: "kg", label: "کیلۆگرام" },
    { value: "g", label: "گرام" },
    { value: "liter", label: "لیتر" },
    { value: "ml", label: "ملی‌لیتر" },
    { value: "pack", label: "پاکەت" },
    { value: "bottle", label: "بوتڵ" },
    { value: "box", label: "کارتۆن" },
    { value: "dozen", label: "دەستە (١٢ دانە)" },
  ],
  restaurant: [
    { value: "piece", label: "دانە" },
    { value: "kg", label: "کیلۆگرام" },
    { value: "g", label: "گرام" },
    { value: "liter", label: "لیتر" },
    { value: "ml", label: "ملی‌لیتر" },
    { value: "pack", label: "پاکەت" },
  ],
};

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
const maxImageBytes = 5 * 1024 * 1024;

export function ProductCreateForm({
  storeId,
  storeCategory,
  categories,
}: {
  storeId: string;
  storeCategory: string;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const unitOptions = unitOptionsByStore[storeCategory] ?? unitOptionsByStore.supermarket;
  const initialUnit = storeCategory === "meat_seafood" || storeCategory === "fruits_vegetables"
    ? "kg"
    : storeCategory === "supermarket" ? "piece" : "piece";
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState(initialUnit);
  const [minOrder, setMinOrder] = useState(String(getDefaultOrderRules(initialUnit).minOrderQuantity));
  const [maxOrder, setMaxOrder] = useState("");
  const [quantityStep, setQuantityStep] = useState(String(getDefaultOrderRules(initialUnit).quantityStep));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imagePreviewUrlRef = useRef<string | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => () => {
    if (imagePreviewUrlRef.current) URL.revokeObjectURL(imagePreviewUrlRef.current);
  }, []);

  function changeUnit(nextUnit: string) {
    setUnit(nextUnit);
    const defaults = getDefaultOrderRules(nextUnit);
    setMinOrder(String(defaults.minOrderQuantity));
    setMaxOrder("");
    setQuantityStep(String(defaults.quantityStep));
    setStock("");
  }

  function clearSelectedImage() {
    if (imagePreviewUrlRef.current) URL.revokeObjectURL(imagePreviewUrlRef.current);
    imagePreviewUrlRef.current = null;
    setImagePreview("");
    setImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      clearSelectedImage();
      return;
    }
    if (!imageExtensions[selected.type]) {
      clearSelectedImage();
      setError("تەنها وێنەی JPG، PNG، WEBP یان AVIF پەسەند دەکرێت.");
      return;
    }
    if (selected.size > maxImageBytes) {
      setImageFile(null);
      event.target.value = "";
      setError("قەبارەی وێنە نابێت لە ٥ مێگابایت زیاتر بێت.");
      return;
    }
    if (imagePreviewUrlRef.current) URL.revokeObjectURL(imagePreviewUrlRef.current);
    const previewUrl = URL.createObjectURL(selected);
    imagePreviewUrlRef.current = previewUrl;
    setImagePreview(previewUrl);
    setImageFile(selected);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const priceValue = Number(price);
    const compareValue = compareAtPrice.trim() ? Number(compareAtPrice) : null;
    const stockValue = stock.trim() ? Number(stock) : null;
    const minValue = Number(minOrder);
    const maxValue = maxOrder.trim() ? Number(maxOrder) : null;
    const stepValue = Number(quantityStep);
    const discreteUnit = !["kg", "liter"].includes(unit);

    if (!categoryId) {
      setError("تکایە پۆلی بەرهەم دیاری بکە.");
      return;
    }
    if (!imageFile) {
      setError("وێنەی بەرهەم هەڵبژێرە.");
      return;
    }
    if (!Number.isSafeInteger(priceValue) || priceValue <= 0) {
      setError("نرخی فرۆشتن دەبێت ژمارەیەکی تەواوی زیاتر لە سفر بێت.");
      return;
    }
    if (compareValue !== null && (!Number.isSafeInteger(compareValue) || compareValue <= priceValue)) {
      setError("نرخی پێشوو دەبێت لە نرخی ئێستا زیاتر بێت.");
      return;
    }
    if (stockValue !== null && (!Number.isFinite(stockValue) || stockValue < 0 || (discreteUnit && !Number.isSafeInteger(stockValue)))) {
      setError(discreteUnit ? "بڕی کۆگا بۆ دانە و پاکەت دەبێت ژمارەی تەواو بێت." : "بڕی کۆگا دەبێت سفر یان زیاتر بێت.");
      return;
    }
    if (!Number.isFinite(minValue) || minValue <= 0 || !Number.isFinite(stepValue) || stepValue <= 0) {
      setError("کەمترین بڕ و هەنگاوی زیادکردن دەبێت لە سفر زیاتر بن.");
      return;
    }
    if (maxValue !== null && (!Number.isFinite(maxValue) || maxValue < minValue)) {
      setError("زۆرترین بڕ دەبێت یەکسان یان لە کەمترین بڕ زیاتر بێت.");
      return;
    }
    if (discreteUnit && (!Number.isInteger(minValue) || !Number.isInteger(stepValue) || (maxValue !== null && !Number.isInteger(maxValue)))) {
      setError("بۆ دانە، پاکەت، بوتڵ و گرام/مل بڕەکان دەبێت ژمارەی تەواو بن.");
      return;
    }

    setBusy(true);
    let uploadedPath: string | null = null;
    const supabase = createSupabaseBrowserClient();
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("پێویستە دووبارە بچیتە ژوورەوە.");

      const extension = imageExtensions[imageFile.type];
      uploadedPath = storeId + "/" + user.id + "/" + window.crypto.randomUUID() + "." + extension;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(uploadedPath, imageFile, {
          contentType: imageFile.type,
          cacheControl: "31536000",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage.from("product-images").getPublicUrl(uploadedPath);
      const { error: insertError } = await supabase.from("products").insert({
        store_id: storeId,
        category_id: categoryId,
        name: name.trim(),
        description: description.trim() || null,
        price_iqd: priceValue,
        compare_at_price_iqd: compareValue,
        stock_quantity: stockValue,
        unit,
        image_url: publicUrl.publicUrl,
        min_order_quantity: minValue,
        max_order_quantity: maxValue,
        quantity_step: stepValue,
      });
      if (insertError) throw insertError;

      setName("");
      setDescription("");
      setPrice("");
      setCompareAtPrice("");
      setStock("");
      setCategoryId("");
      clearSelectedImage();
      changeUnit(initialUnit);
      setSuccess("بەرهەم و وێنەکە بە سەرکەوتوویی پاشەکەوت کران؛ بەرهەمەکە وەک ڕەشنووس چاوەڕێی پشکنینی بەڕێوەبەر دەکات.");
      router.refresh();
    } catch (caught) {
      if (uploadedPath) {
        await supabase.storage.from("product-images").remove([uploadedPath]);
      }
      setError(caught instanceof Error ? caught.message : "پاشەکەوتکردنی بەرهەم سەرکەوتوو نەبوو.");
    } finally {
      setBusy(false);
    }
  }

  const unitLabel = getUnitLabelCkb(unit);
  return (
    <section className="merchant-form-card product-create-card" style={{ marginBlock: 22 }}>
      <div className="product-form-heading">
        <div><h2>زیادکردنی بەرهەم</h2><p>وێنە، نرخ، یەکە و سنووری داواکاری پڕ بکەرەوە.</p></div>
        <span className="role-badge">ڕەشنووس</span>
      </div>
      <form onSubmit={submit} className="merchant-form product-create-form">
        <div className="merchant-field merchant-field-wide">
          <label htmlFor="product-image">وێنەی بەرهەم *</label>
          <div className="product-image-picker">
            {imagePreview ? (
              <div className="product-image-preview">
                <img src={imagePreview} alt="پێشبینینی وێنەی بەرهەم" />
                <button type="button" className="product-image-remove" onClick={clearSelectedImage} aria-label="سڕینەوەی وێنە"><X size={17} /></button>
              </div>
            ) : (
              <label className="product-image-dropzone" htmlFor="product-image">
                <ImagePlus size={28} />
                <strong>وێنە هەڵبژێرە</strong>
                <span>JPG، PNG، WEBP یان AVIF · تا ٥ MB</span>
              </label>
            )}
            <input ref={imageInputRef} id="product-image" className="product-image-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={chooseImage} />
          </div>
        </div>
        <div className="merchant-field"><label htmlFor="product-name">ناوی بەرهەم *</label><input className="plain-field" id="product-name" required minLength={2} maxLength={180} value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="merchant-field">
          <label htmlFor="product-category">پۆلی بەرهەم *</label>
          <select id="product-category" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="" disabled>پۆلێک هەڵبژێرە</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name_ckb}</option>)}
          </select>
        </div>
        <div className="merchant-field">
          <label htmlFor="product-unit">یەکەی فرۆشتن *</label>
          <select id="product-unit" value={unit} onChange={(event) => changeUnit(event.target.value)}>
            {unitOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
          <small className="muted">جۆری فرۆشگا: {storeCategory === "supermarket" ? "سوپەرمارکێت" : storeCategory === "meat_seafood" ? "گۆشت و سپیاتی" : storeCategory === "fruits_vegetables" ? "سەوزە و میوە" : "چێشتخانە"}</small>
        </div>
        <div className="merchant-field">
          <label htmlFor="product-price">نرخی فرۆشتن بۆ ١ {unitLabel} (دینار) *</label>
          <input className="plain-field" id="product-price" type="number" min="1" step="1" required value={price} onChange={(event) => setPrice(event.target.value)} />
        </div>
        <div className="merchant-field">
          <label htmlFor="product-compare-price">نرخی پێشوو (ئارەزوومەندانە)</label>
          <input className="plain-field" id="product-compare-price" type="number" min="1" step="1" value={compareAtPrice} onChange={(event) => setCompareAtPrice(event.target.value)} />
        </div>
        <div className="merchant-field">
          <label htmlFor="product-stock">بڕی بەردەست لە کۆگا ({unitLabel})</label>
          <input className="plain-field" id="product-stock" type="number" min="0" step={["kg", "liter"].includes(unit) ? "0.001" : "1"} value={stock} onChange={(event) => setStock(event.target.value)} />
          <small className="muted">بەتاڵ بهێڵەوە ئەگەر کۆگا سنووردار ناکەیت.</small>
        </div>
        <div className="merchant-field">
          <label htmlFor="product-min-order">کەمترین بڕ بۆ هەر داواکاری ({unitLabel}) *</label>
          <input className="plain-field" id="product-min-order" type="number" min="0.001" step="0.001" required value={minOrder} onChange={(event) => setMinOrder(event.target.value)} />
        </div>
        <div className="merchant-field">
          <label htmlFor="product-max-order">زۆرترین بڕ بۆ هەر داواکاری ({unitLabel})</label>
          <input className="plain-field" id="product-max-order" type="number" min={minValueForInput(minOrder)} step="0.001" value={maxOrder} onChange={(event) => setMaxOrder(event.target.value)} placeholder="بەتاڵ = بێ سنوور" />
        </div>
        <div className="merchant-field">
          <label htmlFor="product-quantity-step">هەنگاوی زیادکردن ({unitLabel}) *</label>
          <input className="plain-field" id="product-quantity-step" type="number" min="0.001" step="0.001" required value={quantityStep} onChange={(event) => setQuantityStep(event.target.value)} />
        </div>
        <div className="merchant-field merchant-field-wide product-quantity-hint">
          <strong>نموونەی شێوازی داواکاری</strong>
          <span>کەمترین: {minOrder} {unitLabel} · زیادکردن بە: {quantityStep} {unitLabel}{maxOrder ? " · زۆرترین: " + maxOrder + " " + unitLabel : ""}</span>
          <small>بۆ گۆشت و میوە دەتوانیت ٠.٢٥ کیلۆ یان ٠.٥٠ کیلۆ دابنێیت؛ کڕیار لە سەبەتەدا بڕی خۆی دیاری دەکات.</small>
        </div>
        <div className="merchant-field merchant-field-wide"><label htmlFor="product-description">وەسف</label><textarea id="product-description" rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
        {error && <p className="form-error merchant-field-wide" role="alert">{error}</p>}
        {success && <p className="form-success merchant-field-wide" role="status">{success}</p>}
        <div className="merchant-field-wide"><button className="button" type="submit" disabled={busy}><PackagePlus size={17} /> {busy ? "وێنە و بەرهەم پاشەکەوت دەکرێن..." : "پاشەکەوتکردنی بەرهەم"}</button></div>
      </form>
      <p className="muted" style={{ fontSize: ".82rem", marginBottom: 0 }}>
        بەرهەمەکە سەرەتا ڕەشنووسە؛ دوای پشکنینی وێنە، نرخ و زانیاری لەلایەن بەڕێوەبەرەوە بڵاو دەکرێتەوە.
      </p>
    </section>
  );
}

function minValueForInput(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(number) : "0.001";
}
