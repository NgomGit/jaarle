// Slugs de boutique : jaarle.com/boutique/{slug}. Utilisable côté client ET serveur (aucune dépendance).
// Règles identiques aux contraintes SQL `shops_slug_format` / `shops_slug_reserved` (migration 0015).

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

// Garder synchronisé avec la contrainte shops_slug_reserved (0015_shops_products.sql).
export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "aide", "boutique", "boutiques", "catalogue", "compte", "connexion", "contact",
  "dashboard", "help", "inscription", "jaarle", "login", "new", "nouveau", "nouvelle", "p", "q", "r",
  "register", "settings", "static", "support", "www",
]);

/** « Awa Couture & Wax — Médina » → « awa-couture-wax-medina » */
export function slugify(input: string, maxLength = SLUG_MAX): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

export type SlugProblem = "too_short" | "too_long" | "invalid" | "reserved";

export function validateSlug(slug: string): SlugProblem | null {
  if (slug.length < SLUG_MIN) return "too_short";
  if (slug.length > SLUG_MAX) return "too_long";
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) || slug.includes("--")) return "invalid";
  if (RESERVED_SLUGS.has(slug)) return "reserved";
  return null;
}

/** Variante suffixée quand le slug est déjà pris : awa-couture → awa-couture-2, -3… */
export function withSuffix(slug: string, n: number): string {
  const suffix = `-${n}`;
  return `${slug.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`;
}

/** Slug de produit, unique dans une boutique (80 caractères max, cf. products_slug_format). */
export function productSlug(name: string): string {
  return slugify(name, 80) || "produit";
}

/** Normalisation pendant la frappe : comme slugify, mais garde un tiret final pour pouvoir en taper un. */
export function normalizeSlugInput(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX);
}
