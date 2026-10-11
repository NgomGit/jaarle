import { describe, expect, it } from "vitest";
import { getMarketCategory } from "@/lib/market/categories";
import { getMarketCity } from "@/lib/market/cities";
import { listingDescription, listingEmptyText, listingFaq, listingH1, listingIntro, listingKind, listingSectionTitle, listingTitle, parseListingParams } from "@/lib/market/seo";

// Non-régression des paramètres d'URL du Market et des textes SEO des pages PRODUITS.

describe("parseListingParams — URL partageables", () => {
  it("sans paramètre : page 1, pertinence, non filtrée", () => {
    expect(parseListingParams({})).toEqual({ page: 1, sort: "relevance", min: null, max: null, type: null, available: false, promo: false, filtered: false });
  });
  it("?type=produits|services → product|service, page filtrée (non indexée)", () => {
    expect(parseListingParams({ type: "produits" })).toMatchObject({ type: "product", filtered: true });
    expect(parseListingParams({ type: "services" })).toMatchObject({ type: "service", filtered: true });
    expect(parseListingParams({ type: "autre" })).toMatchObject({ type: null, filtered: false });
  });
  it("tri, prix, dispo, promo, page bornée", () => {
    expect(parseListingParams({ tri: "price_desc", min: "1000", max: "x", dispo: "1", promo: "1", page: "999" })).toEqual({
      page: 200, sort: "price_desc", min: 1000, max: null, type: null, available: true, promo: true, filtered: true,
    });
    expect(parseListingParams({ tri: "inconnu", page: "2" })).toMatchObject({ sort: "relevance", page: 2, filtered: false });
  });
});

describe("Textes SEO des pages produits (inchangés)", () => {
  const robes = getMarketCategory("mode")!;
  const dakar = getMarketCity("dakar")!;
  const t = { products: 12, shops: 3, minPrice: 5000 };

  it("H1", () => {
    expect(listingH1(null, null)).toBe("Tous les produits");
    expect(listingH1(robes, null)).toBe("Mode & tenues");
    expect(listingH1(robes, dakar)).toBe("Mode & tenues à Dakar");
    expect(listingH1(null, dakar)).toBe("Acheter à Dakar");
  });
  it("titre et intro", () => {
    expect(listingTitle(robes, dakar, t)).toBe("Mode & tenues à Dakar — 12 produits dès 5 000 FCFA | Jaarle Market");
    expect(listingIntro(robes, null, t)).toBe(
      "12 produits dans la catégorie « Mode & tenues » proposés par 3 boutiques au Sénégal, à partir de 5 000 FCFA. Prix en FCFA et commande directe sur WhatsApp."
    );
    expect(listingIntro(robes, dakar, { products: 0, shops: 0, minPrice: null })).toBe(
      "Aucun produit pour le moment dans « Mode & tenues » à Dakar. Les boutiques ajoutent régulièrement de nouveaux articles."
    );
    expect(listingDescription(robes, null, t).length).toBeLessThanOrEqual(158);
  });
  it("FAQ produits", () => {
    const faq = listingFaq(robes, dakar);
    expect(faq).toHaveLength(4);
    expect(faq[0].q).toBe("Comment commander dans « Mode & tenues » sur Jaarle Market ?");
    expect(faq[0].a).toContain("Commander sur WhatsApp");
  });
});

describe("Textes selon le contenu de la page (M4)", () => {
  const coiffure = getMarketCategory("services")!;
  const mariage = getMarketCategory("evenementiel")!;
  const immo = getMarketCategory("immobilier")!;
  const resto = getMarketCategory("restauration")!;
  const mode = getMarketCategory("mode")!;
  const dakar = getMarketCity("dakar")!;
  const t = { products: 3, shops: 2, minPrice: 5000 };

  it("type de page : catégorie, puis filtre ?type", () => {
    expect([mode, resto, coiffure, mariage, immo].map((c) => listingKind(c))).toEqual(["produit", "produit", "prestation", "prestation", "annonce"]);
    expect(listingKind(null)).toBe("produit");
    expect(listingKind(null, "service")).toBe("prestation");
    expect(listingKind(coiffure, "product")).toBe("produit");
  });

  it("services : prestations, prestataires, réservation", () => {
    expect(listingTitle(coiffure, null, t)).toBe("Services & artisans au Sénégal — 3 prestations dès 5 000 FCFA | Jaarle Market");
    expect(listingIntro(coiffure, dakar, t)).toBe(
      "3 prestations dans la catégorie « Services & artisans » proposées par 2 prestataires à Dakar, à partir de 5 000 FCFA. Tarifs en FCFA et réservation directe sur WhatsApp."
    );
    expect(listingIntro(mariage, null, { products: 0, shops: 0, minPrice: null })).toBe(
      "Aucune prestation pour le moment dans « Événementiel ». Les prestataires ajoutent régulièrement de nouvelles prestations."
    );
    expect(listingSectionTitle(coiffure, dakar)).toBe("Réserver : services & artisans à Dakar");
    expect(listingEmptyText(coiffure, true)).toBe("Aucune prestation ne correspond à ces filtres.");
    const faq = listingFaq(coiffure, null);
    expect(faq[0].q).toBe("Comment réserver une prestation dans « Services & artisans » sur Jaarle Market ?");
    expect(faq.map((f) => f.a).join(" ")).not.toMatch(/produit|Commander/);
  });

  it("immobilier : annonces, contact, prudence avant versement", () => {
    expect(listingIntro(immo, null, t)).toBe(
      "3 annonces dans la catégorie « Immobilier & locations » publiées par 2 annonceurs au Sénégal, à partir de 5 000 FCFA. Prix en FCFA et contact direct sur WhatsApp."
    );
    expect(listingSectionTitle(immo, null)).toBe("Annonces : immobilier & locations");
    expect(listingFaq(immo, null)[1].a).toContain("avant tout versement");
  });

  it("restauration et pages produits : textes inchangés", () => {
    expect(listingIntro(resto, null, t)).toBe(
      "3 produits dans la catégorie « Restauration & traiteur » proposés par 2 boutiques au Sénégal, à partir de 5 000 FCFA. Prix en FCFA et commande directe sur WhatsApp."
    );
    expect(listingSectionTitle(mode, dakar)).toBe("Acheter : mode & tenues à Dakar");
    expect(listingSectionTitle(null, dakar)).toBe("Commander à Dakar");
    expect(listingSectionTitle(null, null)).toBe("Commander à travers le Sénégal");
    expect(listingEmptyText(mode, false)).toBe("Les boutiques n’ont pas encore de produit dans cette sélection.");
    expect(listingTitle(null, dakar, t)).toBe("Boutiques et produits à Dakar — 3 produits dès 5 000 FCFA | Jaarle Market");
  });

  it("filtre ?type=services sur une page sans catégorie", () => {
    expect(listingH1(null, null, "service")).toBe("Tous les services");
    expect(listingH1(null, dakar, "service")).toBe("Services à Dakar");
    expect(listingH1(null, dakar, "product")).toBe("Acheter à Dakar");
  });
});
