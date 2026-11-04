"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Mail, MapPinned, Pencil, Plus, Save, ShieldCheck, UserRound, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type DeliveryZoneOption = {
  id: string;
  name_ckb: string;
  city: string;
  district: string | null;
  is_active: boolean;
};

type CaptainRecord = {
  user_id: string;
  full_name: string;
  email: string | null;
  scope_type: "global" | "zones";
  is_active: boolean;
  zone_ids: string[];
  email_confirmed: boolean;
};

function zoneTitle(zone: DeliveryZoneOption) {
  return zone.name_ckb + " — " + zone.city + (zone.district ? "، " + zone.district : " · هەموو شار");
}

function ZonePicker({
  zones,
  selected,
  onChange,
}: {
  zones: DeliveryZoneOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="captain-zone-picker">
      {zones.map((zone) => {
        const checked = selected.includes(zone.id);
        return (
          <label className="captain-zone-option" key={zone.id}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => onChange(
                event.target.checked
                  ? [...selected, zone.id]
                  : selected.filter((id) => id !== zone.id),
              )}
            />
            <span>
              <strong>{zoneTitle(zone)}</strong>
              <small>{zone.is_active ? "زۆنی چالاک" : "زۆنی ناچالاک"}</small>
            </span>
          </label>
        );
      })}
      {zones.length === 0 && <p className="muted">هیچ زۆنێک تۆمار نەکراوە. سەرەتا زۆنێک لە بەشی ناوچەی گەیاندن زیاد بکە.</p>}
    </div>
  );
}

