import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { marketBody, marketDisplay } from "@/components/market/fonts";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import { formatPrice, shopPublicUrl } from "@/lib/shops/format";
import { shopInitials, shopMediaThumbUrl, shopMediaUrl } from "@/lib/shops/media";
import { formatOrderCode, getOrder, orderUrl } from "@/lib/shops/orders";
import { productPublicUrl } from "@/lib/shops/public";
import { cn } from "@/lib/utils";

// Reçu d'une commande envoyée depuis le panier d'une boutique (lien du message WhatsApp).
// Page privée par nature : non indexée, accessible seulement avec son code.

export const dynamic = "force-dynamic";

type Props = { params: { code: string } };

const articles = (n: number) => `${n} article${n > 1 ? "s" : ""}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const order = await getOrder(params.code.toUpperCase());
  if (!order) return { title: "Commande introuvable", robots: { index: false, follow: false } };
  const title = `Commande ${formatOrderCode(order.code)} — ${order.shop.name}`;
  const description = `${articles(order.item_count)} · Total ${formatPrice(order.total)}${order.has_unpriced ? " + prix à confirmer" : ""} (hors livraison)`;
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, url: orderUrl(order.code), siteName: "Jaarle", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function OrderReceiptPage({ params }: Props) {
  const code = params.code.toUpperCase();
  const order = await getOrder(code);
  if (!order) notFound();
  const { shop } = order;
  const logo = shopMediaUrl(shop.logo_path);
  const date = new Date(order.created_at).toLocaleString("fr-FR", {
    timeZone: "Africa/Dakar",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={cn(
        marketBody.variable,
        marketDisplay.variable,
        "min-h-screen bg-[#F3F1EA] px-4 py-8 font-[family-name:var(--font-market-body)] text-[#17151F] [color-scheme:light] sm:py-12"
      )}
    >
      <main className="mx-auto max-w-[560px]">
        <article className="overflow-hidden rounded-[28px] border border-[#E4E1D8] bg-white shadow-[0_12px_40px_-24px_rgba(23,21,31,0.35)]">
          <header className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" width={64} height={64} className="h-16 w-16 rounded-full border border-[#ECE9E1] object-cover" />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#17151F] font-[family-name:var(--font-market-display)] text-xl font-extrabold text-white">
                {shopInitials(shop.name)}
              </span>
            )}
            <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.12em] text-[#3F34C4]">Récapitulatif de commande</p>
            <h1 className="mt-1 font-[family-name:var(--font-market-display)] text-[28px] font-extrabold leading-tight tracking-[-0.02em]">
              {shop.name}
            </h1>
            <p className="mt-2 text-sm text-[#5E5A6B]">
              N° <span className="font-bold tracking-wider text-[#17151F]">{formatOrderCode(order.code)}</span> · {date}
            </p>
          </header>

          <div className="border-t-2 border-dashed border-[#E4E1D8]" />

          <ul className="divide-y divide-[#F0EDE6]">
            {order.items.map((item, i) => {
              const thumb = shopMediaThumbUrl(item.image_path) ?? shopMediaUrl(item.image_path);
              return (
                <li key={i} className="flex items-start gap-4 px-5 py-4 sm:px-6">
                  <span className="relative shrink-0">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" width={72} height={72} loading="lazy" className="h-[72px] w-[72px] rounded-2xl bg-[#F2F0EA] object-cover" />
                    ) : (
                      <span className="block h-[72px] w-[72px] rounded-2xl bg-[#F2F0EA]" />
                    )}
                    <span className="absolute -right-2 -top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-[#17151F] px-2 text-xs font-extrabold text-white ring-2 ring-white">
                      ×{item.qty}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link href={productPublicUrl(shop.slug, item.slug)} className="line-clamp-2 font-bold leading-snug hover:underline">
                      {item.name}
                    </Link>
                    {item.options && <span className="mt-0.5 block text-sm text-[#5E5A6B]">{item.options}</span>}
                    <span className="mt-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-sm text-[#5E5A6B]">
                        {item.qty} × {item.unit_price != null ? formatPrice(item.unit_price) : "prix à confirmer"}
                      </span>
                      <span className="shrink-0 font-extrabold">{item.unit_price != null ? formatPrice(item.unit_price * item.qty) : "—"}</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="border-t-2 border-dashed border-[#E4E1D8]" />

          <div className="px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between text-sm text-[#5E5A6B]">
              <span>Articles</span>
              <span className="font-bold text-[#17151F]">{articles(order.item_count)}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-4">
              <span className="font-bold">Total</span>
              <span className="font-[family-name:var(--font-market-display)] text-[28px] font-extrabold tracking-[-0.02em]">
                {formatPrice(order.total)}
              </span>
            </div>
            {order.has_unpriced && <p className="mt-1 text-right text-sm text-[#5E5A6B]">+ articles au prix à confirmer</p>}
            <p className="mt-4 rounded-2xl bg-[#F6F4EE] px-4 py-3 text-sm leading-relaxed text-[#4A4656]">
              Total hors livraison. La disponibilité, la livraison et le paiement se conviennent directement avec la boutique.
            </p>
          </div>
        </article>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <a
            href={`/r/wa/${shop.slug}?src=wa`}
            className="inline-flex h-[52px] items-center sm:flex-1 justify-center gap-2 rounded-full bg-[#0E7A4B] px-5 font-extrabold text-white hover:bg-[#0B6A41]"
          >
            <WhatsAppIcon className="h-5 w-5" />
            Contacter la boutique
          </a>
          <Link
            href={shopPublicUrl(shop.slug)}
            className="inline-flex h-[52px] items-center sm:flex-1 justify-center gap-2 rounded-full border-[1.5px] border-[#17151F] px-5 font-extrabold text-[#17151F] hover:bg-white"
          >
            <Store className="h-5 w-5" />
            Voir la boutique
          </Link>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-[#5E5A6B]">
          Prix au moment de la commande. Reçu généré par{" "}
          <Link href="/" className="font-bold text-[#4F43E0]">
            Jaarle
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
