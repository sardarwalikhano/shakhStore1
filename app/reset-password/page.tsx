import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const updateMode = params.mode === "update";

  return (
    <main className="auth-shell">
      <Link href="/login" className="auth-back"><ArrowRight size={18} /> گەڕانەوە بۆ چوونەژوورەوە</Link>
      <ResetPasswordForm initialUpdateMode={updateMode} />
    </main>
  );
}