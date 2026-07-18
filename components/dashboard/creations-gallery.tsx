"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";
import type { Creation } from "@/lib/supabase/creations";

export function CreationsGallery({ creations }: { creations: Creation[] }) {
  const { t } = useLocale();

  return (
    <div>
      <h1 className="mb-5 text-lg font-bold">{t("creation.galleryTitle")}</h1>

      {creations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent">
            <LayoutGrid className="h-5 w-5 text-accent-foreground" strokeWidth={1.75} />
          </div>
          <p className="mb-1 text-sm font-semibold">{t("creation.galleryEmpty")}</p>
          <p className="mb-4 max-w-xs text-sm text-muted-foreground">{t("creation.galleryEmptyDesc")}</p>
          <Button variant="accent" asChild>
            <Link href="/dashboard/new">{t("dashboard.emptyCta")}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          {creations.map((c) => (
            <div key={c.id} className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-muted">
              {c.photoUrl && <img src={c.photoUrl} alt={c.product_name} className="h-full w-full object-cover" />}
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-2">
                <div>
                  <span className="block text-[10px] font-semibold text-white">{c.product_name}</span>
                  <span className="block font-mono text-[10px] text-white/80">{c.price.toLocaleString("fr-FR")} FCFA</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
