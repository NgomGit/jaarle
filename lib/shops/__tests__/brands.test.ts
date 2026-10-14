import { describe, expect, it } from "vitest";
import { brandsAllowedFor, stripBrandsFromName } from "@/lib/shops/brands";

describe("marques et véhicules", () => {
  it("garde la marque pour les véhicules et pièces auto", () => {
    expect(brandsAllowedFor("voitures")).toBe(true);
    expect(brandsAllowedFor("motos")).toBe(true);
    expect(brandsAllowedFor("utilitaires")).toBe(true);
    expect(brandsAllowedFor("pieces-detachees")).toBe(true);
    expect(brandsAllowedFor("location-voiture")).toBe(true);
  });

  it("retire toujours la marque ailleurs (mode, sans catégorie)", () => {
    expect(brandsAllowedFor(null)).toBe(false);
    expect(brandsAllowedFor("n-importe-quoi")).toBe(false);
    expect(stripBrandsFromName("Basket Nike Air Max blanche")).toBe("Basket blanche");
  });
});
