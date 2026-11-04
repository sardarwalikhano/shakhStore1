"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { buildAuthCallbackUrl } from "@/lib/auth-redirects";

export function GoogleSignInButton({ next = "/dashboard" }: { next?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogleSignIn() {
    setBusy(true);
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildAuthCallbackUrl(window.location.origin, next),
          queryParams: { prompt: "select_account" },
        },
      });

      if (authError) throw authError;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "چوونەژوورەوە بە Google سەرکەوتوو نەبوو.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="google-auth-block">
      <button
        type="button"
        className="auth-google-button"
        onClick={handleGoogleSignIn}
        disabled={busy}
      >
        <span className="google-mark" aria-hidden="true">G</span>
        {busy ? "پەیوەندی بە Google..." : "بەردەوامبوون بە Google"}
      </button>
      <div className="auth-divider"><span />یان بە ئیمەیڵ<span /></div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
