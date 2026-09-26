import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { formatSenegalPhone, shopDisplayUrl } from "@/lib/shops/format";
import { shopInitials, shopMediaUrl } from "@/lib/shops/media";
import { toPngDataUri } from "@/lib/shops/og-images";
import { shopQrPng } from "@/lib/shops/qr";
import { resolveTheme } from "@/lib/storefront/view-models";
import { CardVisual, StatusVisual, type QrVisualData } from "@/lib/shops/qr-visuals";
import { getEntitlements } from "@/lib/billing/entitlements";
import { loadFonts, loadJaarleMark } from "@/lib/studio/visual";

// GET /api/shop-qr?format=png     → QR code seul (PNG 1024 px, emballage, sticker…)
// GET /api/shop-qr?format=card    → carte à imprimer 1080×1350 (comptoir, flyer)
// GET /api/shop-qr?format=status  → visuel vertical 1080×1920 à publier en statut WhatsApp / story
// Ajouter &inline=1 pour l'aperçu (sans téléchargement forcé).
// Les visuels reprennent la couleur de la boutique (logo) ; la signature Jaarle n'apparaît qu'en Gratuit.

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const shop = await getMyShop(supabase, user.id);
  if (!shop) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });

  const params = new URL(request.url).searchParams;
  const raw = params.get("format");
  const format = raw === "card" || raw === "status" ? raw : "png";
  const inline = params.get("inline") === "1";

  if (format === "png") {
    const png = await shopQrPng(shop.slug, 1024);
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="qr-${shop.slug}.png"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const [theme, qr, logo, fonts, ent] = await Promise.all([
    resolveTheme(shop),
    shopQrPng(shop.slug, 720).then((b) => `data:image/png;base64,${b.toString("base64")}`),
    toPngDataUri(shopMediaUrl(shop.logo_path), 200),
    loadFonts(),
    getEntitlements(),
  ]);
  const d: QrVisualData = {
    name: shop.name,
    city: shop.city,
    activity: shop.category_label,
    url: shopDisplayUrl(shop.slug),
    whatsapp: formatSenegalPhone(shop.whatsapp),
    qr,
    logo,
    initials: shopInitials(shop.name),
    theme,
    mark: ent.brandingBadge ? await loadJaarleMark() : null,
  };

  const size = format === "status" ? { width: 1080, height: 1920 } : { width: 1080, height: 1350 };
  const image = new ImageResponse(format === "status" ? <StatusVisual d={d} /> : <CardVisual d={d} />, {
    ...size,
    ...(fonts.length ? { fonts } : {}),
  });

  const filename = format === "status" ? `statut-${shop.slug}.png` : `carte-qr-${shop.slug}.png`;
  return new NextResponse(image.body, {
    headers: {
      "Content-Type": "image/png",
      ...(inline ? {} : { "Content-Disposition": `attachment; filename="${filename}"` }),
      "Cache-Control": "private, no-store",
    },
  });
}
