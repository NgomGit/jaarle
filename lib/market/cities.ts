import { SENEGAL_CITIES } from "@/lib/shops/cities";

// Villes du Market : la liste fermée de lib/shops/cities.ts. La ville saisie librement par une
// boutique est rapprochée d'une de ces villes par son slug (même règle que market_norm() en SQL).

/** Slug d'un texte — DOIT rester identique à public.market_norm() (migration 0020). */
export function slugify(text: string | null | undefined): string {
  const from = "àâäáãåéèêëíìîïóòôöõúùûüçñ";
  const to = "aaaaaaeeeeiiiiooooouuuucn";
  let out = "";
  for (const ch of (text ?? "").toLowerCase()) {
    const i = from.indexOf(ch);
    out += i >= 0 ? to[i] : ch;
  }
  return out.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface MarketCity {
  name: string;
  slug: string;
}

export const MARKET_CITIES: MarketCity[] = SENEGAL_CITIES.map((name) => ({ name, slug: slugify(name) }));

const BY_SLUG = new Map(MARKET_CITIES.map((c) => [c.slug, c]));

export function getMarketCity(slug: string | null | undefined): MarketCity | null {
  return (slug && BY_SLUG.get(slug)) || null;
}

/** Ville d'une boutique (texte libre) → ville du Market, si elle fait partie de la liste. */
export function cityFromText(text: string | null | undefined): MarketCity | null {
  return getMarketCity(slugify(text));
}
