import { describe, expect, it } from "vitest";
import { isListableOnMarket, marketScopeFilter, uncategorizedTitle, uncategorizedTotal } from "@/lib/admin/market";

// Étape 3 — P4 : compteur exact des annonces sans catégorie Market, annonces choisies à l'unité incluses.

describe("uncategorizedTotal", () => {
  it("additionne les lignes sans catégorie de market_counts (toutes villes)", () => {
    expect(
      uncategorizedTotal([
        { market_category: null, products: 12 },
        { market_category: null, products: "18" },
        { market_category: "robes", products: 40 },
      ])
    ).toBe(30);
  });
  it("aucune donnée : 0", () => {
    expect(uncategorizedTotal(null)).toBe(0);
    expect(uncategorizedTotal([])).toBe(0);
  });
});

describe("marketScopeFilter", () => {
  it("boutiques présentes OU annonces choisies à l'unité", () => {
    expect(marketScopeFilter(["s1", "s2"], ["p9"])).toBe("shop_id.in.(s1,s2),id.in.(p9)");
    expect(marketScopeFilter(["s1"], [])).toBe("shop_id.in.(s1)");
    expect(marketScopeFilter([], ["p9"])).toBe("id.in.(p9)");
    expect(marketScopeFilter([], [])).toBeNull();
  });
});

describe("isListableOnMarket", () => {
  it("produit avec photo, ou service ; produit sans photo exclu", () => {
    expect(isListableOnMarket({ subject_type: "product", product_images: [{}] })).toBe(true);
    expect(isListableOnMarket({ subject_type: "service", product_images: [] })).toBe(true);
    expect(isListableOnMarket({ subject_type: "product", product_images: [] })).toBe(false);
  });
});

describe("uncategorizedTitle", () => {
  it("total exact, plus jamais « 40+ »", () => {
    expect(uncategorizedTitle(30, 30)).toBe("Annonces sans catégorie Market (30)");
    expect(uncategorizedTitle(57, 40)).toBe("Annonces sans catégorie Market (40 affichées sur 57)");
    expect(uncategorizedTitle(0, 0)).toBe("Annonces sans catégorie Market (0)");
  });
});
