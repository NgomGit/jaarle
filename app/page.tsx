import { Navbar } from "@/components/site/navbar";
import { Hero } from "@/components/site/hero";
import { HowItWorks } from "@/components/site/how-it-works";
import { MarketShowcase, type LaunchOffer, type ShowcaseItem } from "@/components/site/market-showcase";
import { Features } from "@/components/site/features";
import { PremiumShowcase } from "@/components/site/premium-showcase";
import { Pricing } from "@/components/site/pricing";
import { MadeForSenegal } from "@/components/site/made-for-senegal";
import { FinalCta } from "@/components/site/final-cta";
import { Footer } from "@/components/site/footer";
import { createPublicClient } from "@/lib/supabase/public";
import { getMarketProducts, getMarketPublicSettings } from "@/lib/market/queries";
import { getShowcaseCreations } from "@/lib/showcase";
import type { PlanRow, PublicPromotion } from "@/lib/billing/types";
import type { Metadata } from "next";
import { absoluteUrl, jsonLdString, organizationLd, softwareApplicationLd, websiteLd } from "@/lib/seo";

// Page d'accueil Jaarle (vendeurs) : boutique gratuite + visibilité sur Jaarle Market + affiches IA +
// partage WhatsApp / réseaux. Comment ça marche en 3 étapes.
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

/** Vrais produits du Market + offre de lancement (règles de 0026, modifiables dans l'admin). */
async function loadMarket(): Promise<{ items: ShowcaseItem[]; offer: LaunchOffer }> {
  const [products, settings] = await Promise.all([getMarketProducts({ sort: "relevance", limit: 4 }), getMarketPublicSettings()]);
  return {
    items: products.items.map((p) => ({
      id: p.id,
      name: p.name,
      priceLabel: p.priceLabel,
      shopName: p.shop.name,
      imageUrl: p.thumbUrl ?? p.fullUrl,
      href: `/boutique/${p.shop.slug}/p/${p.slug}?src=market`,
    })),
    offer: { active: settings.launchActive, lastDay: settings.launchLastDay, minItems: settings.launchMinItems, proMinItems: settings.proMinItems },
  };
}

export default async function Home() {
  const [{ plans, promos }, market, showcase] = await Promise.all([loadOffers(), loadMarket(), getShowcaseCreations(6)]);
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString([organizationLd(), websiteLd(), softwareApplicationLd(plans)]) }}
      />
      <Navbar />
      <Hero offer={market.offer} />
      <div className="border-y border-border py-7">
        <div className="container flex flex-wrap justify-center gap-x-8 gap-y-3 text-xs font-semibold tracking-wide text-muted-foreground sm:gap-10">
          <span>WHATSAPP</span><span>INSTAGRAM</span><span>FACEBOOK</span><span>TIKTOK</span>
          <span>WAVE</span><span>ORANGE MONEY</span>
        </div>
      </div>
      <HowItWorks />
      <MarketShowcase items={market.items} offer={market.offer} />
      <Features />
      <PremiumShowcase items={showcase} />
      <Pricing plans={plans} promos={promos} />
      <MadeForSenegal />
      <FinalCta />
      <Footer />
    </main>
  );
}
