import { describe, expect, it } from "vitest";
import { usageUnits } from "@/lib/billing/usage";
import { bulkUploadFrom, bulkUploadLimits, canUseBulkUpload } from "@/lib/billing/features";

// Grille du 2026-10-12 (migration 0047) : 1 génération = 1 action IA visible.

describe("coût des actions", () => {
  it("affiche, nouvelle version, déblocage, pack Studio et import en lot = 1 génération", () => {
    expect(usageUnits("poster_generate", "gold")).toBe(1);
    expect(usageUnits("poster_generate", "premium")).toBe(1);
    expect(usageUnits("poster_unlock", "gold")).toBe(1);
    expect(usageUnits("poster_regenerate")).toBe(1);
    expect(usageUnits("studio_pack")).toBe(1);
    expect(usageUnits("bulk_import")).toBe(1);
  });
  it("restent inclus : fiche produit, variantes Studio, déclinaison", () => {
    expect(usageUnits("product_autofill")).toBe(0);
    expect(usageUnits("studio_regenerate")).toBe(0);
    expect(usageUnits("poster_declination")).toBe(0);
  });
});

describe("import en lot dans les droits", () => {
  it("lit plans.features.bulk_upload", () => {
    expect(bulkUploadFrom({ photos_per_lot: 30, videos_per_lot: 3 })).toEqual({ photosPerLot: 30, videosPerLot: 3 });
    expect(bulkUploadFrom({ photos_per_lot: 30 })).toEqual({ photosPerLot: 30, videosPerLot: 0 });
    expect(bulkUploadFrom(undefined)).toBeNull();
    expect(bulkUploadFrom({ photos_per_lot: 0 })).toBeNull();
    expect(bulkUploadFrom("oui")).toBeNull();
  });
  it("inclus seulement si la formule a des limites d'import", () => {
    expect(canUseBulkUpload({ billingEnabled: true, plan: "free", bulkUpload: null })).toBe(false);
    expect(canUseBulkUpload({ billingEnabled: true, plan: "pro", bulkUpload: { photosPerLot: 30, videosPerLot: 3 } })).toBe(true);
    // Pro / Business restent débloqués même si plans.features.bulk_upload manque en base.
    expect(canUseBulkUpload({ billingEnabled: true, plan: "pro", bulkUpload: null })).toBe(true);
    expect(canUseBulkUpload({ billingEnabled: true, plan: "business", bulkUpload: null })).toBe(true);
    expect(bulkUploadLimits({ billingEnabled: true, plan: "business", bulkUpload: null })).toEqual({ photosPerLot: 30, videosPerLot: 6 });
    expect(bulkUploadLimits({ billingEnabled: true, plan: "free", bulkUpload: null })).toBeNull();
  });
});
