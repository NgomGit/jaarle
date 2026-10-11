import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(fn: T) => fn }));
process.env.NEXT_PUBLIC_SITE_URL = "https://jaarle.com";

const { productPublicUrl, whatsappMessage, whatsappUrl } = await import("@/lib/shops/public");
const { itemPriceLabel } = await import("@/lib/shops/posters");

// Non-régression des liens de partage et des messages WhatsApp (produit / service).

const shop = { name: "Awa Couture", slug: "awa-couture" };
const product = { name: "Robe wax", price: 15000, slug: "robe-wax", status: "active" as const, subject_type: "product" };
const service = { name: "Tresses", price: 5000, slug: "tresses", status: "active" as const, subject_type: "service" };

describe("liens publics", () => {
  it("URL d'une fiche", () => {
    expect(productPublicUrl("awa-couture", "robe-wax")).toBe("https://jaarle.com/boutique/awa-couture/p/robe-wax");
  });
  it("wa.me : chiffres seuls, message encodé", () => {
    expect(whatsappUrl("+221 77 000 00 01", "Bonjour & merci")).toBe("https://wa.me/221770000001?text=Bonjour%20%26%20merci");
  });
});

describe("libellés de prix", () => {
  it("produit / service", () => {
    expect(itemPriceLabel(15000, false)).toBe("15 000 FCFA");
    expect(itemPriceLabel(null, false)).toBe("Prix sur demande");
    expect(itemPriceLabel(5000, true)).toBe("À partir de 5 000 FCFA");
    expect(itemPriceLabel(null, true)).toBe("Sur devis");
  });
});

describe("whatsappMessage", () => {
  it("produit depuis la vitrine", () => {
    expect(whatsappMessage(shop, product)).toBe(
      "Bonjour, je suis intéressé(e) par le produit « Robe wax » à 15 000 FCFA. Je viens de voir votre boutique sur Jaarle : https://jaarle.com/boutique/awa-couture/p/robe-wax"
    );
  });
  it("produit épuisé, avec options", () => {
    expect(whatsappMessage(shop, { ...product, status: "sold_out" }, "Taille M")).toBe(
      "Bonjour, le produit « Robe wax » à 15 000 FCFA (Taille M) est-il de nouveau disponible ? Je viens de voir votre boutique sur Jaarle : https://jaarle.com/boutique/awa-couture/p/robe-wax"
    );
  });
  it("service : disponibilités et tarif", () => {
    expect(whatsappMessage(shop, service)).toBe(
      "Bonjour, je suis intéressé(e) par votre prestation « Tresses ». Pouvez-vous me donner vos disponibilités et le tarif ? Je viens de voir votre annonce sur Jaarle : https://jaarle.com/boutique/awa-couture/p/tresses"
    );
  });
  it("depuis le Market : produit et service", () => {
    expect(whatsappMessage(shop, product, null, true)).toContain("« Robe wax » vu sur Jaarle Market. Est-il toujours disponible ?");
    expect(whatsappMessage(shop, service, null, true)).toContain("votre prestation « Tresses » vue sur Jaarle Market. Quelles sont vos disponibilités ?");
  });
  it("boutique seule", () => {
    expect(whatsappMessage(shop, null)).toBe(
      "Bonjour Awa Couture, je viens de voir votre boutique sur Jaarle (https://jaarle.com/boutique/awa-couture) et j'aimerais avoir plus d'informations."
    );
  });
});
