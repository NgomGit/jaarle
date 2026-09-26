import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { normalizeSource, recordShopEvent, visitorHash } from "@/lib/shops/tracking";
import type { ShopEventType } from "@/lib/shops/types";

// POST /api/track — balise envoyée par les pages publiques (vues boutique / produit, partages).
// Vérifie que la boutique est bien publiée (client anonyme + RLS) avant d'écrire quoi que ce soit.

// call_click : appel depuis la vitrine (compté dans le KPI « boutiques ayant reçu un contact »).
const ALLOWED: ShopEventType[] = ["shop_view", "product_view", "share_click", "call_click"];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    shopId?: string;
    productId?: string | null;
    type?: ShopEventType;
    source?: string | null;
  } | null;

  if (!body?.shopId || !body.type || !ALLOWED.includes(body.type)) {
    return new NextResponse(null, { status: 204 });
  }

  const supabase = createPublicClient();
  const { data: shop } = await supabase.from("shops").select("id").eq("id", body.shopId).maybeSingle();
  if (!shop) return new NextResponse(null, { status: 204 });

  let productId: string | null = null;
  if (body.productId) {
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("id", body.productId)
      .eq("shop_id", body.shopId)
      .maybeSingle();
    productId = product?.id ?? null;
  }

  await recordShopEvent({
    shopId: body.shopId,
    productId,
    type: body.type,
    source: normalizeSource(body.source),
    visitor: visitorHash(request),
    dedupeMinutes: body.type === "share_click" ? 0 : body.type === "call_click" ? 5 : 30,
  });

  return new NextResponse(null, { status: 204 });
}
