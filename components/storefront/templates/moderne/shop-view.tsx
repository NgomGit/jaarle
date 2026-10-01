import { CalendarDays, MapPin, MessageCircle, Package, ShieldCheck } from "lucide-react";
import { CartWidget } from "@/components/storefront/cart";
import { ShareButton } from "@/components/storefront/share-button";
import { TrackView } from "@/components/storefront/track-view";
import { Catalog } from "@/components/storefront/templates/moderne/catalog";
import { ShopLogo, StoreFooter, StoreHeader, WhatsAppCta, themeStyle } from "@/components/storefront/templates/moderne/parts";
import type { ShopViewProps } from "@/components/storefront/templates/types";

/** Template « Moderne » — page d'accueil de la boutique. */
export function ModerneShopView({ shop, products, theme }: ShopViewProps) {
  const meta = [
    shop.location && { Icon: MapPin, label: shop.location },
    shop.productCount > 0 && { Icon: Package, label: `${shop.productCount} article${shop.productCount > 1 ? "s" : ""}` },
    shop.onlineSince && { Icon: CalendarDays, label: `En ligne depuis ${shop.onlineSince}` },
  ].filter(Boolean) as { Icon: typeof MapPin; label: string }[];

  return (
    <div style={themeStyle(theme)} className="min-h-screen bg-[#F7F7F5] pb-24 text-gray-900 [color-scheme:light] sm:pb-0">
      <TrackView shopId={shop.id} type="shop_view" />
      <StoreHeader shop={shop} />

      <main className="mx-auto max-w-6xl px-4">
        {/* En-tête compact : sur mobile, les produits doivent apparaître dès l'arrivée sur la page.
            Les actions (WhatsApp, partage) restent accessibles via la barre du bas et l'en-tête. */}
        <section className="pt-3 sm:pt-6">
          {shop.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.bannerUrl} alt="" className="mb-3 h-28 w-full rounded-3xl object-cover sm:mb-4 sm:h-64" />
          )}
          <div className="relative overflow-hidden rounded-3xl bg-[var(--sf-accent-soft)] p-4 sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[var(--sf-accent)] opacity-[0.07] sm:-right-16 sm:-top-16 sm:h-56 sm:w-56"
            />
            <div className="relative flex items-center gap-4 sm:gap-7">
              <div className="sm:hidden">
                <ShopLogo shop={shop} size={64} className="rounded-2xl shadow-sm" />
              </div>
              <div className="hidden sm:block">
                <ShopLogo shop={shop} size={88} className="rounded-3xl shadow-sm" />
              </div>
              <div className="min-w-0 flex-1">
                {shop.categoryLabel && (
                  <p className="mb-0.5 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sf-accent)] sm:mb-1 sm:text-xs">
                    {shop.categoryLabel}
                  </p>
                )}
                <h1 className="text-[22px] font-bold leading-tight tracking-tight sm:text-4xl">{shop.name}</h1>
                {shop.description && (
                  <p className="mt-2 hidden max-w-2xl text-[15px] leading-relaxed text-gray-600 sm:block">{shop.description}</p>
                )}
              </div>
              <div className="hidden shrink-0 flex-col gap-2.5 sm:flex">
                <WhatsAppCta href={shop.whatsappHref} className="px-8" />
                <ShareButton
                  url={shop.url}
                  title={shop.name}
                  text={`Découvre la boutique ${shop.name} :`}
                  shopId={shop.id}
                  label="Partager la boutique"
                  className="h-12"
                />
              </div>
            </div>
            {shop.description && (
              <p className="relative mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600 sm:hidden">{shop.description}</p>
            )}
            {meta.length > 0 && (
              <ul className="relative -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:mt-5 sm:flex-wrap sm:px-0">
                {meta.map(({ Icon, label }) => (
                  <li
                    key={label}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-black/5"
                  >
                    <Icon className="h-3.5 w-3.5 text-gray-500" />
                    {label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Les produits d'abord : c'est ce que le client vient voir. */}
        <div className="mt-6 sm:mt-10">
          {products.length > 0 ? (
            <Catalog shop={{ id: shop.id, slug: shop.slug, name: shop.name, phoneHref: shop.phoneHref }} products={products} />
          ) : (
            <p className="rounded-3xl border border-dashed border-black/10 bg-white px-6 py-12 text-center text-sm text-gray-500">
              Les produits arrivent bientôt. Écrivez au vendeur sur WhatsApp pour en savoir plus.
            </p>
          )}
        </div>

        {/* Repères de confiance : uniquement des faits vrais pour toutes les boutiques */}
        <section className="mt-12 grid gap-3 sm:grid-cols-3">
          <Reassurance
            Icon={MessageCircle}
            title="Commande directe"
            text={`Vous échangez avec ${shop.name} sur WhatsApp, sans intermédiaire.`}
          />
          <Reassurance
            Icon={ShieldCheck}
            title="Aucun paiement sur ce site"
            text="Livraison et paiement se conviennent directement avec le vendeur."
          />
          <Reassurance
            Icon={MapPin}
            title={shop.city ? `Basé à ${shop.city}` : "Vendeur local"}
            text={shop.location ? `Adresse indiquée : ${shop.location}.` : "Demandez les détails de retrait ou de livraison."}
          />
        </section>

        <HowToOrder shopName={shop.name} />
      </main>

      <StoreFooter shop={shop} />
      <CartWidget shopSlug={shop.slug} shopName={shop.name} />

      {/* Action principale toujours accessible sur mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white/95 p-3 backdrop-blur-md sm:hidden">
        <WhatsAppCta href={shop.whatsappHref} className="w-full" />
      </div>
    </div>
  );
}

function Reassurance({ Icon, title, text }: { Icon: typeof MapPin; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--sf-accent-soft)] text-[var(--sf-accent)]">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-gray-500">{text}</p>
      </div>
    </div>
  );
}

function HowToOrder({ shopName }: { shopName: string }) {
  const steps = [
    { title: "Choisissez", text: "Parcourez les produits et ouvrez celui qui vous plaît." },
    { title: "Écrivez sur WhatsApp", text: "Le message est déjà prêt avec le produit, le prix et vos options." },
    { title: "Convenez des détails", text: `Disponibilité, livraison et paiement se règlent avec ${shopName}.` },
  ];
  return (
    <section className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-black/5 sm:p-8">
      <h2 className="text-lg font-bold tracking-tight sm:text-xl">Comment commander ?</h2>
      <ol className="mt-5 grid gap-5 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sf-accent)] text-sm font-bold text-[var(--sf-accent-text)]">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-gray-500">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
