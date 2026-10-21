"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { getWhatsappVerificationState, startWhatsappVerification } from "@/app/dashboard/boutique/whatsapp-actions";
import { Button } from "@/components/ui/button";
import { formatSenegalPhone } from "@/lib/shops/format";
import { formatVerificationCode } from "@/lib/whatsapp/verification";
import { useLocale } from "@/lib/locale-context";

// Carte « Vérifie ton WhatsApp » (migration 0049). Le vendeur ouvre WhatsApp avec un message pré-rempli
// contenant son code et l'envoie au numéro Jaarle ; la carte interroge le serveur jusqu'à la confirmation.

type Pending = { code: string; waLink: string; expiresAt: string };

export function WhatsappVerifyCard({ whatsapp, verified: initiallyVerified }: { whatsapp: string; verified: boolean }) {
  const { t } = useLocale();
  const router = useRouter();
  const [verified, setVerified] = React.useState(initiallyVerified);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Sur ordinateur : QR code du lien wa.me, à scanner avec le téléphone de la boutique.
  const [qrSvg, setQrSvg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!pending) {
      setQrSvg(null);
      return;
    }
    let cancelled = false;
    import("qrcode")
      .then((QRCode) =>
        QRCode.toString(pending.waLink, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111827", light: "#FFFFFF" } })
      )
      .then((svg) => !cancelled && setQrSvg(svg))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pending]);

  // Attente de la confirmation : toutes les 3 s tant que le code est valable.
  React.useEffect(() => {
    if (!pending || verified) return;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (Date.now() > new Date(pending.expiresAt).getTime()) {
        setPending(null);
        setError(t("shop.wa_expired"));
        return;
      }
      const state = await getWhatsappVerificationState().catch(() => null);
      if (stopped || !state) return;
      if (state.verified) {
        setVerified(true);
        setPending(null);
        router.refresh();
      } else if (state.lastRejection) {
        setPending(null);
        setError(t(`shop.wa_err_${state.lastRejection}`).replace("{phone}", formatSenegalPhone(whatsapp)));
      }
    };
    const id = window.setInterval(tick, 3000);
    // Retour sur l'onglet après WhatsApp : vérifier tout de suite.
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pending, verified, router, t, whatsapp]);

  async function start() {
    setLoading(true);
    setError(null);
    const res = await startWhatsappVerification().catch(() => ({ status: "error" as const }));
    setLoading(false);
    if (res.status === "pending") {
      setPending({ code: res.code, waLink: res.waLink, expiresAt: res.expiresAt });
      window.open(res.waLink, "_blank", "noopener");
    } else if (res.status === "already_verified") {
      setVerified(true);
      router.refresh();
    } else {
      setError(t(`shop.wa_err_${res.status}`));
    }
  }

  if (verified) {
    return (
      <section className="flex items-center gap-2.5 rounded-2xl border border-border bg-card p-4 text-sm">
        <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600" />
        <span>{t("shop.wa_verified").replace("{phone}", formatSenegalPhone(whatsapp))}</span>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-amber-300/60 bg-card p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("shop.wa_title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("shop.wa_desc").replace("{phone}", formatSenegalPhone(whatsapp))}</p>
        </div>
      </div>

      {pending ? (
        <div className="mt-4 rounded-xl bg-accent px-3 py-3 text-sm text-accent-foreground">
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("shop.wa_waiting")}
          </p>
          <p className="mt-1 text-xs">
            {t("shop.wa_waitingHint")} <span className="font-mono font-semibold">{formatVerificationCode(pending.code)}</span>
          </p>
          <Button asChild variant="secondary" size="sm" className="mt-3">
            <a href={pending.waLink} target="_blank" rel="noopener noreferrer">
              {t("shop.wa_reopen")}
            </a>
          </Button>

          {/* Ordinateur : la boutique est souvent sur le téléphone → QR code + saisie manuelle. */}
          <div className="mt-4 hidden items-center gap-4 border-t border-border/60 pt-4 md:flex">
            {qrSvg ? (
              <div
                role="img"
                aria-label={t("shop.wa_qrAlt")}
                className="h-32 w-32 shrink-0 rounded-lg bg-white p-1.5 [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-lg bg-white">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 text-xs leading-relaxed">
              <p className="font-semibold">{t("shop.wa_qrTitle")}</p>
              <p className="mt-1">{t("shop.wa_qrHint").replace("{phone}", formatSenegalPhone(whatsapp))}</p>
              {jaarleNumber(pending.waLink) && (
                <p className="mt-2">
                  {t("shop.wa_manual")
                    .replace("{code}", formatVerificationCode(pending.code))
                    .replace("{jaarle}", formatSenegalPhone(jaarleNumber(pending.waLink) as string))}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <Button onClick={start} disabled={loading} className="mt-4 w-full sm:w-auto">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {t("shop.wa_cta")}
        </Button>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}

/** Numéro Jaarle lu dans le lien wa.me (https://wa.me/221771911408?text=…). */
function jaarleNumber(waLink: string): string | null {
  const m = /wa\.me\/(\d{8,15})/.exec(waLink);
  return m ? `+${m[1]}` : null;
}
