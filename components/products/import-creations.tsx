"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { importCreationAsProduct } from "@/app/dashboard/produits/actions";
import { LimitDialog, type LimitReason } from "@/components/billing/upgrade-card";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/shop/shop-fields";
import { formatPrice } from "@/lib/shops/format";
import { useLocale } from "@/lib/locale-context";

export interface ImportableCreation {
  id: string;
  name: string;
  price: number | null;
}

/** Affiches déjà créées sur Jaarle, pas encore dans la boutique → produit brouillon en 1 tap. */
export function ImportCreations({ creations }: { creations: ImportableCreation[] }) {
  const { t } = useLocale();
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [limitReason, setLimitReason] = React.useState<LimitReason | null>(null);

  if (creations.length === 0) return null;

  async function importOne(id: string) {
    setBusyId(id);
    setError(null);
    const res = await importCreationAsProduct(id);
    setBusyId(null);
    if (!res.ok) {
      if (res.limit) setLimitReason(res.limit);
      return setError(res.error);
    }
    router.push(`/dashboard/produits/${res.id}?imported=1`);
  }

  return (
    <section className="mt-8 rounded-2xl border border-dashed border-border p-4 sm:p-5">
      <h2 className="text-sm font-semibold">{t("products.importTitle")}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t("products.importDesc")}</p>
      <ErrorNote message={error} className="mb-3" />
      <LimitDialog reason={limitReason} onClose={() => setLimitReason(null)} />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {creations.map((c) => (
          <li key={c.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/creations/${c.id}/preview`} alt="" loading="lazy" className="aspect-square w-full bg-muted object-cover" />
            <div className="flex flex-1 flex-col gap-2 p-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">{formatPrice(c.price)}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="mt-auto w-full"
                disabled={!!busyId}
                onClick={() => importOne(c.id)}
              >
                {busyId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                {busyId === c.id ? t("products.importing") : t("products.importCta")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
