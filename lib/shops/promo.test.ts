import { describe, expect, it } from "vitest";
import { activePromo, promoEndFromDay, promoEndLabel, promoInputError } from "@/lib/shops/promo";

describe("promo produit", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  it("calcule la remise", () => {
    expect(activePromo(12000, 15000, null, now)).toMatchObject({ oldPrice: 15000, percent: 20 });
  });
  it("ignore une promo absente, incohérente ou terminée", () => {
    expect(activePromo(12000, null, null, now)).toBeNull();
    expect(activePromo(15000, 15000, null, now)).toBeNull();
    expect(activePromo(null, 15000, null, now)).toBeNull();
    expect(activePromo(12000, 15000, "2026-10-08T11:59:59Z", now)).toBeNull();
    expect(activePromo(12000, 15000, "2026-10-09T23:59:59Z", now)).not.toBeNull();
  });
  it("date de fin = fin de journée à Dakar", () => {
    expect(promoEndFromDay("2026-10-12")).toBe("2026-10-12T23:59:59.000Z");
    expect(promoEndFromDay("12/10/2026")).toBeNull();
    expect(promoEndLabel("2026-10-12T23:59:59.000Z")).toMatch(/12 oct/);
  });
  it("valide la saisie", () => {
    expect(promoInputError(12000, null)).toBeNull();
    expect(promoInputError(12000, 15000)).toBeNull();
    expect(promoInputError(15000, 12000)).toMatch(/plus élevé/);
    expect(promoInputError(1000, 15000)).toMatch(/90 %/);
    expect(promoInputError(null, 15000)).toMatch(/prix promo/);
  });
});
