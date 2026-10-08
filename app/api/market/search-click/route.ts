import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchKey } from "@/lib/market/search";

// Clics sur un résultat de recherche du Market (migration 0043). Aucune donnée personnelle.
// Facultatif : toute erreur est ignorée (table absente, données invalides).

const ACTIONS = ["open", "whatsapp", "call", "shop"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return new NextResponse(null, { status: 204 });
  try {
    const body = (await request.json()) as { q?: unknown; productId?: unknown; shopId?: unknown; position?: unknown; action?: unknown };
    const q = typeof body.q === "string" ? body.q.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    const qNorm = searchKey(q);
    const action = ACTIONS.find((a) => a === body.action);
    const productId = typeof body.productId === "string" && UUID.test(body.productId) ? body.productId : null;
    const shopId = typeof body.shopId === "string" && UUID.test(body.shopId) ? body.shopId : null;
    const position =
      typeof body.position === "number" && Number.isFinite(body.position) && body.position >= 1 && body.position <= 10000 ? Math.floor(body.position) : null;
    if (q.length < 2 || !qNorm || !action || !productId || !shopId) return new NextResponse(null, { status: 204 });

    const admin = createAdminClient();
    // Le produit doit exister et appartenir à cette boutique (pas de lignes inventées).
    const { data: product } = await admin.from("products").select("id").eq("id", productId).eq("shop_id", shopId).maybeSingle();
    if (!product) return new NextResponse(null, { status: 204 });

    await admin.from("market_search_clicks").insert({ q, q_norm: qNorm, product_id: productId, shop_id: shopId, position, action });
  } catch {
    // journal facultatif
  }
  return new NextResponse(null, { status: 204 });
}
