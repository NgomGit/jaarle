import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getEntitlements } from "@/lib/billing/entitlements";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const ent = await getEntitlements();
  const plan = {
    billingEnabled: ent.billingEnabled,
    name: ent.planName,
    isFree: ent.plan === "free",
    remaining: ent.remainingGenerations,
    total: ent.monthlyGenerations,
    credits: ent.credits,
  };

  return <DashboardShell plan={plan}>{children}</DashboardShell>;
}
