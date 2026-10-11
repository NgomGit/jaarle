import { beforeEach, describe, expect, it, vi } from "vitest";

// Non-régression du contrat RPC du Market (market_products, migrations 0020 → 0046) et de la
// conversion des lignes en cartes : produit (1re photo) / service (affiche ou photo).
// Le client Supabase est simulé : aucun appel réseau.

const calls: { name: string; args: Record<string, unknown> }[] = [];
let responses: { data: unknown; error: unknown }[] = [];

// `cache` de React n'existe que côté serveur (react-server) : fonction identité ici.
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(fn: T) => fn }));

vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return responses.shift() ?? { data: [], error: null };
    },
    // withVideoFlags : best-effort, aucune vidéo.
    from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
  }),
}));

const { getMarketProducts } = await import("@/lib/market/queries");
const { getMarketCategory } = await import("@/lib/market/categories");

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.co";
process.env.NEXT_PUBLIC_SITE_URL = "https://jaarle.com";

const row = (over: Record<string, unknown> = {}) => ({
  id: "p1", slug: "robe-wax", name: "Robe wax", price: 15000, compare_at_price: null, promo_ends_at: null,
  status: "active", market_category: "robes", subject_type: "product", created_at: "2020-01-01T00:00:00Z",
  image_path: "u/products/a.webp", poster_key: null,
  shop_id: "s1", shop_slug: "awa-couture", shop_name: "Awa Couture", shop_city: "Dakar", shop_district: "Sacré-Cœur",
  shop_logo_path: null, shop_whatsapp: "+221770000001", shop_phone: null, is_pro: true, boosted: false, total_count: 1,
  ...over,
});

beforeEach(() => {
  calls.length = 0;
  responses = [];
});

describe("getMarketProducts — contrat de market_products", () => {
  it("appel de base : paramètres et valeurs par défaut inchangés", async () => {
    await getMarketProducts({});
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("market_products");
    expect(calls[0].args).toEqual({
      p_categories: null, p_city: null, p_shop: null, p_q: null, p_min: null, p_max: null,
      p_sort: "relevance", p_limit: 24, p_offset: 0, p_type: null,
    });
  });

  it("filtre par type : p_type = product | service", async () => {
    await getMarketProducts({ type: "product" });
    await getMarketProducts({ type: "service" });
    expect(calls.map((c) => c.args.p_type)).toEqual(["product", "service"]);
  });

  it("catégorie → clés de feuilles, ville, page, tri, prix", async () => {
    const cat = getMarketCategory("mode")!;
    await getMarketProducts({ category: cat, city: "dakar", page: 3, limit: 10, sort: "price_asc", min: 1000, max: 5000 });
    expect(calls[0].args).toMatchObject({
      p_categories: cat.leafKeys, p_city: "dakar", p_offset: 20, p_limit: 10, p_sort: "price_asc", p_min: 1000, p_max: 5000,
    });
  });

  it("paramètres 0028 / 0042 / 0046 envoyés seulement s'ils servent", async () => {
    await getMarketProducts({ available: true, qCategories: ["robes"], qGroups: ["robe"] });
    expect(calls[0].args).toMatchObject({ p_available: true, p_q_categories: ["robes"], p_q_groups: ["robe"] });
    calls.length = 0;
    await getMarketProducts({ promo: true, sort: "promo" });
    expect(calls[0].args).toMatchObject({ p_promo: true, p_sort: "promo" });
  });

  it("replis : sans p_q_groups puis appel de base si la base refuse", async () => {
    responses = [{ data: null, error: { message: "x" } }, { data: null, error: { message: "y" } }, { data: [row()], error: null }];
    const res = await getMarketProducts({ available: true, qGroups: ["robe"] });
    expect(calls).toHaveLength(3);
    expect(calls[1].args).not.toHaveProperty("p_q_groups");
    expect(calls[2].args).not.toHaveProperty("p_available");
    expect(res.total).toBe(1);
  });

  it("erreur définitive : liste vide, jamais d'exception", async () => {
    responses = [{ data: null, error: { message: "x" } }];
    await expect(getMarketProducts({})).resolves.toEqual({ items: [], total: 0 });
  });
});

describe("getMarketProducts — conversion des lignes", () => {
  it("produit : 1re photo, prix FCFA, lien fiche et WhatsApp (source market)", async () => {
    responses = [{ data: [row()], error: null }];
    const { items } = await getMarketProducts({});
    const p = items[0];
    expect(p.isService).toBe(false);
    expect(p.priceLabel).toBe("15 000 FCFA");
    expect(p.url).toBe("https://jaarle.com/boutique/awa-couture/p/robe-wax");
    expect(p.thumbUrl).toBe("https://db.example.co/storage/v1/object/public/shop-media/u/products/a_400.webp");
    expect(p.waHref).toBe("/r/wa/awa-couture?p=robe-wax&src=market");
    expect(p.shop.phoneHref).toBe("tel:+221770000001");
  });

  it("service avec affiche : image /affiche/{clé}, « À partir de » ou « Sur devis »", async () => {
    responses = [{ data: [row({ subject_type: "service", image_path: null, poster_key: "k1" }), row({ id: "p2", subject_type: "service", price: null, image_path: "u/x.webp" })], error: null }];
    const { items } = await getMarketProducts({});
    expect(items[0]).toMatchObject({ isService: true, priceLabel: "À partir de 15 000 FCFA", thumbUrl: "https://jaarle.com/affiche/k1", fullUrl: "https://jaarle.com/affiche/k1" });
    expect(items[1]).toMatchObject({ isService: true, priceLabel: "Sur devis" });
    expect(items[1].thumbUrl).toContain("/shop-media/u/x_400.webp");
  });
});
