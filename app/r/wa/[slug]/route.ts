import { NextResponse } from "next/server";
import { getPublicProduct, getPublicShop, whatsappMessage, whatsappUrl } from "@/lib/shops/public";
import { normalizeSource, recordShopEvent, visitorHash } from "@/lib/shops/tracking";
import { shopPublicUrl } from "@/lib/shops/format";

// GET /r/wa/{boutique}?p={produit}&o={options}&src={source}
// Compte le clic WhatsApp (côté serveur : fiable même sans JavaScript) puis redirige vers wa.me
// avec un message pré-rempli construit ici — le visiteur ne peut pas injecter de texte arbitraire.

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const url = new URL(request.url);
  const shop = await getPublicShop(params.slug);
  if (!shop) return NextResponse.redirect(new URL("/", url), 302);

  const productSlug = url.searchParams.get("p");
  const product = productSlug ? await getPublicProduct(shop.id, productSlug) : null;
  const optionsLabel = (url.searchParams.get("o") || "").replace(/[\r\n<>]/g, " ").slice(0, 80).trim() || null;

  await recordShopEvent({
    shopId: shop.id,
    productId: product?.id ?? null,
    type: "whatsapp_click",
    source: normalizeSource(url.searchParams.get("src")),
    visitor: visitorHash(request),
  });

  const target = shop.whatsapp ? whatsappUrl(shop.whatsapp, whatsappMessage(shop, product, optionsLabel)) : shopPublicUrl(shop.slug);
  return NextResponse.redirect(target, 302);
}
