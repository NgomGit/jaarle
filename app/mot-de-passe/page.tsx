import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Nouveau mot de passe", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Changement de mot de passe obligatoire après une réinitialisation par l'équipe Jaarle. */
export default async function ChangePasswordPage({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mot-de-passe");
  return <ChangePasswordForm error={searchParams.error} />;
}
