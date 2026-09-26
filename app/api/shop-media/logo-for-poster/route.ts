import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { SHOP_MEDIA_BUCKET } from "@/lib/shops/types";

// Pont boutique → générateur d'affiches : copie le logo de la boutique (bucket public `shop-media`,
// WebP) dans le bucket privé `creations`, en PNG, et renvoie son chemin. Le générateur
// (/api/generate-creation) reçoit ce chemin comme n'importe quel logo uploadé : aucun changement
// de son code. PNG car l'analyse des couleurs du logo annonce le type image/png à l'IA.

export const runtime = "nodejs";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const shop = await getMyShop(supabase, user.id);
  if (!shop?.logo_path) return NextResponse.json({ error: "Aucun logo de boutique." }, { status: 404 });

  const { data: blob, error: downloadError } = await supabase.storage.from(SHOP_MEDIA_BUCKET).download(shop.logo_path);
  if (downloadError || !blob) {
    return NextResponse.json({ error: "Logo introuvable." }, { status: 404 });
  }

  let png: Buffer;
  try {
    png = await sharp(Buffer.from(await blob.arrayBuffer())).png().toBuffer();
  } catch {
    return NextResponse.json({ error: "Logo illisible." }, { status: 422 });
  }

  const path = `${user.id}/${Date.now()}-logo-boutique.png`;
  const { error: uploadError } = await supabase.storage.from("creations").upload(path, png, { contentType: "image/png" });
  if (uploadError) {
    console.error("[shop-media/logo-for-poster] upload failed:", uploadError);
    return NextResponse.json({ error: "Échec de la copie du logo." }, { status: 500 });
  }

  return NextResponse.json({ path });
}
