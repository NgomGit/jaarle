import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { SettingsForm } from "./settings-form";
import { getEntitlements } from "@/lib/billing/entitlements";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const fullName = (user.user_metadata?.full_name as string | undefined) || "";
  const phone = (user.phone || "").replace(/^\+?221/, "");
  const whatsapp = ((user.user_metadata?.whatsapp_number as string | undefined) || "").replace(/^\+?221/, "");

  const entitlements = await getEntitlements();

  return (
    <>
      {entitlements.billingEnabled && (
        <div className="mb-4 flex max-w-[480px] flex-wrap gap-2">
          <Link href="/dashboard/abonnement" className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">
            Jaarle {entitlements.planName} · Mon abonnement →
          </Link>
          {entitlements.isAdmin && (
            <Link href="/dashboard/admin" className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">
              Admin →
            </Link>
          )}
        </div>
      )}
      <SettingsForm
      fullName={fullName}
      phone={phone}
      whatsapp={whatsapp}
      error={searchParams.error}
      message={searchParams.message}
      />
    </>
  );
}
