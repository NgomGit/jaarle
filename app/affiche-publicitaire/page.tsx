import { LandingPage, landingMetadata } from "@/components/site/landing-page";
import { getLanding } from "@/lib/landings";
import { getShowcaseCreations } from "@/lib/showcase";

const SLUG = "affiche-publicitaire";

export const metadata = landingMetadata(SLUG);

// Affiches de la vitrine (choisies dans Admin → Affiches) : rafraîchies toutes les 5 minutes.
export const revalidate = 300;

export default async function Page() {
  const items = await getShowcaseCreations(6);
  return (
    <LandingPage landing={getLanding(SLUG)}>
      {items.length > 0 && (
        <section>
          <h2 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">Des affiches créées avec Jaarle</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((it) => (
              <li key={it.id} className="overflow-hidden rounded-2xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.src} alt={it.alt} width={600} height={600} loading="lazy" className="aspect-square w-full object-cover" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </LandingPage>
  );
}
