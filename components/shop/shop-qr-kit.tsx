"use client";

import * as React from "react";
import { Download, Loader2, Printer, QrCode, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";

/**
 * Kit QR de la boutique : un visuel vertical prêt pour le statut WhatsApp / la story (aperçu +
 * téléchargement + partage direct sur mobile), une carte à imprimer et le QR seul.
 */
export function ShopQrKit({ slug, isPublished }: { slug: string; isPublished: boolean }) {
  const { t } = useLocale();
  const [canShare, setCanShare] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement>(null);

  React.useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.canShare);
    if (imgRef.current?.complete) setLoaded(true);
  }, []);

  async function share() {
    setSharing(true);
    try {
      const res = await fetch("/api/shop-qr?format=status&inline=1");
      const blob = await res.blob();
      const file = new File([blob], `statut-${slug}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        window.location.href = "/api/shop-qr?format=status";
      }
    } catch {
      // partage annulé : rien à faire
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="relative mx-auto w-[168px] shrink-0 overflow-hidden rounded-2xl border border-border bg-muted shadow-sm sm:mx-0" style={{ aspectRatio: "9 / 16" }}>
          {!loaded && (
            <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </span>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src="/api/shop-qr?format=status&inline=1"
            alt={t("shop.qrStatusAlt")}
            onLoad={() => setLoaded(true)}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="flex-1">
          <h2 className="text-base font-semibold">{t("shop.qrKitTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("shop.qrKitDesc")}</p>
          {!isPublished && <p className="mt-1 text-xs text-muted-foreground">{t("shop.qrDraftNote")}</p>}

          <div className="mt-4 flex flex-col gap-2">
            {canShare ? (
              <Button variant="accent" size="lg" className="w-full" onClick={share} disabled={sharing}>
                {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                {t("shop.qrShareStatus")}
              </Button>
            ) : null}
            <Button variant={canShare ? "secondary" : "accent"} size="lg" className="w-full" asChild>
              <a href="/api/shop-qr?format=status" download>
                <Download className="h-4 w-4" />
                {t("shop.qrDownloadStatus")}
              </a>
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" asChild>
                <a href="/api/shop-qr?format=card" download>
                  <Printer className="h-4 w-4" />
                  {t("shop.qrCard")}
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="/api/shop-qr?format=png" download>
                  <QrCode className="h-4 w-4" />
                  {t("shop.qrOnly")}
                </a>
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("shop.qrKitHint")}</p>
        </div>
      </div>
    </section>
  );
}
