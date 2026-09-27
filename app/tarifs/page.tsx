import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { PricingView } from "@/components/billing/pricing-view";
import type { CreditPackRow, PlanRow, PublicPromotion } from "@/lib/billing/types";
import fr from "@/lib/dictionaries/fr.json";
import { absoluteUrl, breadcrumbLd, faqLd, jsonLdString } from "@/lib/seo";

const TITLE = "Tarifs : gratuit pour commencer, Pro en FCFA";
const DESCRIPTION =
  "Jaarle est gratuit pour commencer : boutique en ligne, 10 produits, bouton WhatsApp. Jaarle Pro : produits illimités, plus de générations IA, visuels sans logo. Paiement Wave ou Orange Money.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/tarifs") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: absoluteUrl("/tarifs"), siteName: "Jaarle", locale: "fr_SN", type: "website" },
};

// Mêmes questions que la FAQ affichée (dictionnaire français) → résultat enrichi « FAQ » sur Google.
const FAQ = [1, 2, 3, 4].map((n) => ({
  q: (fr.tarifs as Record<string, string>)[`faq${n}q`],
  a: (fr.tarifs as Record<string, string>)[`faq${n}a`],
}));

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

  const jsonLd = [
    faqLd(FAQ),
    breadcrumbLd([
      { name: "Jaarle", url: absoluteUrl("/") },
      { name: "Tarifs", url: absoluteUrl("/tarifs") },
    ]),
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <PricingView plans={plans} packs={packs} promos={promos} loggedIn={!!session.data.user} />
    </>
  );
}
