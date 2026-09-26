import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";
import { consumeUsage, limitPayload, refundUsage } from "@/lib/billing/consume";
import { usageUnits } from "@/lib/billing/usage";

// POST /api/billing/unlock-creation — { creationId }
// Débloque une affiche SANS paiement à l'unité : avec le quota de l'abonnement (Pro / Business)
// ou avec des crédits. Le déblocage par PayTech (/api/paytech/checkout) reste inchangé.

const Body = z.object({ creationId: z.string().uuid() });

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const { data: creation } = await supabase
    .from("creations")
    .select("id, tier, unlocked")
    .eq("id", parsed.data.creationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!creation) return NextResponse.json({ error: "Affiche introuvable." }, { status: 404 });
  if (creation.unlocked) return NextResponse.json({ ok: true });

  const ent = await getEntitlements();
  if (!ent.billingEnabled) return NextResponse.json({ error: "Indisponible." }, { status: 503 });
  // Le quota du mois ne débloque des affiches que si le plan l'inclut (Pro / Business) ; sinon crédits uniquement.
  const sources: ("quota" | "credits")[] = ent.posterUnlockIncluded ? ["quota", "credits"] : ["credits"];
  const usage = await consumeUsage({
    userId: user.id,
    action: "poster_unlock",
    units: usageUnits("poster_unlock", creation.tier as string),
    sources,
    creationId: creation.id as string,
  });
  if (!usage.ok) {
    if (usage.reason === "limit") return NextResponse.json(limitPayload("generations"), { status: 403 });
    return NextResponse.json({ error: "Déblocage impossible pour le moment." }, { status: 503 });
  }

  const { error } = await createAdminClient().from("creations").update({ unlocked: true }).eq("id", creation.id).eq("user_id", user.id);
  if (error) {
    await refundUsage(usage.eventId);
    return NextResponse.json({ error: "Déblocage impossible pour le moment." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, source: usage.source });
}
