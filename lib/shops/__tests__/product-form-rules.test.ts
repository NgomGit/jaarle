import { describe, expect, it } from "vitest";
import fr from "@/lib/dictionaries/fr.json";
import en from "@/lib/dictionaries/en.json";
import { marketCategoryWarningKey, typeAfterAiSuggestion } from "@/lib/shops/product-form-rules";

// Étape 3 — P2 : l'IA ne remplace plus le type choisi à la main ; P3 : avertissement catégorie Market.

describe("typeAfterAiSuggestion (P2)", () => {
  it("choix manuel « Produit » : l'IA proposant « service » ne l'écrase pas (création et « Réessayer »)", () => {
    expect(typeAfterAiSuggestion("product", "service", { isEdit: false, typeTouched: true })).toBe("product");
  });
  it("choix manuel « Service » : conservé aussi", () => {
    expect(typeAfterAiSuggestion("service", "product", { isEdit: false, typeTouched: true })).toBe("service");
  });
  it("sans choix manuel : la proposition de l'IA s'applique (y compris une 2e proposition)", () => {
    expect(typeAfterAiSuggestion("product", "service", { isEdit: false, typeTouched: false })).toBe("service");
    expect(typeAfterAiSuggestion("service", "product", { isEdit: false, typeTouched: false })).toBe("product");
    expect(typeAfterAiSuggestion("service", undefined, { isEdit: false, typeTouched: false })).toBe("product");
  });
  it("modification d'une fiche existante : le type n'est jamais changé par l'IA", () => {
    expect(typeAfterAiSuggestion("product", "service", { isEdit: true, typeTouched: false })).toBe("product");
  });
});

describe("avertissement catégorie Market (P3)", () => {
  it("sans catégorie : avertissement", () => {
    expect(marketCategoryWarningKey("")).toBe("products.marketCategoryMissing");
    expect(marketCategoryWarningKey(null)).toBe("products.marketCategoryMissing");
    expect(marketCategoryWarningKey("  ")).toBe("products.marketCategoryMissing");
  });
  it("avec catégorie : aucun avertissement", () => {
    expect(marketCategoryWarningKey("robes")).toBeNull();
  });
  it("traductions FR / EN présentes ; l'aide ne parle plus de l'offre Pro", () => {
    for (const d of [fr, en] as { products: Record<string, string> }[]) {
      expect(d.products.marketCategoryMissing).toBeTruthy();
      expect(d.products.marketCategoryHint).toBeTruthy();
      expect(d.products.marketCategoryHint).not.toMatch(/pro\b/i);
    }
    expect(fr.products.marketCategoryMissing).toContain("reste publié");
    expect(en.products.marketCategoryMissing).toContain("stays published");
  });
});
