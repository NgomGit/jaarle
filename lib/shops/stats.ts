import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShopEventType } from "@/lib/shops/types";

// Statistiques simples de la boutique, calculées à partir de shop_events (RLS : propriétaire).
// Volontairement limitées à ce qui répond à « est-ce que ma boutique m'apporte des clients ? ».
// Si le volume grossit, remplacer ce calcul en mémoire par une vue SQL agrégée par jour.

export interface StatsTotals {
  visitors: number; // visiteurs uniques (empreinte du jour) sur la boutique ou un produit
  productViews: number;
  whatsappClicks: number;
  qrScans: number; // visites arrivées par le QR code
  shares: number;
  calls: number; // appels depuis la vitrine
}

export interface ShopStats {
  days: number;
  current: StatsTotals;
  previous: StatsTotals;
  topProducts: { productId: string; views: number; whatsappClicks: number }[];
  sources: { source: string; visits: number }[];
  eventCount: number;
}

interface EventRow {
  type: ShopEventType;
  product_id: string | null;
  source: string | null;
  visitor_hash: string | null;
  created_at: string;
}

const MAX_ROWS = 20000;

function totals(rows: EventRow[]): StatsTotals {
  const visitors = new Set<string>();
  let anonymousViews = 0;
  let productViews = 0;
  let whatsappClicks = 0;
  let qrScans = 0;
  let shares = 0;
  let calls = 0;
  for (const r of rows) {
    if (r.type === "shop_view" || r.type === "product_view") {
      if (r.visitor_hash) visitors.add(`${r.visitor_hash}|${r.created_at.slice(0, 10)}`);
      else anonymousViews++;
      if (r.source === "qr") qrScans++;
    }
    if (r.type === "product_view") productViews++;
    if (r.type === "whatsapp_click") whatsappClicks++;
    if (r.type === "share_click") shares++;
    if (r.type === "qr_scan") qrScans++;
    if (r.type === "call_click") calls++;
  }
  return { visitors: visitors.size + anonymousViews, productViews, whatsappClicks, qrScans, shares, calls };
}

export async function getShopStats(supabase: SupabaseClient, shopId: string, days: number): Promise<ShopStats> {
  const now = Date.now();
  const since = new Date(now - 2 * days * 86_400_000).toISOString();
  const { data } = await supabase
    .from("shop_events")
    .select("type, product_id, source, visitor_hash, created_at")
    .eq("shop_id", shopId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  const rows = (data ?? []) as EventRow[];

  const boundary = now - days * 86_400_000;
  const current = rows.filter((r) => new Date(r.created_at).getTime() >= boundary);
  const previous = rows.filter((r) => new Date(r.created_at).getTime() < boundary);

  const byProduct = new Map<string, { views: number; whatsappClicks: number }>();
  const bySource = new Map<string, number>();
  for (const r of current) {
    if (r.product_id && (r.type === "product_view" || r.type === "whatsapp_click")) {
      const entry = byProduct.get(r.product_id) ?? { views: 0, whatsappClicks: 0 };
      if (r.type === "product_view") entry.views++;
      else entry.whatsappClicks++;
      byProduct.set(r.product_id, entry);
    }
    if (r.type === "shop_view" || r.type === "product_view") {
      const key = r.source ?? "direct";
      bySource.set(key, (bySource.get(key) ?? 0) + 1);
    }
  }

  return {
    days,
    current: totals(current),
    previous: totals(previous),
    topProducts: Array.from(byProduct.entries())
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.views + b.whatsappClicks * 3 - (a.views + a.whatsappClicks * 3))
      .slice(0, 5),
    sources: Array.from(bySource.entries())
      .map(([source, visits]) => ({ source, visits }))
      .sort((a, b) => b.visits - a.visits),
    eventCount: current.length,
  };
}
