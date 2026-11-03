"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, Mail, ShoppingBag } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [updateMode, setUpdateMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const hasUpdateMode = new URLSearchParams(window.location.search).get("mode") === "update";
    if (hasUpdateMode) setUpdateMode(true);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (updateMode) {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setSuccess("وشەی نهێنی نوێ کرایەوە. ئێستا دەتوانیت بچیتە ژوورەوە.");
        setUpdateMode(false);
      } else {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: \`\${window.location.origin}/auth/callback?next=/reset-password?mode=update\`,
        });
        if (resetError) throw resetError;
        setSuccess("بەستەری گۆڕینی وشەی نهێنی بۆ ئیمەیڵەکەت نێردرا.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ئەم کردارە سەرکەوتوو نەبوو.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <Link href="/login" className="auth-back"><ArrowRight size={18} /> گەڕانەوە بۆ چوونەژوورەوە</Link>
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark"><ShoppingBag size={27} /></span><span className="brand-name">Shakh <b>Store</b></span></div>
        <h1>{updateMode ? "وشەی نهێنی نوێ" : "گۆڕینی وشەی نهێنی"}</h1>
        <p className="muted">{updateMode ? "وشەی نهێنی نوێیەک هەڵبژێرە." : "ئیمەیڵەکەت بنووسە تا بەستەری گۆڕینی وشەی نهێنیت بۆ بنێرین."}</p>
        <form onSubmit={handleSubmit} className="auth-form">
          {updateMode ? (
            <><label htmlFor="password">وشەی نهێنی نوێ</label><div className="field-wrap"><KeyRound size={18} /><input id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></div></>
          ) : (
            <><label htmlFor="email">ئیمەیڵ</label><div className="field-wrap"><Mail size={18} /><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" placeholder="name@example.com" /></div></>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{success}</p>}
          <button className="button auth-submit" type="submit" disabled={busy}>{busy ? "چاوەڕێ بکە..." : updateMode ? "نوێکردنەوەی وشەی نهێنی" : "ناردنی بەستەر"}</button>
        </form>
      </section>
    </main>
  );
}