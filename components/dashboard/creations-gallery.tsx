"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutGrid, Lock, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";
import type { Creation } from "@/lib/supabase/creations";

export function CreationsGallery({ creations: initialCreations, canceled }: { creations: Creation[]; canceled?: boolean }) {
  const { t } = useLocale();
  const router = useRouter();
  const [creations, setCreations] = React.useState(initialCreations);
  const [unlockingId, setUnlockingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  async function unlock(creationId: string) {
    setUnlockingId(creationId);
    try {
      const res = await fetch("/api/paytech/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creationId }),
      });
      const data = (await res.json()) as { redirectUrl?: string; error?: string };
      if (!res.ok || !data.redirectUrl) throw new Error(data.error);
      window.location.href = data.redirectUrl;
    } catch {
      setUnlockingId(null);
    }
  }

  async function deleteCreation(creationId: string) {
    if (!window.confirm(t("creation.deleteConfirm"))) return;
    setDeletingId(creationId);
    try {
      const res = await fetch(`/api/creations/${creationId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCreations((prev) => prev.filter((c) => c.id !== creationId));
    } catch {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-5 text-lg font-bold">{t("creation.galleryTitle")}</h1>

      {canceled && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {t("creation.paymentCanceled")}
        </p>
      )}

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
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/dashboard/creations/${c.id}`)}
              onKeyDown={(e) => e.key === "Enter" && router.push(`/dashboard/creations/${c.id}`)}
              className="relative aspect-[4/5] cursor-pointer overflow-hidden rounded-xl border border-border bg-muted"
            >
              {c.photoUrl && (
                <img
                  src={c.photoUrl}
                  alt={c.product_name}
                  loading="lazy"
                  className="h-full w-full select-none object-cover [-webkit-touch-callout:none]"
                  draggable={c.unlocked ? undefined : false}
                  onContextMenu={c.unlocked ? undefined : (e) => e.preventDefault()}
                  onDragStart={c.unlocked ? undefined : (e) => e.preventDefault()}
                />
              )}
              <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/60 to-transparent p-2">
                <div className="flex justify-between">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCreation(c.id);
                    }}
                    disabled={deletingId === c.id}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-destructive shadow-glow-sm disabled:opacity-60"
                    aria-label={t("creation.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  {c.unlocked ? (
                    <a
                      href={c.photoUrl ?? "#"}
                      download="affiche.jpg"
                      onClick={(e) => e.stopPropagation()}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-primary shadow-glow-sm"
                      aria-label={t("creation.download")}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        unlock(c.id);
                      }}
                      disabled={unlockingId === c.id}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-primary shadow-glow-sm disabled:opacity-60"
                      aria-label={t("creation.unlockDownload")}
                    >
                      <Lock className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
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
