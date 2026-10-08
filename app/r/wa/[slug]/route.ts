import { NextResponse } from "next/server";
import { getPublicProduct, getPublicProducts, getPublicShop, whatsappMessage, whatsappUrl } from "@/lib/shops/public";
import { normalizeSource, recordShopEvent, visitorHash } from "@/lib/shops/tracking";
import { formatPrice, shopPublicUrl } from "@/lib/shops/format";
import { createOrder, orderUrl, toOrderItem, type OrderItem } from "@/lib/shops/orders";

// GET /r/wa/{boutique}?p={produit}&o={options}&src={source}
// GET /r/wa/{boutique}?cart=[{"s":slug,"q":qté,"o":options}]&src=cart   (panier : plusieurs produits)
//   → la commande est enregistrée (shop_orders) et le message contient le lien du reçu /recu/{code},
//     dont WhatsApp affiche l'aperçu (photos, quantités, total).
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
    const items = await cartItems(shop.id, cartParam);
    if (items.length > 0) {
      const source = normalizeSource(url.searchParams.get("src") || "cart");
      const visitor = visitorHash(request);
      const [code] = await Promise.all([
        createOrder({ shopId: shop.id, items, source, visitor }),
        recordShopEvent({ shopId: shop.id, productId: null, type: "whatsapp_click", source, visitor }),
      ]);
      return NextResponse.redirect(whatsappUrl(shop.whatsapp, cartMessage(shop, items, code)), 302);
    }
  }

  const productSlug = url.searchParams.get("p");
  const product = productSlug ? await getPublicProduct(shop.id, productSlug) : null;
  const optionsLabel = (url.searchParams.get("o") || "").replace(/[\r\n<>]/g, " ").slice(0, 80).trim() || null;

  const source = normalizeSource(url.searchParams.get("src"));
  await recordShopEvent({
    shopId: shop.id,
    productId: product?.id ?? null,
    type: "whatsapp_click",
    source,
    visitor: visitorHash(request),
  });

  const message = whatsappMessage(shop, product, optionsLabel, source === "market");
  const target = shop.whatsapp ? whatsappUrl(shop.whatsapp, message) : shopPublicUrl(shop.slug);
  return NextResponse.redirect(target, 302);
}

/** Lignes du panier, avec les vraies données de la base (épuisés, masqués et services ignorés). */
async function cartItems(shopId: string, raw: string): Promise<OrderItem[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(0, 4000));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const products = await getPublicProducts(shopId);
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const items: OrderItem[] = [];
  for (const entry of parsed.slice(0, 20)) {
    const e = entry as { s?: unknown; q?: unknown; o?: unknown };
    const p = typeof e.s === "string" ? bySlug.get(e.s) : undefined;
    if (!p || p.status !== "active" || p.subject_type === "service") continue;
    const qty = Math.min(20, Math.max(1, Math.floor(Number(e.q) || 1)));
    items.push(toOrderItem(p, qty, clean(e.o, 80)));
  }
  return items;
}

/**
 * Message de commande : un produit par ligne (quantité, options, prix réel), le total, puis le
 * lien du reçu — seul lien du message, pour que WhatsApp en affiche l'aperçu avec les photos.
 */
function cartMessage(shop: { name: string; slug: string }, items: OrderItem[], code: string | null): string {
  let total = 0;
  let unknownPrice = false;
  const lines = items.map((i, n) => {
    if (i.unit_price != null) total += i.unit_price * i.qty;
    else unknownPrice = true;
    const price =
      i.unit_price != null
        ? `${formatPrice(i.unit_price * i.qty)}${i.old_unit_price ? ` (promo, au lieu de ${formatPrice(i.old_unit_price * i.qty)})` : ""}`
        : "prix à confirmer";
    return `${n + 1}. ${i.name}${i.options ? ` (${i.options})` : ""} × ${i.qty} — ${price}`;
  });
  return [
    `Bonjour ${shop.name}, je souhaite commander :`,
    "",
    ...lines,
    "",
    `Total : ${formatPrice(total)}${unknownPrice ? " + articles au prix à confirmer" : ""} (hors livraison)`,
    "",
    "Pouvez-vous me confirmer la disponibilité, la livraison et le paiement ?",
    code ? `Récapitulatif avec photos : ${orderUrl(code)}` : `Je viens de votre boutique Jaarle : ${shopPublicUrl(shop.slug)}`,
  ].join("\n");
}
