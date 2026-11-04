"use client";

import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LockKeyhole, Mail, ShoppingBag } from "lucide-react";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const callbackError = searchParams.get("error");
  const feedbackError =
    callbackError === "oauth"
      ? "چوونەژوورەوە بە Google تەواو نەبوو. ڕێکخستنی Google Auth بپشکنە و دووبارە هەوڵ بدەرەوە."
      : callbackError === "callback"
        ? "پەیوەندیی پشتڕاستکردنەوە تەواو نەبوو یان بەستەرەکە بەسەرچووە. تکایە دووبارە هەوڵ بدەرەوە."
        : "";
  const passwordUpdated = searchParams.get("password") === "updated";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (authError) throw authError;
      router.replace("/dashboard");
      router.refresh();
    } catch (caught) {
      const details = caught instanceof Error ? caught.message : "";
      setError(
        details.includes("Invalid login credentials")
          ? "ئیمەیڵ یان وشەی نهێنی هەڵەیە."
          : details || "چوونەژوورەوە سەرکەوتوو نەبوو.",
      );
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
        {feedbackError && <p className="form-error" role="alert">{feedbackError}</p>}
        {passwordUpdated && <p className="form-success" role="status">وشەی نهێنیت بە سەرکەوتوویی نوێکرایەوە. ئێستا بچۆ ژوورەوە.</p>}
        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="email">ئیمەیڵ</label>
          <div className="field-wrap"><Mail size={18} /><input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" dir="ltr" /></div>
          <label htmlFor="password">وشەی نهێنی</label>
          <div className="field-wrap"><LockKeyhole size={18} /><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="وشەی نهێنی" /></div>
          <div className="form-row"><span /><Link href="/reset-password">وشەی نهێنیت لەبیرچووە؟</Link></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button auth-submit" type="submit" disabled={busy}>{busy ? "چاوەڕێ بکە..." : "چوونەژوورەوە"}</button>
        </form>
        <GoogleSignInButton next="/dashboard" />
        <p className="auth-switch">هەژمارت نییە؟ <Link href="/signup">خۆت تۆمار بکە</Link></p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-shell"><section className="auth-card">چاوەڕێ بکە...</section></main>}>
      <LoginContent />
    </Suspense>
  );
}
