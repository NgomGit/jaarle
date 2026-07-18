import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestPaytechPayment, CAMPAIGN_PRICE_FCFA } from "@/lib/paytech";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = await request.json();
  const { photoPath, productName, price, style, industry, language } = body as {
    photoPath: string;
    productName: string;
    price: number;
    style: string;
    industry: string | null;
    language: string;
  };

  if (!photoPath || !productName || !price || !style) {
    return NextResponse.json({ error: "Champs manquants." }, { status: 400 });
  }

  const refCommand = `JAARLE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const { error: insertError } = await supabase.from("orders").insert({
    user_id: user.id,
    ref_command: refCommand,
    amount: CAMPAIGN_PRICE_FCFA,
    status: "pending",
    photo_path: photoPath,
    product_name: productName,
    price,
    style,
    industry: industry || null,
    language: language || "fr",
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const origin = new URL(request.url).origin;

  try {
    const redirectUrl = await requestPaytechPayment({
      itemName: "Campagne complète Jaarle",
      itemPrice: CAMPAIGN_PRICE_FCFA,
      refCommand,
      commandName: `Campagne pour "${productName}"`,
      successUrl: `${origin}/dashboard/new/confirm?ref=${refCommand}`,
      cancelUrl: `${origin}/dashboard/new?canceled=1`,
      ipnUrl: `${origin}/api/paytech/ipn`,
      customField: { userId: user.id, refCommand },
    });

    return NextResponse.json({ redirectUrl });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur PayTech." }, { status: 500 });
  }
}
