import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Package } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
import { createPublicClient } from "@/lib/supabase/public";
import { shopInitials, shopMediaUrl } from "@/lib/shops/media";
import { absoluteUrl, breadcrumbLd, isShopIndexable, jsonLdString, SITE_LOCALE, SITE_NAME } from "@/lib/seo";

// Annuaire public des boutiques Jaarle (indexables uniquement) : donne à Google un chemin vers
// chaque boutique (maillage interne) et aux visiteurs un moyen de découvrir les commerçants par ville.
export const revalidate = 3600;

const TITLE = "Boutiques en ligne au Sénégal — commander sur WhatsApp";
const DESCRIPTION =
  "Découvrez les boutiques des commerçants sénégalais sur Jaarle : mode, beauté, alimentation, électronique… Prix en FCFA et commande directe sur WhatsApp.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ${SITE_NAME}` },
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/boutiques") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: absoluteUrl("/boutiques"), siteName: SITE_NAME, locale: SITE_LOCALE, type: "website" },
};

type ShopRow = { id: string; slug: string; name: string; city: string | null; category_label: string | null; logo_path: string | null; updated_at: string };

async function loadShops(): Promise<(ShopRow & { products: number })[]> {
  try {
    const pub = createPublicClient();
    const [{ data: shops }, { data: products }] = await Promise.all([
      pub.from("shops").select("id, slug, name, city, category_label, logo_path, updated_at").eq("status", "published").limit(2000),
      pub.from("products").select("shop_id").limit(50000),
    ]);
    const counts = new Map<string, number>();
    for (const p of (products ?? []) as { shop_id: string }[]) counts.set(p.shop_id, (counts.get(p.shop_id) ?? 0) + 1);
    return ((shops ?? []) as ShopRow[])
      .map((s) => ({ ...s, products: counts.get(s.id) ?? 0 }))
      .filter((s) => isShopIndexable(s.products))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  } catch {
    return [];
  }
}

export default async function ShopsDirectoryPage() {
  const shops = await loadShops();
  const byCity = new Map<string, typeof shops>();
  for (const s of shops) {
    const city = s.city?.trim() || "Autres villes";
    byCity.set(city, [...(byCity.get(city) ?? []), s]);
  }
  const cities = [...byCity.entries()].sort((a, b) => b[1].length - a[1].length);

  const jsonLd = [
    breadcrumbLd([
      { name: "Jaarle", url: absoluteUrl("/") },
      { name: "Boutiques", url: absoluteUrl("/boutiques") },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Boutiques Jaarle",
      itemListElement: shops.slice(0, 100).map((s, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(`/boutique/${s.slug}`), name: s.name })),
    },
  ];

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <Navbar />
      <section className="container py-12 sm:py-16">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">Boutiques en ligne au Sénégal</h1>
          <p className="text-muted-foreground">
            Les commerçants qui vendent avec Jaarle. Découvre leurs produits, avec les prix en FCFA, et commande directement sur WhatsApp.
          </p>
        </div>

        {cities.length > 0 && (
          <nav aria-label="Villes" className="mb-8 flex flex-wrap justify-center gap-2">
            {cities.map(([city, list]) => (
              <a key={city} href={`#${slugId(city)}`} className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium hover:bg-muted">
                {city} <span className="text-muted-foreground">({list.length})</span>
              </a>
            ))}
          </nav>
        )}

        {cities.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="mb-4 text-sm text-muted-foreground">Les premières boutiques arrivent bientôt.</p>
            <Button variant="accent" asChild>
              <Link href="/register">Créer ma boutique gratuitement</Link>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {cities.map(([city, list]) => (
              <section key={city} id={slugId(city)} className="scroll-mt-24">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
                  <MapPin className="h-5 w-5 text-primary" />
                  Boutiques à {city}
                </h2>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((s) => {
                    const logo = shopMediaUrl(s.logo_path);
                    return (
                      <li key={s.id}>
                        <Link href={`/boutique/${s.slug}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-sm font-bold text-primary">
                            {logo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={logo} alt={`Logo ${s.name}`} width={48} height={48} loading="lazy" className="h-full w-full object-contain" />
                            ) : (
                              shopInitials(s.name)
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{s.name}</span>
                            <span className="block truncate text-sm text-muted-foreground">{s.category_label ?? "Boutique"}</span>
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <Package className="h-3.5 w-3.5" /> {s.products} produits
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="mx-auto mt-14 max-w-2xl rounded-2xl bg-muted p-6 text-center">
          <h2 className="mb-2 text-lg font-bold">Tu es commerçant ?</h2>
          <p className="mb-4 text-sm text-muted-foreground">Crée ta boutique en ligne gratuitement et reçois tes commandes sur WhatsApp.</p>
          <Button variant="accent" asChild>
            <Link href="/register">Créer ma boutique gratuitement</Link>
          </Button>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function slugId(city: string): string {
  return `ville-${city
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}`;
}
