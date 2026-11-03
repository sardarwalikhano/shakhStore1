"use client";

import { useState, type FormEvent } from "react";
import { Check, Edit3, MapPin, Plus, Power, Save, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/database.types";

type DeliveryZone = Tables<"delivery_zones">;

function money(value: number) {
  return value.toLocaleString("en-US") + " دینار";
}

export function DeliveryZoneManager({ initialZones }: { initialZones: DeliveryZone[] }) {
  const [zones, setZones] = useState(initialZones);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("هەولێر");
  const [district, setDistrict] = useState("");
  const [baseFee, setBaseFee] = useState("0");
  const [minimumFee, setMinimumFee] = useState("0");
  const [maximumFee, setMaximumFee] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function clearForm() {
    setEditingId(null); setName(""); setCity("هەولێر"); setDistrict("");
    setBaseFee("0"); setMinimumFee("0"); setMaximumFee(""); setActive(false);
  }

  function editZone(zone: DeliveryZone) {
    setEditingId(zone.id);
    setName(zone.name_ckb);
    setCity(zone.city);
    setDistrict(zone.district ?? "");
    setBaseFee(String(zone.base_fee_iqd));
    setMinimumFee(String(zone.minimum_fee_iqd));
    setMaximumFee(zone.maximum_fee_iqd === null ? "" : String(zone.maximum_fee_iqd));
    setActive(zone.is_active);
    setError(""); setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess("");
    const base = Number(baseFee);
    const minimum = Number(minimumFee);
    const maximum = maximumFee.trim() === "" ? null : Number(maximumFee);
    if (!Number.isSafeInteger(base) || base < 0 || !Number.isSafeInteger(minimum) || minimum < 0) {
      setError("کرێی بنەڕەت و کەمترین کرێ دەبێت ژمارەی تەواوی سفر یان زیاتر بن.");
      return;
    }
    if (maximum !== null && (!Number.isSafeInteger(maximum) || maximum < minimum)) {
      setError("زۆرترین کرێ دەبێت ژمارەیەکی تەواو و گەورەتر یان یەکسان بە کەمترین کرێ بێت.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: saveError } = await supabase.rpc("manage_delivery_zone_v1", {
        p_zone_id: editingId as string,
        p_name_ckb: name.trim(),
        p_city: city.trim(),
        p_district: district.trim(),
        p_base_fee_iqd: base,
        p_per_km_fee_iqd: 0,
        p_minimum_fee_iqd: minimum,
        p_maximum_fee_iqd: maximum as unknown as number,
        p_maximum_distance_km: null as unknown as number,
        p_is_active: active,
      });
      if (saveError) throw saveError;
      if (!data) throw new Error("زانیاری ناوچەکە نەگەڕایەوە.");
      const saved = data as DeliveryZone;
      setZones(current => editingId
        ? current.map(zone => zone.id === saved.id ? saved : zone)
        : [saved, ...current]);
      setSuccess(editingId ? "ناوچەکە نوێ کرایەوە." : "ناوچەی گەیاندن زیاد کرا.");
      clearForm();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "پاشەکەوتکردنی ناوچە سەرکەوتوو نەبوو.";
      if (message.includes("DELIVERY_ZONE_ALREADY_EXISTS")) setError("ئەم شار و گەڕەکە پێشتر تۆمار کراوە.");
      else if (message.includes("ADMIN_REQUIRED")) setError("تەنها admin یان super admin دەتوانێت ناوچەکان بگۆڕێت.");
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="zone-manager">
      <section className="zone-form-card">
        <div className="section-heading">
          <div><h2>{editingId ? "دەستکاریکردنی ناوچە" : "زیادکردنی ناوچەی گەیاندن"}</h2><p>کرێی ڕاستەقینە بنووسە؛ هیچ نرخێکی پێشوەختە یان خەیاڵی دانەنراوە.</p></div>
          {editingId && <button type="button" className="button button-secondary" onClick={clearForm}><X size={16} /> پاشگەزبوونەوە</button>}
        </div>
        <form className="merchant-form" onSubmit={submit}>
          <div className="merchant-field"><label htmlFor="zone-name">ناوی ناوچە *</label><input className="plain-field" id="zone-name" required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="ناوی ناوچە بە کوردی" /></div>
          <div className="merchant-field"><label htmlFor="zone-city">شار *</label><input className="plain-field" id="zone-city" required minLength={2} maxLength={100} value={city} onChange={e=>setCity(e.target.value)} /></div>
          <div className="merchant-field"><label htmlFor="zone-district">گەڕەک (بەتاڵ = هەموو شار)</label><input className="plain-field" id="zone-district" maxLength={120} value={district} onChange={e=>setDistrict(e.target.value)} /></div>
          <div className="merchant-field"><label htmlFor="zone-base">کرێی بنەڕەت (IQD) *</label><input className="plain-field" id="zone-base" type="number" min="0" step="1" required value={baseFee} onChange={e=>setBaseFee(e.target.value)} /></div>
          <div className="merchant-field"><label htmlFor="zone-min">کەمترین کرێ (IQD) *</label><input className="plain-field" id="zone-min" type="number" min="0" step="1" required value={minimumFee} onChange={e=>setMinimumFee(e.target.value)} /></div>
          <div className="merchant-field"><label htmlFor="zone-max">زۆرترین کرێ (IQD، ئارەزوومەندانە)</label><input className="plain-field" id="zone-max" type="number" min="0" step="1" value={maximumFee} onChange={e=>setMaximumFee(e.target.value)} /></div>
          <label className="publish-check merchant-field-wide"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} /> چالاککردنی ئەم ناوچەیە بۆ Checkout</label>
          <div className="zone-limitation merchant-field-wide">
            <strong>سنووری قۆناغی ئێستا</strong>
            <span>کرێی کیلۆمەتر و مەودای گەیاندن هێشتا پشتگیری ناکرێن. بۆیە کرێی km = 0 و maximum distance = بەتاڵ دەمێنێتەوە.</span>
          </div>
          {error && <p className="form-error merchant-field-wide" role="alert">{error}</p>}
          {success && <p className="form-success merchant-field-wide" role="status">{success}</p>}
          <div className="merchant-field-wide"><button className="button" type="submit" disabled={busy}>{editingId ? <Save size={17} /> : <Plus size={17} />} {busy ? "پاشەکەوت دەکرێت..." : editingId ? "پاشەکەوتکردنی گۆڕانکاری" : "زیادکردنی ناوچە"}</button></div>
        </form>
      </section>

      <section className="zone-list-section">
        <div className="section-heading"><div><h2>ناوچەکانی گەیاندن</h2><p>هەموو ناوچەکان، چالاک و ناچالاک، بەپێی ڕێگەپێدانی admin پیشان دەدرێن.</p></div></div>
        {zones.length === 0 ? (
          <div className="empty-state"><MapPin size={30} color="#f36b18" /><strong>هیچ ناوچەیەک تۆمار نەکراوە</strong><span className="muted">دوای زیادکردنی ناوچەی ڕاستەقینە، Checkout دەتوانرێت بۆ ئەو شوێنانە چالاک بکرێت.</span></div>
        ) : (
          <div className="zone-grid">
            {zones.map(zone=>(
              <article className="zone-card" key={zone.id}>
                <div className="zone-card-top"><span className="zone-card-icon"><MapPin size={21} /></span><span className={zone.is_active ? "zone-status active" : "zone-status"}>{zone.is_active ? "چالاک" : "ناچالاک"}</span></div>
                <h3>{zone.name_ckb}</h3>
                <p>{zone.city}{zone.district ? "، " + zone.district : " · هەموو شار"}</p>
                <div className="zone-fees"><span>کرێی بنەڕەت</span><strong>{money(zone.base_fee_iqd)}</strong></div>
                <div className="zone-fees"><span>کەمترین کرێ</span><strong>{money(zone.minimum_fee_iqd)}</strong></div>
                <div className="zone-fees"><span>زۆرترین کرێ</span><strong>{zone.maximum_fee_iqd === null ? "دیاری نەکراوە" : money(zone.maximum_fee_iqd)}</strong></div>
                <button type="button" className="button button-secondary zone-edit" onClick={()=>editZone(zone)}><Edit3 size={16} /> دەستکاری</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}