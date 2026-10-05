import Link from "next/link";
import { LandingPage, landingMetadata } from "@/components/site/landing-page";
import { getLanding } from "@/lib/landings";
import { marketRootCategories } from "@/lib/market/categories";
import { MARKET_CITIES } from "@/lib/market/cities";

const SLUG = "marketplace-senegal";

export const metadata = landingMetadata(SLUG);

// Villes mises en avant (les autres restent accessibles depuis le Market).
const TOP_CITIES = ["dakar", "pikine", "guediawaye", "rufisque", "thies", "mbour", "touba", "saint-louis", "kaolack", "ziguinchor"];

export default function Page() {
  const cities = MARKET_CITIES.filter((c) => TOP_CITIES.includes(c.slug));
  return (
    <LandingPage landing={getLanding(SLUG)}>
      <section>
        <h2 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">Les catégories du Market</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {marketRootCategories().map((c) => (
            <li key={c.slug}>
              <Link
                href={`/market/${c.slug}`}
                className="block rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-accent"
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">Acheter près de chez toi</h2>
        <ul className="flex flex-wrap gap-2">
          {cities.map((c) => (
            <li key={c.slug}>
              <Link href={`/market/${c.slug}`} className="inline-block rounded-full border border-border px-4 py-2 text-sm hover:bg-accent">
                Annonces à {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </LandingPage>
  );
}
