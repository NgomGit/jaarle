import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { getMyShop } from "@/lib/shops/queries";
import { shopDisplayUrl } from "@/lib/shops/format";
import { shopInitials, shopMediaUrl } from "@/lib/shops/media";
import { toPngDataUri } from "@/lib/shops/og-images";
import { shopQrPng } from "@/lib/shops/qr";
import { resolveTheme } from "@/lib/storefront/view-models";

// GET /api/shop-qr?format=png  → QR code seul (PNG 1024 px, à coller sur un emballage, un sticker…)
// GET /api/shop-qr?format=card → carte prête à imprimer (logo, nom, QR, lien) pour comptoir / flyer

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const shop = await getMyShop(supabase, user.id);
  if (!shop) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });

  const format = new URL(request.url).searchParams.get("format") === "card" ? "card" : "png";

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

  const theme = await resolveTheme(shop);
  const [qr, logo] = await Promise.all([
    shopQrPng(shop.slug, 640).then((b) => `data:image/png;base64,${b.toString("base64")}`),
    toPngDataUri(shopMediaUrl(shop.logo_path), 160),
  ]);

  const card = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: "#FFFFFF", fontFamily: "sans-serif" }}>
        <div style={{ width: "100%", height: 300, background: theme.accent, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#FFFFFF" }}>
          <div style={{ width: 140, height: 140, borderRadius: 36, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontSize: 56, fontWeight: 800, color: theme.accent }}>
            {logo ? <img src={logo} width={120} height={120} style={{ objectFit: "contain" }} /> : shopInitials(shop.name)}
          </div>
          <div style={{ fontSize: 54, fontWeight: 800, marginTop: 22 }}>{shop.name}</div>
        </div>
        <div style={{ fontSize: 40, fontWeight: 700, color: "#111827", marginTop: 56 }}>Scannez pour voir nos produits</div>
        <div style={{ fontSize: 30, color: "#4B5563", marginTop: 12 }}>et commander directement sur WhatsApp</div>
        <div style={{ display: "flex", marginTop: 44, padding: 24, borderRadius: 36, border: "4px solid #E5E7EB" }}>
          <img src={qr} width={560} height={560} />
        </div>
        <div style={{ fontSize: 32, fontWeight: 700, color: theme.accent, marginTop: 40 }}>{shopDisplayUrl(shop.slug)}</div>
      </div>
    ),
    { width: 1080, height: 1380 }
  );

  return new NextResponse(card.body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="carte-qr-${shop.slug}.png"`,
      "Cache-Control": "private, no-store",
    },
  });
}
