"use client";

import * as React from "react";
import { Check, Share2 } from "lucide-react";
import { trackEvent } from "@/components/storefront/track-view";
import { cn } from "@/lib/utils";

/**
 * Partage natif du téléphone (WhatsApp, Instagram, SMS…) ; à défaut, copie du lien.
 * variant="icon" : bouton rond compact (en-tête).
 */
export function ShareButton({
  url,
  title,
  text,
  shopId,
  productId,
  className,
  label = "Partager",
  variant = "button",
}: {
  url: string;
  title: string;
  text: string;
  shopId: string;
  productId?: string;
  className?: string;
  label?: string;
  variant?: "button" | "icon";
}) {
  const [copied, setCopied] = React.useState(false);

  async function share() {
    trackEvent({ shopId, productId: productId ?? null, type: "share_click", source: "share" });
    const shareUrl = `${url}${url.includes("?") ? "&" : "?"}src=share`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
      } catch {
        // partage annulé
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`, "_blank", "noopener");
    }
  }

  const Icon = copied ? Check : Share2;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={share}
        aria-label={copied ? "Lien copié" : label}
        title={copied ? "Lien copié" : label}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-gray-800 transition-colors hover:bg-gray-50",
          className
        )}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={share}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-5 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50",
        className
      )}
    >
      <Icon className={cn("h-4 w-4", copied && "text-emerald-600")} />
      {copied ? "Lien copié" : label}
    </button>
  );
}
