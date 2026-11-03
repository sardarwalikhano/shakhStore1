"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Plus, Star, Trash2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";

type Address = Tables<"customer_addresses">;

export function AddressBook({ userId, initialAddresses }: { userId: string; initialAddresses: Address[] }) {
  const router = useRouter();
  const [addresses, setAddresses] = useState(initialAddresses);
  const [label, setLabel] = useState("ماڵ");
  const [recipient, setRecipient] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("هەولێر");
  const [district, setDistrict] = useState("");
  const [line, setLine] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: insertError } = await supabase.from("customer_addresses").insert({
        customer_id: userId,
        label: label.trim(),
        recipient_name: recipient.trim(),
        phone: phone.trim(),
        city: city.trim(),
        district: district.trim(),
        address_line: line.trim(),
        delivery_notes: notes.trim() || null,
        is_default: false,
        is_active: true,
      }).select("*").single();
      if (insertError) throw insertError;

      let created = data;
      if (addresses.length === 0) {
        const { error: defaultError } = await supabase.rpc("set_default_customer_address_v1", { p_address_id: data.id });
        if (!defaultError) created = { ...data, is_default: true };
      }
      setAddresses(current => [...current, created]);
      setRecipient(""); setPhone(""); setDistrict(""); setLine(""); setNotes("");
      setSuccess("ناونیشانەکەت پاشەکەوت کرا.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "زیادکردنی ناونیشان سەرکەوتوو نەبوو.");
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(addressId: string) {
    setBusy(true); setError(""); setSuccess("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.rpc("set_default_customer_address_v1", { p_address_id: addressId });
      if (updateError) throw updateError;
      setAddresses(current => current.map(address => ({ ...address, is_default: address.id === addressId })));
      setSuccess("ناونیشانی بنەڕەتی نوێ کرایەوە.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "گۆڕینی ناونیشانی بنەڕەتی سەرکەوتوو نەبوو.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAddress(addressId: string) {
    if (!window.confirm("ئایا دڵنیایت لە سڕینەوەی ئەم ناونیشانە؟")) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: deleteError } = await supabase.from("customer_addresses").delete().eq("id", addressId);
      if (deleteError) throw deleteError;
      const remaining = addresses.filter(address => address.id !== addressId);
      setAddresses(remaining);
      if (addresses.find(address => address.id === addressId)?.is_default && remaining[0]) {
        const { error: defaultError } = await supabase.rpc("set_default_customer_address_v1", { p_address_id: remaining[0].id });
        if (!defaultError) setAddresses(current => current.map(address => ({ ...address, is_default: address.id === remaining[0].id })));
      }
      setSuccess("ناونیشانەکە سڕایەوە.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "سڕینەوەی ناونیشان سەرکەوتوو نەبوو.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="address-book-layout">
      <section className="address-list">
        {addresses.length === 0 ? (
          <div className="empty-state"><MapPin size={30} color="#f36b18" /><strong>هێشتا ناونیشانت تۆمار نەکردووە</strong><span className="muted">بۆ Checkout پێویستە ناونیشانێکی چالاکت هەبێت.</span></div>
        ) : addresses.map(address => (
          <article className="address-card" key={address.id}>
            <div className="address-card-icon"><MapPin size={22} /></div>
            <div className="address-card-info">
              <div className="address-card-title"><strong>{address.label}</strong>{address.is_default && <span className="default-address-pill"><Star size={13} fill="currentColor" /> بنەڕەتی</span>}</div>
              <span>{address.recipient_name} · <bdi dir="ltr">{address.phone}</bdi></span>
              <span>{address.city}، {address.district}</span>
              <span className="muted">{address.address_line}</span>
              {address.delivery_notes && <small className="muted">{address.delivery_notes}</small>}
            </div>
            <div className="address-actions">
              {!address.is_default && <button type="button" onClick={() => makeDefault(address.id)} disabled={busy}><Check size={15} /> بنەڕەتی بکە</button>}
              <button type="button" className="danger-action" onClick={() => removeAddress(address.id)} disabled={busy} aria-label="سڕینەوە"><Trash2 size={16} /></button>
            </div>
          </article>
        ))}
      </section>

      <section className="address-form-card">
        <div className="section-heading"><div><h2>زیادکردنی ناونیشان</h2><p>ناونیشانی گەیاندن بە زانیاری ڕاستەقینە تۆمار بکە.</p></div></div>
        <form className="merchant-form" onSubmit={addAddress}>
          <div className="merchant-field"><label htmlFor="address-label">ناوی ناونیشان</label><select id="address-label" value={label} onChange={e=>setLabel(e.target.value)}><option value="ماڵ">ماڵ</option><option value="کار">کار</option><option value="تر">تر</option></select></div>
          <div className="merchant-field"><label htmlFor="address-recipient">ناوی وەرگر *</label><input className="plain-field" id="address-recipient" required minLength={2} maxLength={120} value={recipient} onChange={e=>setRecipient(e.target.value)} /></div>
          <div className="merchant-field"><label htmlFor="address-phone">ژمارەی مۆبایل *</label><input className="plain-field" id="address-phone" type="tel" dir="ltr" required minLength={7} maxLength={32} value={phone} onChange={e=>setPhone(e.target.value)} /></div>
          <div className="merchant-field"><label htmlFor="address-city">شار *</label><input className="plain-field" id="address-city" required minLength={2} maxLength={100} value={city} onChange={e=>setCity(e.target.value)} /></div>
          <div className="merchant-field"><label htmlFor="address-district">گەڕەک *</label><input className="plain-field" id="address-district" required minLength={2} maxLength={120} value={district} onChange={e=>setDistrict(e.target.value)} /></div>
          <div className="merchant-field merchant-field-wide"><label htmlFor="address-line">ناونیشانی ورد *</label><input className="plain-field" id="address-line" required minLength={3} maxLength={300} value={line} onChange={e=>setLine(e.target.value)} placeholder="شەقام، کوچە، ژمارەی خانوو..." /></div>
          <div className="merchant-field merchant-field-wide"><label htmlFor="address-notes">تێبینی گەیاندن</label><textarea id="address-notes" rows={3} maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)} /></div>
          {error && <p className="form-error merchant-field-wide" role="alert">{error}</p>}
          {success && <p className="form-success merchant-field-wide" role="status">{success}</p>}
          <div className="merchant-field-wide"><button className="button" type="submit" disabled={busy}><Plus size={17} /> {busy ? "پاشەکەوت دەکرێت..." : "پاشەکەوتکردنی ناونیشان"}</button></div>
        </form>
      </section>
    </div>
  );
}