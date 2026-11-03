"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <button className="signout-button" type="button" onClick={signOut} disabled={busy}><LogOut size={16} /> {busy ? "چاوەڕێ بکە..." : "چوونەدەرەوە"}</button>;
}