export function CaptainManager({
  initialCaptains,
  zones,
}: {
  initialCaptains: CaptainRecord[];
  zones: DeliveryZoneOption[];
}) {
  const router = useRouter();
  const [captains, setCaptains] = useState(initialCaptains);
  useEffect(() => setCaptains(initialCaptains), [initialCaptains]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [reason, setReason] = useState("زیادکردنی کاپتنی گەیاندن");
  const [newScope, setNewScope] = useState<"global" | "zones">("global");
  const [newZones, setNewZones] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScope, setEditScope] = useState<"global" | "zones">("global");
  const [editZones, setEditZones] = useState<string[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function inviteCaptain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (newScope === "zones" && newZones.length === 0) {
      setError("بۆ کاپتنی زۆن، لانیکەم یەک زۆن هەڵبژێرە.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: inviteError } = await supabase.functions.invoke("manage-user-role", {
        body: {
          action: "invite_captain",
          email: email.trim(),
          fullName: fullName.trim(),
          reason: reason.trim(),
        },
      });
      if (inviteError) throw inviteError;
      const payload = data as { ok?: boolean; targetUserId?: string; invited?: boolean; error?: string } | null;
      if (!payload?.ok || !payload.targetUserId) {
        throw new Error(payload?.error || "دروستکردنی هەژماری کاپتن سەرکەوتوو نەبوو.");
      }

      const { error: scopeError } = await supabase.rpc("admin_manage_captain_scope_v1", {
        p_captain_user_id: payload.targetUserId,
        p_scope_type: newScope,
        p_zone_ids: newScope === "zones" ? newZones : [],
        p_is_active: true,
      });
      if (scopeError) {
        throw new Error("هەژماری کاپتن تۆمار کرا، بەڵام مەودای کاری پاشەکەوت نەکرا. لە لیستی کاپتنەکان دووبارە ڕێکی بخە: " + scopeError.message);
      }

      setEmail("");
      setFullName("");
      setReason("زیادکردنی کاپتنی گەیاندن");
      setNewScope("global");
      setNewZones([]);
      setSuccess(payload.invited
        ? "بانگهێشتنامەی کاپتن بە ئیمەیڵ نێردرا و مەودای کاری پاشەکەوت کرا."
        : "هەژماری بەکارهێنەر وەک کاپتن ڕێکخرا و مەودای کاری پاشەکەوت کرا.");
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "زیادکردنی کاپتن سەرکەوتوو نەبوو.";
      if (message.includes("administrator_account_protected")) setError("هەژماری ئەدمین یان سوپەرئەدمین ناتوانرێت بگۆڕدرێت بۆ کاپتن.");
      else if (message.includes("email_exists") || message.includes("already registered")) setError("ئەم ئیمەیڵە پێشتر هەژماری هەیە؛ هەوڵی دووبارە بدەوە یان هەژمارەکە بپشکنە.");
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  function beginEdit(captain: CaptainRecord) {
    setEditingId(captain.user_id);
    setEditScope(captain.scope_type);
    setEditZones(captain.zone_ids ?? []);
    setEditActive(captain.is_active);
    setError("");
    setSuccess("");
  }

  async function saveScope(event: FormEvent<HTMLFormElement>, captainId: string) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (editScope === "zones" && editZones.length === 0) {
      setError("بۆ مەودای زۆن، لانیکەم یەک زۆن هەڵبژێرە.");
      return;
    }

    setSavingId(captainId);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: saveError } = await supabase.rpc("admin_manage_captain_scope_v1", {
        p_captain_user_id: captainId,
        p_scope_type: editScope,
        p_zone_ids: editScope === "zones" ? editZones : [],
        p_is_active: editActive,
      });
      if (saveError) throw saveError;
      setCaptains((current) => current.map((captain) => captain.user_id === captainId
        ? { ...captain, scope_type: editScope, zone_ids: editScope === "zones" ? editZones : [], is_active: editActive }
        : captain));
      setEditingId(null);
      setSuccess("مەودای کار و دۆخی کاپتن نوێ کرایەوە.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "نوێکردنەوەی کاپتن سەرکەوتوو نەبوو.";
      if (message.includes("SUPER_ADMIN_REQUIRED")) setError("تەنها سوپەر ئەدمین دەتوانێت مەودای کاپتن بگۆڕێت.");
      else setError(message);
    } finally {
      setSavingId(null);
    }
  }

  const globalCount = captains.filter((captain) => captain.scope_type === "global" && captain.is_active).length;
  const zoneCount = captains.filter((captain) => captain.scope_type === "zones" && captain.is_active).length;
  const inactiveCount = captains.filter((captain) => !captain.is_active).length;

  return (
    <div className="captain-manager">
      <section className="dashboard-metrics" aria-label="پوختەی کاپتن">
        <article><span>کۆی کاپتنەکان</span><strong>{captains.length}</strong></article>
        <article><span>کاپتنی گشتی چالاک</span><strong>{globalCount}</strong></article>
        <article><span>کاپتنی زۆنی چالاک</span><strong>{zoneCount}</strong></article>
        <article><span>ناچالاک</span><strong>{inactiveCount}</strong></article>
      </section>

      <section className="dashboard-panel">
        <div className="section-heading">
          <div>
            <h2>زیادکردنی کاپتنی نوێ</h2>
            <p>ئیمەیڵی کاپتن بانگهێشت بکە، یان ئەگەر هەژماری هەیە ڕۆڵی کاپتنی پێ بدە.</p>
          </div>
          <span className="role-badge"><ShieldCheck size={15} /> تەنها سوپەر ئەدمین</span>
        </div>
        <form className="merchant-form" onSubmit={inviteCaptain}>
          <div className="merchant-field">
            <label htmlFor="captain-full-name">ناوی تەواو *</label>
            <input className="plain-field" id="captain-full-name" required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </div>
          <div className="merchant-field">
            <label htmlFor="captain-email">ئیمەیڵ *</label>
            <input className="plain-field" id="captain-email" type="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} dir="ltr" />
          </div>
          <div className="merchant-field">
            <label htmlFor="captain-scope">مەودای کارکردن *</label>
            <select className="plain-field" id="captain-scope" value={newScope} onChange={(event) => setNewScope(event.target.value as "global" | "zones")}>
              <option value="global">گشتی — هەموو زۆنەکان</option>
              <option value="zones">زۆنە دیاریکراوەکان</option>
            </select>
          </div>
          <div className="merchant-field">
            <label htmlFor="captain-reason">هۆکاری زیادکردن *</label>
            <input className="plain-field" id="captain-reason" required minLength={2} maxLength={1200} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          {newScope === "zones" && (
            <div className="merchant-field merchant-field-wide">
              <strong>زۆنەکانی کارکردن هەڵبژێرە *</strong>
              <ZonePicker zones={zones} selected={newZones} onChange={setNewZones} />
            </div>
          )}
          {error && <p className="form-error merchant-field-wide" role="alert">{error}</p>}
          {success && <p className="form-success merchant-field-wide" role="status">{success}</p>}
          <div className="merchant-field-wide">
            <button className="button" type="submit" disabled={busy || (newScope === "zones" && newZones.length === 0)}>
              {busy ? <Mail size={17} /> : <Plus size={17} />}
              {busy ? "تۆمارکردن..." : "زیادکردن و دیاریکردنی مەودا"}
            </button>
          </div>
        </form>
      </section>

      <section className="captain-manager-list">
        <div className="section-heading">
          <div><h2>کاپتنە تۆمارکراوەکان</h2><p>مەودا، چالاکی و پشتڕاستکردنەوەی ئیمەیڵی هەر کاپتنێک لێرە بەڕێوەببە.</p></div>
        </div>
        {captains.length === 0 ? (
          <div className="empty-state"><UserRound size={32} /><strong>هێشتا هیچ کاپتنێک نییە</strong><span className="muted">ئیمەیڵی کاپتن زیاد بکە یان هەژمارێکی هەبوو بکە بە کاپتن.</span></div>
        ) : captains.map((captain) => {
          const selectedZones = zones.filter((zone) => (captain.zone_ids ?? []).includes(zone.id));
          return (
            <article className="dashboard-panel" key={captain.user_id}>
              <div className="captain-card-heading">
                <div>
                  <h3><UserRound size={17} /> {captain.full_name}</h3>
                  <p dir="ltr">{captain.email ?? "ئیمەیڵ تۆمار نەکراوە"}</p>
                </div>
                <div className="captain-scope-summary">
                  <span>{captain.scope_type === "global" ? "گشتی" : "زۆنە دیاریکراوەکان"}</span>
                  <span className={captain.is_active ? "" : "captain-disabled"}>{captain.is_active ? "چالاک" : "ناچالاک"}</span>
                  <span className={captain.email_confirmed ? "" : "captain-pending"}>{captain.email_confirmed ? "ئیمەیڵ پشتڕاستکراوە" : "چاوەڕێی پشتڕاستکردنەوە"}</span>
                </div>
              </div>
              <p className="muted">
                {captain.scope_type === "global"
                  ? "ئەم کاپتنە دەتوانرێت بۆ گەیاندن لە هەموو زۆنەکان هەڵبژێردرێت."
                  : selectedZones.length
                    ? selectedZones.map(zoneTitle).join("، ")
                    : "هیچ زۆنێک دیاری نەکراوە؛ کاپتنەکە ناتوانێت گەیاندن وەربگرێت."}
              </p>
              {editingId === captain.user_id ? (
                <form className="merchant-form captain-edit-form" onSubmit={(event) => saveScope(event, captain.user_id)}>
                  <div className="merchant-field">
                    <label htmlFor={"captain-edit-scope-" + captain.user_id}>مەودای کار</label>
                    <select className="plain-field" id={"captain-edit-scope-" + captain.user_id} value={editScope} onChange={(event) => setEditScope(event.target.value as "global" | "zones")}>
                      <option value="global">گشتی — هەموو زۆنەکان</option>
                      <option value="zones">زۆنە دیاریکراوەکان</option>
                    </select>
                  </div>
                  <label className="publish-check merchant-field"><input type="checkbox" checked={editActive} onChange={(event) => setEditActive(event.target.checked)} /> چالاکی کاپتن</label>
                  {editScope === "zones" && (
                    <div className="merchant-field merchant-field-wide">
                      <strong>زۆنەکان</strong>
                      <ZonePicker zones={zones} selected={editZones} onChange={setEditZones} />
                    </div>
                  )}
                  <div className="merchant-field-wide dashboard-quick-links">
                    <button className="button" type="submit" disabled={savingId === captain.user_id || (editScope === "zones" && editZones.length === 0)}>
                      <Save size={16} /> {savingId === captain.user_id ? "پاشەکەوت..." : "پاشەکەوت"}
                    </button>
                    <button className="button button-secondary" type="button" onClick={() => setEditingId(null)} disabled={savingId === captain.user_id}>
                      <X size={16} /> پاشگەزبوونەوە
                    </button>
                  </div>
                </form>
              ) : (
                <div className="dashboard-quick-links">
                  <button className="button button-secondary" type="button" onClick={() => beginEdit(captain)}>
                    <Pencil size={16} /> گۆڕینی مەودا و دۆخ
                  </button>
                  {captain.scope_type === "zones" && <span className="muted"><MapPinned size={15} /> {selectedZones.length} زۆن</span>}
                  {captain.email_confirmed && <span className="muted"><CheckCircle2 size={15} /> ئامادە بۆ وەرگرتنی گەیاندن</span>}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
