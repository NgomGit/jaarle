import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { PROMO_ERRORS, quotePlan } from "@/lib/billing/checkout";
import { siteUrl } from "@/lib/shops/format";
import { SubscriptionView, type HistoryItem } from "@/components/billing/subscription-view";
import type { CreditPackRow, PlanRow } from "@/lib/billing/types";

// /dashboard/abonnement — offre actuelle, utilisation, crédits, paiements, parrainage.
export default async function AbonnementPage({ searchParams }: { searchParams: { ref?: string; canceled?: string; code?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ent = await getEntitlements();
  if (!ent.billingEnabled) {
    return <SubscriptionView unavailable />;
  }

  const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const [plans, packs, quote, orders, ledger, referrals] = await Promise.all([
    supabase.from("plans").select("*").order("sort").then((r) => (r.data ?? []) as PlanRow[]),
    supabase.from("credit_packs").select("*").order("sort").then((r) => (r.data ?? []) as CreditPackRow[]),
    hasService ? quotePlan(user.id, "pro", searchParams.code ?? null) : Promise.resolve(null),
    supabase
      .from("orders")
      .select("ref_command, amount, status, kind, created_at, paid_at")
      .order("created_at", { ascending: false })
      .limit(15)
      .then((r) => r.data ?? []),
    supabase
      .from("credit_ledger")
      .select("id, delta, kind, note, created_at")
      .order("created_at", { ascending: false })
      .limit(15)
      .then((r) => r.data ?? []),
    hasService
      ? createAdminClient()
          .from("account_profiles")
          .select("user_id", { count: "exact", head: true })
          .eq("referred_by", user.id)
          .then((r) => r.count ?? 0)
      : Promise.resolve(0),
  ]);

  const history: HistoryItem[] = [
    ...orders
      .filter((o) => o.status !== "pending" || Date.now() - new Date(o.created_at as string).getTime() < 3600_000)
      .map((o) => ({
        id: o.ref_command as string,
        at: (o.paid_at ?? o.created_at) as string,
        type: "order" as const,
        kind: o.kind as string,
        amount: o.amount as number,
        status: o.status as string,
      })),
    ...ledger.map((l) => ({
      id: l.id as string,
      at: l.created_at as string,
      type: "ledger" as const,
      kind: l.kind as string,
      delta: l.delta as number,
      note: (l.note as string | null) ?? null,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);

  const pro = plans.find((p) => p.key === "pro") ?? null;
  const proQuote =
    quote && quote.ok
      ? {
          price: quote.price,
          regularPrice: quote.regularPrice,
          promotionName: quote.promotionName,
          periodsLeft: quote.periodsLeft,
          promoMessage: quote.promoError ? PROMO_ERRORS[quote.promoError] ?? null : null,
        }
      : null;

  return (
    <SubscriptionView
      entitlements={ent}
      pro={pro}
      proQuote={proQuote}
      initialCode={searchParams.code ?? ""}
      packs={packs}
      history={history}
      referral={{ code: ent.referralCode, link: ent.referralCode ? `${siteUrl()}/register?ref=${ent.referralCode}` : null, count: referrals }}
      pendingRef={searchParams.ref ?? null}
      canceled={!!searchParams.canceled}
    />
  );
}
