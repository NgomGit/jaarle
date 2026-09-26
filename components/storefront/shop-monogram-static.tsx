import { shopInitials } from "@/lib/shops/media";

/** Logo (ou initiales) de la boutique, version serveur pour les pages publiques. */
export function ShopMonogramStatic({ name, logoUrl, size = 80 }: { name: string; logoUrl: string | null; size?: number }) {
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-gradient-to-br from-primary to-secondary font-bold text-white shadow-md"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={name} width={size} height={size} className="h-full w-full bg-white object-contain" />
      ) : (
        shopInitials(name)
      )}
    </div>
  );
}
