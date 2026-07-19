import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestPaytechPayment } from "@/lib/paytech";
import { getTierConfig } from "@/lib/pricing";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { creationId } = (await request.json()) as { creationId: string };
  if (!creationId) {
    return NextResponse.json({ error: "Création manquante." }, { status: 400 });
  }

  const { data: creation, error: creationError } = await supabase
    .from("creations")
    .select("id, product_name, unlocked, tier")
    .eq("id", creationId)
    .eq("user_id", user.id)
    .single();

  if (creationError || !creation) {
    return NextResponse.json({ error: "Création introuvable." }, { status: 404 });
  }

  if (creation.unlocked) {
    return NextResponse.json({ error: "Cette création est déjà débloquée." }, { status: 400 });
  }

  const tierConfig = getTierConfig(creation.tier);
  const refCommand = `JAARLE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { error: insertError } = await supabase.from("orders").insert({
    user_id: user.id,
    ref_command: refCommand,
    amount: tierConfig.price,
    status: "pending",
    creation_id: creation.id,
    tier: creation.tier,
  });

  if (insertError) {
    console.error("[paytech/checkout] order insert failed:", insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const origin = new URL(request.url).origin;

  try {
    const redirectUrl = await requestPaytechPayment({
      itemName: `Affiche ${tierConfig.labelFr} Jaarle`,
      itemPrice: tierConfig.price,
      refCommand,
      commandName: `Déblocage de "${creation.product_name}"`,
      successUrl: `${origin}/dashboard/unlock?ref=${refCommand}`,
      cancelUrl: `${origin}/dashboard/creations?canceled=1`,
      ipnUrl: `${origin}/api/paytech/ipn`,
      customField: { userId: user.id, refCommand, creationId: creation.id },
    });

    return NextResponse.json({ redirectUrl });
  } catch (err) {
    console.error("[paytech/checkout] requestPaytechPayment failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur PayTech." }, { status: 500 });
  }
}
