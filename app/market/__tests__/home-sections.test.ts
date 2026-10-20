import { describe, expect, it, vi } from "vitest";

// M1 : les rangées « produits » de l'accueil du Market ne demandent que des produits ;
// la rangée Promos, la Sélection et les boutiques gardent leur comportement.

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(fn: T) => fn }));

// Polices next/font : chargées par le compilateur de Next uniquement.
vi.mock("next/font/google", () => {
  const font = () => ({ className: "", variable: "", style: {} });
  return { Bricolage_Grotesque: font, Manrope: font };
});

const productCalls: Record<string, unknown>[] = [];
vi.mock("@/lib/market/queries", async (orig) => {
  const real = await orig<typeof import("@/lib/market/queries")>();
  return {
    ...real,
    getMarketCounts: async () => [],
    getMarketProducts: async (q: Record<string, unknown>) => {
      productCalls.push(q);
      return { items: [], total: 0 };
    },
    getMarketShops: async () => ({ items: [], total: 0 }),
    getMarketBanners: async () => [],
    getProPicks: async () => [],
    getMarketPublicSettings: async () => ({ launchActive: false, launchLastDay: null, launchMinItems: 6, proMinItems: 3 }),
  };
});

const { default: MarketHome } = await import("@/app/market/page");

describe("accueil du Market — requêtes des rangées", () => {
  it("Nouveautés, Produits à Dakar, catalogue complet : type product ; Promos : inchangée", async () => {
    await MarketHome();
    expect(productCalls).toEqual([
      { sort: "new", limit: 8, type: "product" },
      { sort: "relevance", limit: 36, type: "product" },
      { city: "dakar", sort: "relevance", limit: 16, type: "product" },
      { promo: true, sort: "promo", limit: 12 },
    ]);
  });
});
