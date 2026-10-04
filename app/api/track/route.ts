import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { normalizeSource, recordShopEvent, visitorHash } from "@/lib/shops/tracking";
import type { ShopEventType } from "@/lib/shops/types";

// POST /api/track — balise envoyée par les pages publiques (vues boutique / produit, partages).
// Vérifie que la boutique est bien publiée (client anonyme + RLS) avant d'écrire quoi que ce soit.

// call_click : appel depuis la vitrine (compté dans le KPI « boutiques ayant reçu un contact »).
// product_video_play : lecture d'une vidéo produit (migration 0035), une fois / visiteur / 30 min.
const ALLOWED: ShopEventType[] = ["shop_view", "product_view", "share_click", "call_click", "product_video_play"];

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
  // Une lecture vidéo n'a de sens que sur un produit visible de cette boutique.
  if (body.type === "product_video_play" && !productId) return new NextResponse(null, { status: 204 });

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
