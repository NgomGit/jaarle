import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicProduct, getPublicShop } from "@/lib/shops/public";
import { REPORT_REASONS } from "@/lib/shops/reports";
import { visitorHash } from "@/lib/shops/tracking";

// POST /api/reports — bouton « Signaler » des boutiques et produits (visiteurs, sans compte).
// Écriture avec la clé service_role (la table n'a aucune policy) après validation et anti-abus :
// au plus 5 signalements par visiteur et par jour, et 1 seul par boutique.

export const dynamic = "force-dynamic";

const Body = z.object({
  shopSlug: z.string().min(3).max(40),
  productSlug: z.string().min(1).max(80).nullish(),
  reason: z.enum(REPORT_REASONS.map((r) => r.key) as [string, ...string[]]),
  details: z.string().max(1000).nullish(),
  contact: z.string().max(120).nullish(),
  // Champ piège invisible : rempli uniquement par les robots.
  website: z.string().max(200).nullish(),
});

const MAX_PER_DAY = 5;

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Service indisponible." }, { status: 503 });
  }
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Signalement invalide." }, { status: 400 });
  }
  if (body.website) return NextResponse.json({ ok: true }); // robot : on ne dit rien

  const shop = await getPublicShop(body.shopSlug);
  if (!shop) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  const product = body.productSlug ? await getPublicProduct(shop.id, body.productSlug) : null;

  const visitor = visitorHash(request); // empreinte du jour, aucune IP stockée
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const [{ count: today }, { count: sameShop }] = await Promise.all([
    admin.from("shop_reports").select("id", { count: "exact", head: true }).eq("visitor_hash", visitor).gte("created_at", since),
    admin.from("shop_reports").select("id", { count: "exact", head: true }).eq("visitor_hash", visitor).eq("shop_id", shop.id).gte("created_at", since),
  ]);
  if ((sameShop ?? 0) > 0) return NextResponse.json({ ok: true, duplicate: true });
  if ((today ?? 0) >= MAX_PER_DAY) return NextResponse.json({ error: "Trop de signalements aujourd’hui. Réessayez demain." }, { status: 429 });

  const clean = (s: string | null | undefined) => s?.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim() || null;
  const { error } = await admin.from("shop_reports").insert({
    shop_id: shop.id,
    product_id: product?.id ?? null,
    reason: body.reason,
    details: clean(body.details),
    reporter_contact: clean(body.contact),
    visitor_hash: visitor,
  });
  if (error) {
    console.error("[reports] insert failed:", error.message);
    return NextResponse.json({ error: "Envoi impossible pour le moment." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
