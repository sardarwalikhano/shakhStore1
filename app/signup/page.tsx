"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Mail, ShoppingBag, UserRound } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, preferred_locale: "ckb" },
          emailRedirectTo: \`\${window.location.origin}/auth/callback?next=/dashboard\`,
        },
      });
      if (authError) throw authError;
      if (data.session) {
        window.location.assign("/dashboard");
      } else {
        setSuccess("لینکی پشتڕاستکردنەوە بۆ ئیمەیڵەکەت نێردراوە. تکایە ئیمەیڵەکەت بپشکنە.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تۆمارکردن سەرکەوتوو نەبوو.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <Link href="/" className="auth-back"><ArrowRight size={18} /> گەڕانەوە بۆ سەرەتا</Link>
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark"><ShoppingBag size={27} /></span><span className="brand-name">Shakh <b>Store</b></span></div>
        <h1>دروستکردنی هەژمار</h1>
        <p className="muted">زانیارییە سەرەتاییەکانت بنووسە بۆ تۆمارکردن.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="fullName">ناوی تەواو</label>
          <div className="field-wrap"><UserRound size={18} /><input id="fullName" autoComplete="name" required minLength={2} maxLength={160} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ناوی تەواوت" /></div>
          <label htmlFor="email">ئیمەیڵ</label>
          <div className="field-wrap"><Mail size={18} /><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" dir="ltr" /></div>
          <label htmlFor="password">وشەی نهێنی</label>
          <div className="field-wrap"><input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="لانیکەم ٨ پیت" /></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{success}</p>}
          <button className="button auth-submit" type="submit" disabled={busy}>{busy ? "چاوەڕێ بکە..." : "دروستکردنی هەژمار"}</button>
        </form>
        <p className="auth-switch">پێشتر هەژمارت هەبووە؟ <Link href="/login">چوونەژوورەوە</Link></p>
      </section>
    </main>
  );
}