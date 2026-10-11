import { describe, expect, it } from "vitest";
import { ProductSuggestionSchema } from "@/lib/ai/product-autofill";

// M3 : une prestation peut recevoir une catégorie Market de services ; les clés hors liste restent refusées.

const base = { subjectType: "service", name: "Tresses", description: "", category: "Coiffure", industryKey: "none", keywords: [], attributes: [] };

describe("ProductSuggestionSchema.marketCategory", () => {
  it("accepte les feuilles des secteurs de services", () => {
    for (const key of ["salon-coiffure", "plomberie", "decoration-mariage", "location-son"]) {
      expect(ProductSuggestionSchema.safeParse({ ...base, marketCategory: key }).success).toBe(true);
    }
  });
  it("accepte « none » et les feuilles produits ; refuse une clé inconnue", () => {
    expect(ProductSuggestionSchema.safeParse({ ...base, marketCategory: "none" }).success).toBe(true);
    expect(ProductSuggestionSchema.safeParse({ ...base, subjectType: "product", marketCategory: "robes" }).success).toBe(true);
    expect(ProductSuggestionSchema.safeParse({ ...base, marketCategory: "categorie-inventee" }).success).toBe(false);
  });
});
