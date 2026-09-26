import { CalendarDays, MapPin, MessageCircle, Package, ShieldCheck } from "lucide-react";
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
        {/* En-tête de la boutique */}
        <section className="pt-4 sm:pt-6">
          {shop.bannerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.bannerUrl} alt="" className="mb-4 h-40 w-full rounded-3xl object-cover sm:h-64" />
          )}
          <div className="relative overflow-hidden rounded-3xl bg-[var(--sf-accent-soft)] p-5 sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--sf-accent)] opacity-[0.07]"
            />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
              <ShopLogo shop={shop} size={88} className="rounded-3xl shadow-sm" />
              <div className="min-w-0 flex-1">
                {shop.categoryLabel && (
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--sf-accent)]">
                    {shop.categoryLabel}
                  </p>
                )}
                <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-4xl">{shop.name}</h1>
                {shop.description && (
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-gray-600">{shop.description}</p>
                )}
                {meta.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {meta.map(({ Icon, label }) => (
                      <li
                        key={label}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-black/5"
                      >
                        <Icon className="h-3.5 w-3.5 text-gray-500" />
                        {label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="relative mt-6 flex flex-col gap-2.5 sm:flex-row">
              <WhatsAppCta href={shop.whatsappHref} className="sm:px-8" />
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
        </section>

        {/* Repères de confiance : uniquement des faits vrais pour toutes les boutiques */}
        <section className="my-6 grid gap-3 sm:grid-cols-3">
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

        {products.length > 0 ? (
          <Catalog shop={{ id: shop.id, slug: shop.slug, name: shop.name, phoneHref: shop.phoneHref }} products={products} />
        ) : (
          <p className="rounded-3xl border border-dashed border-black/10 bg-white px-6 py-12 text-center text-sm text-gray-500">
            Les produits arrivent bientôt. Écrivez au vendeur sur WhatsApp pour en savoir plus.
          </p>
        )}

        <HowToOrder shopName={shop.name} />
      </main>

      <StoreFooter shop={shop} />

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
    <section className="mt-14 rounded-3xl bg-white p-5 ring-1 ring-black/5 sm:p-8">
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
