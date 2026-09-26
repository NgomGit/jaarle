"use client";

import * as React from "react";
import { WhatsAppIcon } from "@/components/storefront/whatsapp-icon";
import { cn } from "@/lib/utils";
import type { ProductOption } from "@/lib/shops/types";

/**
 * Choix des options (taille, couleur…) + bouton « Commander sur WhatsApp » (dans la page sur
 * ordinateur, barre fixe en bas sur mobile). Le lien passe par /r/wa/… qui compte le clic et
 * construit le message côté serveur. Couleurs : variables --sf-accent du template.
 */
export function ProductOrder({
  shopSlug,
  productSlug,
  productName,
  priceLabel,
  options,
  soldOut,
}: {
  shopSlug: string;
  productSlug: string;
  productName: string;
  priceLabel: string;
  options: ProductOption[];
  soldOut: boolean;
}) {
  const [selected, setSelected] = React.useState<Record<string, string>>({});
  // Lu après hydratation (sinon le lien rendu côté serveur et côté client diffère).
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => setSrc(new URLSearchParams(window.location.search).get("src")), []);

  const optionsLabel = options
    .filter((o) => selected[o.name])
    .map((o) => `${o.name} : ${selected[o.name]}`)
    .join(", ");
  const params = new URLSearchParams({ p: productSlug });
  if (optionsLabel) params.set("o", optionsLabel);
  if (src) params.set("src", src);
  const href = `/r/wa/${shopSlug}?${params.toString()}`;
  const label = soldOut ? "Demander la disponibilité" : "Commander sur WhatsApp";

  return (
    <>
      {options.length > 0 && (
        <div className="flex flex-col gap-5">
          {options.map((opt) => (
            <div key={opt.name}>
              <p className="mb-2.5 text-sm font-semibold text-gray-900">
                {opt.name}
                {selected[opt.name] && <span className="ml-1.5 font-normal text-gray-500">: {selected[opt.name]}</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {opt.values.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={selected[opt.name] === v}
                    onClick={() => setSelected((prev) => ({ ...prev, [opt.name]: prev[opt.name] === v ? "" : v }))}
                    className={cn(
                      "h-10 min-w-[48px] rounded-full px-4 text-sm font-medium transition-colors",
                      selected[opt.name] === v
                        ? "bg-[var(--sf-accent)] text-[var(--sf-accent-text)]"
                        : "bg-white text-gray-800 ring-1 ring-black/10 hover:ring-black/25"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ordinateur : bouton dans la page */}
      <a
        href={href}
        rel="nofollow"
        className="mt-7 hidden h-12 w-full items-center justify-center gap-2.5 rounded-full bg-[var(--sf-accent)] text-[15px] font-semibold text-[var(--sf-accent-text)] shadow-sm transition-transform hover:-translate-y-px sm:flex"
      >
        <WhatsAppIcon className="h-5 w-5" />
        {label}
      </a>

      {/* Mobile : barre fixe avec rappel du prix */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white/95 px-4 py-3 backdrop-blur-md sm:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-gray-500">{productName}</p>
            <p className="text-base font-bold text-gray-900">{priceLabel}</p>
          </div>
          <a
            href={href}
            rel="nofollow"
            className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-[var(--sf-accent)] px-5 text-[15px] font-semibold text-[var(--sf-accent-text)]"
          >
            <WhatsAppIcon className="h-5 w-5" />
            {soldOut ? "Demander" : "Commander"}
          </a>
        </div>
      </div>
    </>
  );
}
