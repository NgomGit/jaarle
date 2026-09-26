import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { PricingView } from "@/components/billing/pricing-view";
import type { CreditPackRow, PlanRow, PublicPromotion } from "@/lib/billing/types";

export const metadata: Metadata = {
  title: "Tarifs — Jaarle",
  description: "Jaarle est gratuit pour commencer. Jaarle Pro : produits illimités, plus de générations IA et des visuels sans filigrane.",
};

// Les prix, limites et offres viennent de la base (tables plans / credit_packs / promotions) :
// les modifier ne demande aucun déploiement.
export default async function TarifsPage() {
  const pub = createPublicClient();
  const [plans, packs, promos, session] = await Promise.all([
    pub.from("plans").select("*").eq("is_public", true).order("sort").then((r) => (r.data ?? []) as PlanRow[]),
    pub.from("credit_packs").select("*").order("sort").then((r) => (r.data ?? []) as CreditPackRow[]),
    pub.rpc("public_promotions").then((r) => (r.data ?? []) as PublicPromotion[]),
    createClient().auth.getUser(),
  ]);

  return <PricingView plans={plans} packs={packs} promos={promos} loggedIn={!!session.data.user} />;
}
