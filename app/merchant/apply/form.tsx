"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, MapPin, Phone, Send, UserRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const categories = [
  { value: "restaurant", label: "چێشتخانە" },
  { value: "supermarket", label: "سوپەرمارکێت" },
  { value: "meat_seafood", label: "گۆشت و سپیاتی" },
  { value: "fruits_vegetables", label: "سەوزە و میوە" },
];

export function MerchantApplicationForm() {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("restaurant");
  const [description, setDescription] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("هەولێر");
  const [district, setDistrict] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function normalizeSlug(value: string) {
    return value.toLowerCase().trim().replace(/\\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess("");
    const cleanSlug = normalizeSlug(slug);
    if (cleanSlug && !/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(cleanSlug)) {
      setError("ناوی کورت دەبێت تەنها پیتی ئینگلیزی، ژمارە و - یان _ لەخۆبگرێت.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: insertError } = await supabase.from("merchant_applications").insert({
        business_name: businessName.trim(),
        proposed_slug: cleanSlug || null,
        merchant_category: category,
        description: description.trim() || null,
        contact_person: contactPerson.trim(),
        phone: phone.trim(),
        city: city.trim(),
        district: district.trim(),
        address_line: addressLine.trim(),
      });
      if (insertError) throw insertError;
      setSuccess("داواکارییەکەت نێردرا. تا پەسەندکردن، هیچ ڕۆڵ یان فرۆشگایەکی نوێ بۆ هەژمارەکەت دروست ناکرێت.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ناردنی داواکاری سەرکەوتوو نەبوو.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="merchant-form-card">
      <div className="section-heading"><div><h2>فۆڕمی داواکاری</h2><p>خانە پێویستەکان پڕ بکەرەوە.</p></div></div>
      <form onSubmit={handleSubmit} className="merchant-form">
        <div className="merchant-field"><label htmlFor="businessName">ناوی فرۆشگا *</label><div className="field-wrap"><Building2 size={18} /><input id="businessName" required minLength={2} maxLength={160} value={businessName} onChange={(e) => setBusinessName(e.target.value)} /></div></div>
        <div className="merchant-field"><label htmlFor="slug">ناوی کورت (ئارەزوومەندانە)</label><div className="field-wrap"><input id="slug" dir="ltr" maxLength={80} value={slug} onChange={(e) => setSlug(e.target.value)} onBlur={() => setSlug(normalizeSlug(slug))} placeholder="my-store" /></div></div>
        <div className="merchant-field"><label htmlFor="category">جۆری فرۆشگا *</label><select id="category" required value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></div>
        <div className="merchant-field"><label htmlFor="contactPerson">ناوی کەسی پەیوەندی *</label><div className="field-wrap"><UserRound size={18} /><input id="contactPerson" required minLength={2} maxLength={120} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} /></div></div>
        <div className="merchant-field"><label htmlFor="phone">ژمارەی مۆبایل *</label><div className="field-wrap"><Phone size={18} /><input id="phone" type="tel" dir="ltr" required minLength={7} maxLength={32} value={phone} onChange={(e) => setPhone(e.target.value)} /></div></div>
        <div className="merchant-field"><label htmlFor="city">شار *</label><div className="field-wrap"><MapPin size={18} /><input id="city" required minLength={2} maxLength={100} value={city} onChange={(e) => setCity(e.target.value)} /></div></div>
        <div className="merchant-field"><label htmlFor="district">گەڕەک *</label><div className="field-wrap"><input id="district" required minLength={2} maxLength={120} value={district} onChange={(e) => setDistrict(e.target.value)} /></div></div>
        <div className="merchant-field merchant-field-wide"><label htmlFor="addressLine">ناونیشانی تەواو *</label><div className="field-wrap"><input id="addressLine" required minLength={3} maxLength={240} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} /></div></div>
        <div className="merchant-field merchant-field-wide"><label htmlFor="description">کورتەیەک لەسەر فرۆشگا</label><textarea id="description" rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        {error && <p className="form-error merchant-field-wide" role="alert">{error}</p>}
        {success && <p className="form-success merchant-field-wide" role="status">{success}</p>}
        <div className="merchant-field-wide"><button className="button" type="submit" disabled={busy}><Send size={17} /> {busy ? "داواکاری دەنێردرێت..." : "ناردنی داواکاری"}</button></div>
      </form>
    </section>
  );
}