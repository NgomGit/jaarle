import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { PROMO_ERRORS, quotePlan } from "@/lib/billing/checkout";

// POST /api/billing/quote — { plan, promoCode? } → prix à payer (avec l'offre applicable).
const Body = z.object({ plan: z.string().max(30), promoCode: z.string().trim().max(30).optional().nullable() });

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const quote = await quotePlan(user.id, parsed.data.plan, parsed.data.promoCode);
  if (!quote.ok) return NextResponse.json({ error: quote.error }, { status: 400 });
  return NextResponse.json({ quote: { ...quote, promoMessage: quote.promoError ? PROMO_ERRORS[quote.promoError] ?? null : null } });
}
