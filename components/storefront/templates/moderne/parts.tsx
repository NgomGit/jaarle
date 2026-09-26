import Link from "next/link";
import { Instagram, Facebook, MapPin } from "lucide-react";
import { ShareButton } from "@/components/storefront/share-button";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import { shopInitials } from "@/lib/shops/media";
import type { StorefrontTheme } from "@/lib/storefront/theme";
import type { StorefrontShop } from "@/components/storefront/templates/types";
import { cn } from "@/lib/utils";

/** Variables CSS du thème de la boutique, posées sur la racine de la vitrine. */
export function themeStyle(theme: StorefrontTheme): React.CSSProperties {
  return {
    ["--sf-accent" as string]: theme.accent,
    ["--sf-accent-text" as string]: theme.accentText,
    ["--sf-accent-soft" as string]: theme.accentSoft,
  };
}

export function ShopLogo({ shop, size, className }: { shop: StorefrontShop; size: number; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-white font-bold ring-1 ring-black/5",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), color: "var(--sf-accent)" }}
    >
      {shop.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shop.logoUrl} alt={shop.name} width={size} height={size} className="h-full w-full object-contain p-[8%]" />
      ) : (
        shopInitials(shop.name)
      )}
    </div>
  );
}

export function StoreHeader({ shop, backToShop = false }: { shop: StorefrontShop; backToShop?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href={`/boutique/${shop.slug}`} className="flex min-w-0 items-center gap-2.5" aria-label={backToShop ? `Retour à ${shop.name}` : shop.name}>
          <ShopLogo shop={shop} size={34} className="rounded-xl" />
          <span className="truncate text-[15px] font-semibold text-gray-900">{shop.name}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <ShareButton variant="icon" url={shop.url} title={shop.name} text={`Découvre la boutique ${shop.name} :`} shopId={shop.id} />
          <a
            href={shop.whatsappHref}
            rel="nofollow"
            className="hidden h-9 items-center gap-2 rounded-full bg-[var(--sf-accent)] px-4 text-sm font-semibold text-[var(--sf-accent-text)] sm:inline-flex"
          >
            <WhatsAppIcon className="h-4 w-4" />
            Contacter
          </a>
        </div>
      </div>
    </header>
  );
}

export function WhatsAppCta({
  href,
  label = "Commander sur WhatsApp",
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      rel="nofollow"
      className={cn(
        "inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-[var(--sf-accent)] px-6 text-[15px] font-semibold text-[var(--sf-accent-text)] shadow-sm transition-transform hover:-translate-y-px active:translate-y-0",
        className
      )}
    >
      <WhatsAppIcon className="h-5 w-5" />
      {label}
    </a>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z" />
    </svg>
  );
}

export function StoreFooter({ shop }: { shop: StorefrontShop }) {
  const socials = [
    shop.socials.instagram && { href: shop.socials.instagram, label: "Instagram", Icon: Instagram },
    shop.socials.facebook && { href: shop.socials.facebook, label: "Facebook", Icon: Facebook },
    shop.socials.tiktok && { href: shop.socials.tiktok, label: "TikTok", Icon: TikTokIcon },
  ].filter(Boolean) as { href: string; label: string; Icon: React.ComponentType<{ className?: string }> }[];

  return (
    <footer className="mt-16 border-t border-black/5 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2">
        <div className="flex items-start gap-3.5">
          <ShopLogo shop={shop} size={48} className="rounded-2xl" />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{shop.name}</p>
            {shop.categoryLabel && <p className="text-sm text-gray-500">{shop.categoryLabel}</p>}
            {shop.location && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-600">
                <MapPin className="h-4 w-4 shrink-0" />
                {shop.location}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <a href={shop.whatsappHref} rel="nofollow" className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
            <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
            {shop.whatsappDisplay}
          </a>
          {socials.length > 0 && (
            <div className="flex gap-2">
              {socials.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-gray-700 hover:bg-gray-50"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Offre gratuite : mention Jaarle + lien d'inscription parrainé par ce commerçant (boucle virale). */}
      {shop.jaarleBadge && (
        <div className="border-t border-black/5 py-5 text-center text-xs text-gray-500">
          Boutique propulsée par{" "}
          <Link href="/?ref=boutique" className="font-semibold text-gray-800">
            Jaarle
          </Link>
          {" · "}
          <Link
            href={`/register?ref=${encodeURIComponent(shop.referralCode ?? "boutique")}`}
            className="font-medium text-gray-800 underline-offset-2 hover:underline"
          >
            Crée ta boutique gratuitement
          </Link>
        </div>
      )}
    </footer>
  );
}
