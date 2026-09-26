"use client";

import Link from "next/link";
import { ImageOff, Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";

export function StudioHome({ products }: { products: { id: string; name: string; priceLabel: string; thumbUrl: string | null }[] }) {
  const { t } = useLocale();
  return (
    <div className="mx-auto w-full max-w-4xl pb-24 sm:pb-6">
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Megaphone className="h-5 w-5 text-primary" />
          {t("studio.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("studio.homeDesc")}</p>
      </div>
      {products.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="mb-4 max-w-xs text-sm text-muted-foreground">{t("studio.homeEmpty")}</p>
          <Button variant="accent" asChild>
            <Link href="/dashboard/produits/nouveau">
              <Plus className="h-4 w-4" />
              {t("products.add")}
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/dashboard/studio/${p.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md"
              >
                <div className="aspect-square bg-muted">
                  {p.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-5 w-5" />
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.priceLabel}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <Megaphone className="h-3.5 w-3.5" />
                    {t("studio.createContent")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
