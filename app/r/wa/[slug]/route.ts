import { NextResponse } from "next/server";
import { getPublicProduct, getPublicProducts, getPublicShop, whatsappMessage, whatsappUrl } from "@/lib/shops/public";
import { normalizeSource, recordShopEvent, visitorHash } from "@/lib/shops/tracking";
import { formatPrice, shopPublicUrl } from "@/lib/shops/format";

// GET /r/wa/{boutique}?p={produit}&o={options}&src={source}
// GET /r/wa/{boutique}?cart=[{"s":slug,"q":qté,"o":options}]&src=cart   (panier : plusieurs produits)
// Compte le clic WhatsApp (côté serveur : fiable même sans JavaScript) puis redirige vers wa.me
// avec un message pré-rempli construit ici — le visiteur ne peut pas injecter de texte arbitraire,
// et les prix sont ceux de la base, jamais ceux envoyés par le navigateur.

export const dynamic = "force-dynamic";

const clean = (s: unknown, max: number) =>
  typeof s === "string" ? s.replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").slice(0, max).trim() : "";

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const url = new URL(request.url);
  const shop = await getPublicShop(params.slug);
  if (!shop) return NextResponse.redirect(new URL("/", url), 302);

  const cartParam = url.searchParams.get("cart");
  if (cartParam) {
    const message = await cartMessage(shop, cartParam);
    if (message) {
      await recordShopEvent({
        shopId: shop.id,
        productId: null,
        type: "whatsapp_click",
        source: normalizeSource(url.searchParams.get("src") || "cart"),
        visitor: visitorHash(request),
      });
      return NextResponse.redirect(whatsappUrl(shop.whatsapp, message), 302);
    }
  }

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

/** Message de commande d'un panier : un produit par ligne (quantité, options, prix réel), puis le total. */
async function cartMessage(shop: { id: string; name: string; slug: string }, raw: string): Promise<string | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(0, 4000));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const products = await getPublicProducts(shop.id);
  const bySlug = new Map(products.map((p) => [p.slug, p]));

  const lines: string[] = [];
  let total = 0;
  let unknownPrice = false;
  for (const entry of parsed.slice(0, 20)) {
    const e = entry as { s?: unknown; q?: unknown; o?: unknown };
    const p = typeof e.s === "string" ? bySlug.get(e.s) : undefined;
    if (!p || p.status !== "active" || p.subject_type === "service") continue; // épuisé, masqué ou service : ignoré
    const qty = Math.min(20, Math.max(1, Math.floor(Number(e.q) || 1)));
    const options = clean(e.o, 80);
    const price = p.price != null ? `${formatPrice(p.price * qty)}` : "prix à confirmer";
    if (p.price != null) total += p.price * qty;
    else unknownPrice = true;
    lines.push(`${lines.length + 1}. ${p.name}${options ? ` (${options})` : ""} × ${qty} — ${price}`);
  }
  if (lines.length === 0) return null;

  return [
    `Bonjour ${shop.name}, je souhaite commander :`,
    "",
    ...lines,
    "",
    `Total : ${formatPrice(total)}${unknownPrice ? " + articles au prix à confirmer" : ""} (hors livraison)`,
    "",
    "Pouvez-vous me confirmer la disponibilité, la livraison et le paiement ?",
    `Je viens de votre boutique Jaarle : ${shopPublicUrl(shop.slug)}`,
  ].join("\n");
}
