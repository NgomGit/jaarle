import type { SubjectType } from "@/lib/shops/types";

// Règles du formulaire produit, sans React (testées dans lib/shops/__tests__/product-form-rules.test.ts).

/**
 * Type après une proposition de l'IA : la proposition ne s'applique qu'à la création et seulement
 * si le vendeur n'a pas choisi lui-même « Produit » ou « Service » (même règle au bouton « Réessayer »).
 */
export function typeAfterAiSuggestion(
  current: SubjectType,
  suggested: string | null | undefined,
  { isEdit, typeTouched }: { isEdit: boolean; typeTouched: boolean }
): SubjectType {
  if (isEdit || typeTouched) return current;
  return suggested === "service" ? "service" : "product";
}

/** Avertissement non bloquant : sans catégorie Market, l'annonce n'apparaît pas dans les pages catégorie. */
export function marketCategoryWarningKey(marketCategory: string | null | undefined): "products.marketCategoryMissing" | null {
  return marketCategory && marketCategory.trim() ? null : "products.marketCategoryMissing";
}
