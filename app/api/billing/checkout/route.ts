import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestPaytechPayment, withoutPaytechFee } from "@/lib/paytech";
import { PROMO_ERRORS, quotePlan } from "@/lib/billing/checkout";
import { formatFcfa } from "@/lib/billing/format";

// POST /api/billing/checkout
//   { kind: "subscription", plan: "pro", promoCode? }  → Jaarle Pro pour 30 jours (renouvellement manuel)
//   { kind: "credits", pack: "credits_5" }             → pack de crédits
// Réutilise l'intégration PayTech existante (paiement unique). L'activation est faite par l'IPN
// (/api/paytech/ipn → fulfill_order), jamais par le navigateur. La commande est créée avec la clé
// serveur : un utilisateur ne peut pas créer lui-même une commande d'abonnement (trigger SQL).

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("subscription"), plan: z.string().max(30), promoCode: z.string().trim().max(30).optional().nullable() }),
  z.object({ kind: z.literal("credits"), pack: z.string().max(40) }),
]);

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "Paiement indisponible." }, { status: 503 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const body = parsed.data;
  const admin = createAdminClient();

  let amount: number;
  let itemName: string;
  let commandName: string;
  let orderFields: Record<string, unknown>;
  let prefix: string;

  if (body.kind === "subscription") {
    const quote = await quotePlan(user.id, body.plan, body.promoCode);
    if (!quote.ok) return NextResponse.json({ error: quote.error }, { status: 400 });
    if (body.promoCode && quote.promoError) {
      return NextResponse.json({ error: PROMO_ERRORS[quote.promoError] ?? "Code invalide.", promoError: quote.promoError }, { status: 400 });
    }
    const { data: plan } = await admin.from("plans").select("name").eq("key", quote.planKey).single();
    amount = quote.price;
    itemName = `Jaarle ${plan?.name ?? "Pro"} — ${quote.periodDays} jours`;
    commandName = `Abonnement Jaarle ${plan?.name ?? "Pro"} (${formatFcfa(amount)})`;
    orderFields = { kind: "subscription", plan_key: quote.planKey, promotion_id: quote.promotionId };
    prefix = "SUB";
  } else {
    const { data: pack } = await admin.from("credit_packs").select("key, name, credits, price_fcfa").eq("key", body.pack).eq("is_active", true).maybeSingle();
    if (!pack) return NextResponse.json({ error: "Pack introuvable." }, { status: 404 });
    amount = pack.price_fcfa as number;
    itemName = `Jaarle — ${pack.name}`;
    commandName = `${pack.credits} crédits Jaarle`;
    orderFields = { kind: "credits", credit_pack_key: pack.key };
    prefix = "CRD";
  }

  const refCommand = `JAARLE-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { error: insertError } = await admin.from("orders").insert({
    user_id: user.id,
    ref_command: refCommand,
    amount,
    status: "pending",
    ...orderFields,
  });
  if (insertError) {
    console.error("[billing/checkout] order insert failed:", insertError.message);
    return NextResponse.json({ error: "Impossible de préparer le paiement." }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  try {
    const redirectUrl = await requestPaytechPayment({
      itemName,
      itemPrice: withoutPaytechFee(amount), // le client paie exactement `amount` (voir lib/paytech.ts)
      refCommand,
      commandName,
      successUrl: `${origin}/dashboard/abonnement?ref=${refCommand}`,
      cancelUrl: `${origin}/dashboard/abonnement?canceled=1`,
      ipnUrl: `${origin}/api/paytech/ipn`,
      customField: { userId: user.id, refCommand, kind: body.kind },
    });
    return NextResponse.json({ redirectUrl });
  } catch (err) {
    console.error("[billing/checkout] PayTech failed:", err);
    return NextResponse.json({ error: "Le paiement n'a pas pu démarrer. Réessaie." }, { status: 502 });
  }
}
