import { describe, expect, it, vi } from "vitest";
import type { ProductWithImages } from "@/lib/shops/products";
import type { Shop } from "@/lib/shops/types";

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(fn: T) => fn }));

const { toProductCard, toProductDetail } = await import("@/lib/storefront/view-models");
const { productDescription, productLd, productTitle } = await import("@/lib/seo");

// Non-régression : image principale (produit / service affiche / service photos), libellés,
// détail de fiche et données structurées Product / Service.

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.co";
process.env.NEXT_PUBLIC_SITE_URL = "https://jaarle.com";

const MEDIA = "https://db.example.co/storage/v1/object/public/shop-media";

function item(over: Partial<ProductWithImages> = {}): ProductWithImages {
  return {
    id: "p1", shop_id: "s1", owner_id: "o1", slug: "robe-wax", subject_type: "product", name: "Robe wax", description: null,
    price: 15000, compare_at_price: null, category: "Robes", options: [], status: "active", position: 0,
    ai_suggestions: null, source_creation_id: null, created_at: "2020-01-01T00:00:00Z", updated_at: "2020-01-01T00:00:00Z",
    product_images: [{ id: "i1", path: "u/a.webp", position: 0, width: null, height: null }, { id: "i2", path: "u/b.webp", position: 1, width: null, height: null }],
    product_video: null,
    ...over,
  };
}

const shop = { id: "s1", name: "Awa Couture", slug: "awa-couture", city: "Dakar" } as Shop;

describe("toProductCard / toProductDetail", () => {
  it("produit : 1re photo, prix, panier possible", () => {
    const c = toProductCard("awa-couture", item());
    expect(c).toMatchObject({ isService: false, priceLabel: "15 000 FCFA", hasPrice: true, thumbUrl: `${MEDIA}/u/a_400.webp`, fullUrl: `${MEDIA}/u/a.webp`, url: "https://jaarle.com/boutique/awa-couture/p/robe-wax" });
    expect(toProductDetail("awa-couture", item()).images).toEqual([`${MEDIA}/u/a.webp`, `${MEDIA}/u/b.webp`]);
  });
  it("service réglé sur l'affiche : l'affiche seule", () => {
    const s = item({ subject_type: "service", display_media: "poster" });
    expect(toProductCard("awa-couture", s, "k1")).toMatchObject({ isService: true, priceLabel: "À partir de 15 000 FCFA", fullUrl: "https://jaarle.com/affiche/k1" });
    expect(toProductDetail("awa-couture", s, "k1").images).toEqual(["https://jaarle.com/affiche/k1"]);
  });
  it("service réglé sur l'affiche sans affiche : la photo en attendant", () => {
    const s = item({ subject_type: "service", display_media: "poster" });
    expect(toProductCard("awa-couture", s, null).fullUrl).toBe(`${MEDIA}/u/a.webp`);
  });
  it("service réglé sur les photos : photos puis affiche", () => {
    const s = item({ subject_type: "service", display_media: "photos", price: null });
    expect(toProductCard("awa-couture", s, "k1")).toMatchObject({ priceLabel: "Sur devis", fullUrl: `${MEDIA}/u/a.webp` });
    expect(toProductDetail("awa-couture", s, "k1").images).toEqual([`${MEDIA}/u/a.webp`, `${MEDIA}/u/b.webp`, "https://jaarle.com/affiche/k1"]);
  });
});

describe("productLd", () => {
  const args = (p: ProductWithImages) => ({ shop, shopUrl: "https://jaarle.com/boutique/awa-couture", product: p, url: "https://jaarle.com/boutique/awa-couture/p/x", images: [] });
  it("produit avec prix → Product + Offer XOF", () => {
    const ld = productLd(args(item())) as Record<string, any>;
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers).toMatchObject({ price: 15000, priceCurrency: "XOF" });
  });
  it("produit sans prix → pas de Product", () => {
    expect(productLd(args(item({ price: null })))).toBeNull();
  });
  it("service → Service (même sans prix)", () => {
    const ld = productLd(args(item({ subject_type: "service", price: null }))) as Record<string, any>;
    expect(ld["@type"]).toBe("Service");
    expect(ld.offers).toBeUndefined();
  });
});

describe("titre et description de partage (M2)", () => {
  const full = { ...shop, city: "Dakar" } as Shop;
  it("produit : inchangé", () => {
    expect(productTitle(full, item())).toBe("Robe wax — 15 000 FCFA | Awa Couture");
    expect(productTitle(full, item({ price: null }))).toBe("Robe wax — Prix sur demande | Awa Couture");
    expect(productDescription(full, item())).toBe("Robe wax chez Awa Couture à Dakar — 15 000 FCFA. Commandez directement sur WhatsApp.");
  });
  it("service : « Sur devis » / « À partir de », réservation", () => {
    expect(productTitle(full, item({ subject_type: "service", price: null }))).toBe("Robe wax — Sur devis | Awa Couture");
    expect(productTitle(full, item({ subject_type: "service" }))).toBe("Robe wax — À partir de 15 000 FCFA | Awa Couture");
    expect(productDescription(full, item({ subject_type: "service", price: null }))).toBe("Robe wax chez Awa Couture à Dakar — Sur devis. Réservez directement sur WhatsApp.");
  });
  it("description saisie : reprise telle quelle", () => {
    expect(productDescription(full, item({ subject_type: "service", description: "Tresses à domicile." }))).toBe("Tresses à domicile.");
  });
});
