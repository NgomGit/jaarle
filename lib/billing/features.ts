import type { Entitlements } from "@/lib/billing/types";

// Lecture des fonctions incluses dans une formule (plans.features), sans dépendance serveur :
// testable avec Vitest et utilisable côté client.

/** plans.features.bulk_upload (0047) → limites par lot ; absent ou invalide = non inclus. */
export function bulkUploadFrom(v: unknown): Entitlements["bulkUpload"] {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const photos = typeof o.photos_per_lot === "number" && Number.isFinite(o.photos_per_lot) ? o.photos_per_lot : null;
  const videos = typeof o.videos_per_lot === "number" && Number.isFinite(o.videos_per_lot) ? o.videos_per_lot : 0;
  if (photos == null || photos <= 0) return null;
  return { photosPerLot: Math.floor(photos), videosPerLot: Math.max(0, Math.floor(videos)) };
}

/** Limites par défaut si plans.features.bulk_upload est absent (migration 0047 pas encore passée). */
export const DEFAULT_BULK_UPLOAD: Record<"pro" | "business", NonNullable<Entitlements["bulkUpload"]>> = {
  pro: { photosPerLot: 30, videosPerLot: 3 },
  business: { photosPerLot: 30, videosPerLot: 6 },
};

/**
 * Import en lot (Bulk Upload) : réservé Pro et Business. Décidé par la formule, pas seulement par
 * plans.features : un Pro reste débloqué même si la ligne du plan n'a pas encore bulk_upload.
 * Sans facturation active (migration absente), rien n'est bloqué, comme vidéo et promo.
 */
export function canUseBulkUpload(e: Pick<Entitlements, "bulkUpload" | "plan" | "billingEnabled">): boolean {
  if (!e.billingEnabled) return true;
  return e.plan !== "free" || e.bulkUpload != null;
}

/** Limites effectives d'un lot : celles du plan en base, sinon les valeurs par défaut de la formule. */
export function bulkUploadLimits(
  e: Pick<Entitlements, "bulkUpload" | "plan" | "billingEnabled">,
): Entitlements["bulkUpload"] {
  if (e.bulkUpload) return e.bulkUpload;
  if (!canUseBulkUpload(e)) return null;
  return e.plan === "business" ? DEFAULT_BULK_UPLOAD.business : DEFAULT_BULK_UPLOAD.pro;
}
