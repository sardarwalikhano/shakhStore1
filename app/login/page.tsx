"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail, ShoppingBag } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      router.replace("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "چوونەژوورەوە سەرکەوتوو نەبوو.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <Link href="/" className="auth-back"><ArrowRight size={18} /> گەڕانەوە بۆ سەرەتا</Link>
      <section className="auth-card">
        <div className="auth-brand"><span className="brand-mark"><ShoppingBag size={27} /></span><span className="brand-name">Shakh <b>Store</b></span></div>
        <h1>بەخێربێیتەوە</h1>
        <p className="muted">بچۆ ژوورەوە بۆ بەردەوامبوون لە شاخ ستور.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="email">ئیمەیڵ</label>
          <div className="field-wrap"><Mail size={18} /><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" dir="ltr" /></div>
          <label htmlFor="password">وشەی نهێنی</label>
          <div className="field-wrap"><LockKeyhole size={18} /><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="وشەی نهێنی" /></div>
          <div className="form-row"><span /><Link href="/reset-password">وشەی نهێنیت لەبیرچووە؟</Link></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="form-success" role="status">{message}</p>}
          <button className="button auth-submit" type="submit" disabled={busy}>{busy ? "چاوەڕێ بکە..." : "چوونەژوورەوە"}</button>
        </form>
        <p className="auth-switch">هەژمارت نییە؟ <Link href="/signup">خۆت تۆمار بکە</Link></p>
      </section>
    </main>
  );
}