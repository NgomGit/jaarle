"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, Check, Coins, Copy, Gift, Loader2, Share2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/locale-context";
import { formatDateFr, formatFcfa } from "@/lib/billing/format";
import type { CreditPackRow, Entitlements, PlanRow } from "@/lib/billing/types";
import { cn } from "@/lib/utils";

export type HistoryItem =
  | { id: string; at: string; type: "order"; kind: string; amount: number; status: string }
  | { id: string; at: string; type: "ledger"; kind: string; delta: number; note: string | null };

type Quote = { price: number; regularPrice: number; promotionName: string | null; periodsLeft: number | null; promoMessage: string | null };

export function SubscriptionView(
  props:
    | { unavailable: true }
    | {
        unavailable?: false;
        entitlements: Entitlements;
        pro: PlanRow | null;
        proQuote: Quote | null;
        initialCode: string;
        packs: CreditPackRow[];
        history: HistoryItem[];
        referral: { code: string | null; link: string | null; count: number };
        pendingRef: string | null;
        canceled: boolean;
      }
) {
  const { t } = useLocale();
  if (props.unavailable) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-bold">{t("billing.pageTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("tarifs.unavailable")}</p>
      </div>
    );
  }
  const { entitlements: ent, pro, proQuote, packs, history, referral, pendingRef, canceled, initialCode } = props;
  const isPaid = ent.plan !== "free";

  return (
    <div className="mx-auto w-full max-w-3xl pb-24 md:pb-8">
      <h1 className="text-xl font-bold tracking-tight">{t("billing.pageTitle")}</h1>
      <p className="mb-5 text-sm text-muted-foreground">{t("billing.pageDesc")}</p>

      {pendingRef && <PaymentStatus refCommand={pendingRef} />}
      {canceled && (
        <p className="mb-4 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">{t("billing.paymentCanceled")}</p>
      )}

      {/* Offre actuelle + utilisation */}
      <section className="mb-5 rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-medium text-muted-foreground">{t("billing.currentPlan")}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-bold">Jaarle {ent.planName}</h2>
          {ent.isFounding && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
              <Award className="h-3.5 w-3.5" /> {t("billing.founding")}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {ent.subscription ? t("billing.activeUntil").replace("{date}", formatDateFr(ent.subscription.activeUntil)) : t("billing.freeForever")}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Meter
            label={t("billing.generationsLeft")}
            value={ent.monthlyGenerations == null ? t("billing.unlimited") : `${ent.remainingGenerations ?? 0} / ${ent.monthlyGenerations}`}
            ratio={ent.monthlyGenerations ? (ent.remainingGenerations ?? 0) / ent.monthlyGenerations : null}
            hint={t("billing.generationsHint").replace("{date}", formatDateFr(ent.periodEnd))}
          />
          <Meter
            label={t("billing.productsUsed")}
            value={ent.productsLimit == null ? `${ent.productsCount} · ${t("billing.unlimited")}` : `${ent.productsCount} / ${ent.productsLimit}`}
            ratio={ent.productsLimit ? 1 - ent.productsCount / ent.productsLimit : null}
          />
          <Meter label={t("billing.creditsLeft")} value={String(ent.credits)} ratio={null} hint={t("billing.creditsHint")} />
        </div>
      </section>

      {/* Passer à Pro / prolonger */}
      {pro && pro.is_purchasable && ent.plan !== "business" && (
        <UpgradeSection pro={pro} isPaid={isPaid} planName={ent.planName} quote={proQuote} initialCode={initialCode} />
      )}

      {/* Crédits */}
      {packs.length > 0 && (
        <section id="credits" className="mb-5 scroll-mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Coins className="h-4 w-4 text-primary" /> {t("billing.creditsTitle")}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("billing.creditsDesc")}</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {packs.map((p) => (
              <CreditPackButton key={p.key} pack={p} />
            ))}
          </div>
        </section>
      )}

      {/* Parrainage */}
      {referral.link && <ReferralCard code={referral.code!} link={referral.link} count={referral.count} />}

      {/* Historique */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-base font-bold">{t("billing.historyTitle")}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("billing.historyEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {history.map((h) => (
              <li key={`${h.type}-${h.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {h.type === "order" ? t(`billing.kind_${h.kind}`) : t(`billing.ledger_${h.kind}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateFr(h.at)}
                    {h.type === "order" ? ` · ${t(`billing.status_${h.status}`)}` : ""}
                  </p>
                </div>
                <span className={cn("shrink-0 font-mono text-sm font-semibold", h.type === "ledger" && h.delta > 0 && "text-success")}>
                  {h.type === "order" ? formatFcfa(h.amount) : `${h.delta > 0 ? "+" : ""}${h.delta} cr.`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Meter({ label, value, ratio, hint }: { label: string; value: string; ratio: number | null; hint?: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
      {ratio != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
        </div>
      )}
      {hint && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

async function startCheckout(body: Record<string, unknown>): Promise<string> {
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { redirectUrl?: string; error?: string };
  if (!res.ok || !data.redirectUrl) throw new Error(data.error || "Paiement indisponible.");
  return data.redirectUrl;
}

function UpgradeSection({
  pro,
  isPaid,
  planName,
  quote: initialQuote,
  initialCode,
}: {
  pro: PlanRow;
  isPaid: boolean;
  planName: string;
  quote: Quote | null;
  initialCode: string;
}) {
  const { t } = useLocale();
  const [code, setCode] = React.useState(initialCode);
  const [quote, setQuote] = React.useState<Quote | null>(initialQuote);
  const [applying, setApplying] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(initialQuote?.promoMessage ?? null);
  const price = quote?.price ?? pro.price_fcfa;
  const discounted = quote && quote.price < quote.regularPrice;

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", promoCode: code || null }),
      });
      const data = (await res.json()) as { quote?: Quote; error?: string };
      if (!res.ok || !data.quote) throw new Error(data.error || t("creation.errorGeneric"));
      setQuote(data.quote);
      if (data.quote.promoMessage) setError(data.quote.promoMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("creation.errorGeneric"));
    } finally {
      setApplying(false);
    }
  }

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      window.location.href = await startCheckout({ kind: "subscription", plan: "pro", promoCode: code || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("creation.errorGeneric"));
      setPaying(false);
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-primary/30 bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Sparkles className="h-4 w-4 text-primary" />
        {isPaid ? t("billing.renewTitle").replace("{plan}", planName) : t("billing.upgradeTitle")}
      </h2>
      {isPaid && <p className="text-sm text-muted-foreground">{t("billing.renewDesc")}</p>}

      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-mono text-3xl font-bold">{formatFcfa(price)}</span>
        <span className="text-sm text-muted-foreground">{t("billing.per30Days")}</span>
        {discounted && <span className="font-mono text-sm text-muted-foreground line-through">{formatFcfa(quote!.regularPrice)}</span>}
      </div>
      {discounted && quote?.promotionName && (
        <p className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
          <Gift className="h-3.5 w-3.5" />
          {t("billing.promoApplied")
            .replace("{name}", quote.promotionName)
            .replace("{price}", formatFcfa(quote.price))
            .replace("{months}", String(quote.periodsLeft ?? 1))}
        </p>
      )}

      {!isPaid && (
        <ul className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
          {pro.highlights.map((h) => (
            <li key={h} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              {h}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex gap-2">
        <label htmlFor="promo-code" className="sr-only">
          {t("billing.promoLabel")}
        </label>
        <Input
          id="promo-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
          placeholder={t("billing.promoPlaceholder")}
          maxLength={30}
          className="flex-1"
        />
        <Button variant="secondary" onClick={apply} disabled={applying || !code}>
          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : t("billing.promoApply")}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <Button variant="accent" size="lg" className="mt-4 w-full" onClick={pay} disabled={paying}>
        {paying && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("billing.payCta").replace("{price}", formatFcfa(price))}
      </Button>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" /> {t("billing.paySecure")}
      </p>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">{t("billing.noCommitment")}</p>
      <p className="mt-2 text-center">
        <Link href="/tarifs" className="text-xs font-semibold text-primary">
          {t("billing.seePlans")} →
        </Link>
      </p>
    </section>
  );
}

function CreditPackButton({ pack }: { pack: CreditPackRow }) {
  const { t } = useLocale();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function buy() {
    setBusy(true);
    setError(null);
    try {
      window.location.href = await startCheckout({ kind: "credits", pack: pack.key });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("creation.errorGeneric"));
      setBusy(false);
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-3.5 sm:flex-col sm:items-stretch sm:text-center">
      <div>
        <p className="text-sm font-bold">{pack.name}</p>
        <p className="font-mono text-sm text-muted-foreground">{formatFcfa(pack.price_fcfa)}</p>
        {pack.expires_days && <p className="text-[11px] text-muted-foreground">{t("billing.creditsValidity").replace("{days}", String(pack.expires_days))}</p>}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <Button variant="secondary" size="sm" onClick={buy} disabled={busy}>
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {t("billing.creditsBuy")}
      </Button>
    </div>
  );
}

function ReferralCard({ code, link, count }: { code: string; link: string; count: number }) {
  const { t } = useLocale();
  const [copied, setCopied] = React.useState(false);
  const message = t("billing.referralMessage").replace("{link}", link);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // presse-papiers indisponible
    }
  }
  return (
    <section className="mb-5 rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Share2 className="h-4 w-4 text-primary" /> {t("billing.referralTitle")}
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">{t("billing.referralDesc")}</p>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted px-3.5 py-2.5">
        <span className="text-xs text-muted-foreground">{t("billing.referralCode")}</span>
        <span className="font-mono text-sm font-bold tracking-wider">{code}</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">{link.replace(/^https?:\/\//, "")}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={copy}>
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? t("billing.referralCopied") : t("billing.referralCopy")}
        </Button>
        <Button variant="accent" asChild>
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            {t("billing.referralShare")}
          </a>
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("billing.referralCount").replace("{count}", String(count))}</p>
    </section>
  );
}

/** Après le retour de PayTech : on attend la confirmation (IPN) puis on rafraîchit la page. */
function PaymentStatus({ refCommand }: { refCommand: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [state, setState] = React.useState<"checking" | "paid" | "pending" | "failed">("checking");

  React.useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const supabase = createClient();
    async function poll() {
      if (cancelled) return;
      const { data } = await supabase.from("orders").select("status").eq("ref_command", refCommand).maybeSingle();
      if (data?.status === "paid") {
        setState("paid");
        router.refresh();
        return;
      }
      if (data?.status === "canceled" || data?.status === "failed") return setState("failed");
      attempts += 1;
      if (attempts >= 20) return setState("pending");
      setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [refCommand, router]);

  const text =
    state === "checking"
      ? t("billing.checking")
      : state === "paid"
        ? t("billing.paymentOk")
        : state === "failed"
          ? t("billing.paymentCanceled")
          : t("billing.paymentPending");
  return (
    <p
      className={cn(
        "mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm",
        state === "paid" ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground"
      )}
    >
      {state === "checking" && <Loader2 className="h-4 w-4 animate-spin" />}
      {state === "paid" && <Check className="h-4 w-4" />}
      {text}
    </p>
  );
}
