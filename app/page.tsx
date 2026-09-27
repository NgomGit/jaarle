import { Navbar } from "@/components/site/navbar";
import { Hero } from "@/components/site/hero";
import { HowItWorks } from "@/components/site/how-it-works";
import { Features } from "@/components/site/features";
import { PremiumShowcase } from "@/components/site/premium-showcase";
import { Pricing } from "@/components/site/pricing";
import { MadeForSenegal } from "@/components/site/made-for-senegal";
import { FinalCta } from "@/components/site/final-cta";
import { Footer } from "@/components/site/footer";
import { createPublicClient } from "@/lib/supabase/public";
import type { PlanRow, PublicPromotion } from "@/lib/billing/types";
import type { Metadata } from "next";
import { absoluteUrl, jsonLdString, organizationLd, softwareApplicationLd, websiteLd } from "@/lib/seo";

// Page d'accueil Jaarle 2.0 : boutique en ligne + affiches IA + Studio réseaux + clients WhatsApp.
// Les offres affichées viennent de la base (plans / promotions), rafraîchies toutes les 5 minutes.
// (Anciennes sections AppPreview / DashboardPreview / Testimonials retirées de la page : elles
// décrivaient le paiement à l'affiche. Les fichiers restent dans components/site.)
export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: absoluteUrl("/") },
  openGraph: { url: absoluteUrl("/"), siteName: "Jaarle", locale: "fr_SN", type: "website" },
};

async function loadOffers(): Promise<{ plans: PlanRow[]; promos: PublicPromotion[] }> {
  try {
    const pub = createPublicClient();
    const [plans, promos] = await Promise.all([
      pub.from("plans").select("*").eq("is_public", true).order("sort").then((r) => (r.data ?? []) as PlanRow[]),
      pub.rpc("public_promotions").then((r) => (r.data ?? []) as PublicPromotion[]),
    ]);
    return { plans, promos };
  } catch {
    return { plans: [], promos: [] };
  }
}

export default async function Home() {
  const { plans, promos } = await loadOffers();
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString([organizationLd(), websiteLd(), softwareApplicationLd(plans)]) }}
      />
      <Navbar />
      <Hero />
      <div className="border-y border-border py-7">
        <div className="container flex flex-wrap justify-center gap-x-8 gap-y-3 text-xs font-semibold tracking-wide text-muted-foreground sm:gap-10">
          <span>WHATSAPP</span><span>INSTAGRAM</span><span>FACEBOOK</span><span>TIKTOK</span>
          <span>WAVE</span><span>ORANGE MONEY</span>
        </div>
      </div>
      <HowItWorks />
      <Features />
      <PremiumShowcase />
      <Pricing plans={plans} promos={promos} />
      <MadeForSenegal />
      <FinalCta />
      <Footer />
    </main>
  );
}
