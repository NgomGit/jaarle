import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// Étape 3 — P4 : la page admin du Market interroge aussi les annonces choisies à l'unité et affiche
// le total exact (market_counts). Client Supabase simulé : aucune lecture ni écriture réelle.

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: async () => ({ userId: "admin" }) }));

const orFilters: string[] = [];
const rpcCalls: string[] = [];
const RPC: Record<string, unknown> = {
  market_shop_ids: [{ shop_id: "s1", is_pro: true }],
  admin_market_pick_candidates: [],
  market_pick_ids: [{ product_id: "p9", shop_id: "s2" }],
  market_counts: [
    { market_category: null, city: "dakar", products: 41, shop_ids: ["s1"], min_price: 1000 },
    { market_category: null, city: "thies", products: 2, shop_ids: ["s2"], min_price: 1000 },
    { market_category: "robes", city: "dakar", products: 10, shop_ids: ["s1"], min_price: 1000 },
  ],
};
const uncategorizedRows = Array.from({ length: 45 }, (_, i) => ({
  id: `p${i}`, name: `Annonce ${i}`, slug: `a-${i}`, shop_id: i === 0 ? "s2" : "s1", subject_type: "product", category: null,
  product_images: i === 1 ? [] : [{ path: `u/${i}.webp`, position: 0 }],
}));

function builder(table: string) {
  let isUncategorized = false;
  const b: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit", "in", "eq", "neq", "gte", "lte"]) b[m] = () => b;
  b.is = (col: string, v: unknown) => {
    if (col === "market_category" && v === null) isUncategorized = true;
    return b;
  };
  b.or = (f: string) => {
    orFilters.push(f);
    return b;
  };
  b.maybeSingle = async () => ({ data: table === "market_settings" ? { launch_until: null, launch_min_items: 6, pro_min_items: 3, updated_at: "" } : null, error: null });
  b.then = (resolve: (v: unknown) => void) =>
    resolve({ data: table === "products" && isUncategorized ? uncategorizedRows : table === "shops" ? [{ id: "s1", name: "Awa", slug: "awa", city: "Dakar" }, { id: "s2", name: "Bineta", slug: "bineta", city: "Thiès" }] : [], error: null });
  return b;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
    rpc: async (name: string) => {
      rpcCalls.push(name);
      return { data: RPC[name] ?? [], error: null };
    },
  }),
}));

const { default: AdminMarketPage } = await import("@/app/dashboard/admin/market/page");

function findTitles(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => findTitles(n, out));
    return out;
  }
  const el = node as ReactElement<{ title?: unknown; children?: unknown }>;
  if (typeof el.props?.title === "string") out.push(el.props.title);
  findTitles(el.props?.children, out);
  return out;
}

describe("page admin Market — annonces sans catégorie", () => {
  it("total exact (43), liste tronquée à 40, annonces choisies incluses", async () => {
    const page = await AdminMarketPage({ searchParams: {} });
    expect(rpcCalls).toEqual(expect.arrayContaining(["market_pick_ids", "market_counts"]));
    expect(orFilters).toContain("shop_id.in.(s1),id.in.(p9)");
    expect(findTitles(page)).toContain("Annonces sans catégorie Market (40 affichées sur 43)");
  });
});
