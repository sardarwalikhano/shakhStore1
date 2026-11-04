"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { KeyRound, Mail, ShoppingBag } from "lucide-react";
import { buildAuthCallbackUrl } from "@/lib/auth-redirects";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function ResetPasswordForm({ initialUpdateMode }: { initialUpdateMode: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updateMode] = useState(initialUpdateMode);
  const [updated, setUpdated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const supabase = createSupabaseBrowserClient();

      if (updateMode) {
        if (password !== confirmPassword) {
          setError("وشەی نهێنی و دووبارەکردنەوەکەی یەک ناگرنەوە.");
          return;
        }

        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPassword("");
        setConfirmPassword("");
        setUpdated(true);
      } else {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email.trim().toLowerCase(),
          {
            redirectTo: buildAuthCallbackUrl(
              window.location.origin,
              "/reset-password?mode=update",
            ),
          },
        );
        if (resetError) throw resetError;
        setSuccess("ئەگەر هەژمارێک بەو ئیمەیڵە هەبێت، ڕێنمایی گۆڕینی وشەی نهێنی بۆی نێردراوە. تکایە Inbox و Spam بپشکنە.");
      }
    } catch (caught) {
      const details = caught instanceof Error ? caught.message : "";
      setError(
        details.includes("Auth session missing")
          ? "سەشنەکە بەسەرچووە یان بەستەری گۆڕین بەکاربراوە. داواکارییەکی نوێ بنێرە."
          : details || "ئەم کردارە سەرکەوتوو نەبوو. تکایە دووبارە هەوڵ بدەرەوە.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-brand"><span className="brand-mark"><ShoppingBag size={27} /></span><span className="brand-name">Shakh <b>Store</b></span></div>
      <h1>{updated ? "وشەی نهێنی نوێ کرایەوە" : updateMode ? "وشەی نهێنی نوێ" : "گۆڕینی وشەی نهێنی"}</h1>
      <p className="muted">
        {updated
          ? "وشەی نهێنیت بە سەرکەوتوویی نوێکرایەوە. ئێستا دەتوانیت بە وشەی نهێنی نوێ بچیتە ژوورەوە."
          : updateMode
            ? "وشەی نهێنی نوێیەک هەڵبژێرە و دووبارەی بکەرەوە."
            : "ئیمەیڵەکەت بنووسە تا ڕێنمایی گۆڕینی وشەی نهێنیت بۆ بنێرین."}
      </p>

      {updated ? (
        <Link href="/login" className="button auth-submit">چوونەژوورەوە</Link>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          {updateMode ? (
            <>
              <label htmlFor="password">وشەی نهێنی نوێ</label>
              <div className="field-wrap"><KeyRound size={18} /><input id="password" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></div>
              <label htmlFor="confirmPassword">دووبارەکردنەوەی وشەی نهێنی</label>
              <div className="field-wrap"><KeyRound size={18} /><input id="confirmPassword" type="password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" /></div>
            </>
          ) : (
            <>
              <label htmlFor="email">ئیمەیڵ</label>
              <div className="field-wrap"><Mail size={18} /><input id="email" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" placeholder="name@example.com" /></div>
            </>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          {success && <p className="form-success" role="status">{success}</p>}
          <button className="button auth-submit" type="submit" disabled={busy}>
            {busy ? "چاوەڕێ بکە..." : updateMode ? "نوێکردنەوەی وشەی نهێنی" : "ناردنی ڕێنمایی گۆڕین"}
          </button>
        </form>
      )}
    </section>
  );
}
