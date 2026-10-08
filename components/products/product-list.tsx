"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImageOff, Loader2, Megaphone, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { deleteProduct, setProductStatus } from "@/app/dashboard/produits/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/shops/format";
import { shopMediaThumbUrl, shopMediaUrl } from "@/lib/shops/media";
import type { ProductWithImages } from "@/lib/shops/products";
import type { ProductStatus } from "@/lib/shops/types";
import { useLocale } from "@/lib/locale-context";
import { activePromo } from "@/lib/shops/promo";

const STATUS_VARIANT: Record<ProductStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  sold_out: "warning",
  hidden: "neutral",
  draft: "neutral",
};

export function ProductList({ products, justSaved }: { products: ProductWithImages[]; justSaved: boolean }) {
  const { t } = useLocale();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("products.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {products.length > 0 ? t("products.count").replace("{n}", String(products.length)) : t("products.desc")}
          </p>
        </div>
        {products.length > 0 && (
          <Button variant="accent" asChild>
            <Link href="/dashboard/produits/nouveau">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t("products.add")}</span>
            </Link>
          </Button>
        )}
      </div>

      {justSaved && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-sm text-accent-foreground">
          <CheckCircle2 className="h-4 w-4" />
          {t("products.saved")}
        </p>
      )}

      {products.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
          <p className="mb-1 font-semibold">{t("products.emptyTitle")}</p>
          <p className="mb-5 max-w-xs text-sm text-muted-foreground">{t("products.emptyDesc")}</p>
          <Button variant="accent" size="lg" asChild>
            <Link href="/dashboard/produits/nouveau">
              <Plus className="h-4 w-4" />
              {t("products.add")}
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {products.map((p) => (
            <ProductRow key={p.id} product={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductRow({ product }: { product: ProductWithImages }) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const main = product.product_images[0];
  const thumb = main ? shopMediaThumbUrl(main.path) : null;
  const promo = activePromo(product.price, product.compare_at_price, product.promo_ends_at);

  async function toggleSoldOut() {
    setBusy(true);
    await setProductStatus(product.id, product.status === "sold_out" ? "active" : "sold_out");
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setBusy(true);
    await deleteProduct(product.id);
    setBusy(false);
    router.refresh();
  }

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5">
      <Link href={`/dashboard/produits/${product.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={(e) => {
                // miniature absente (ancienne photo) → photo originale
                const full = main ? shopMediaUrl(main.path) : null;
                if (full && e.currentTarget.src !== full) e.currentTarget.src = full;
              }}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageOff className="h-5 w-5" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{product.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatPrice(product.price)}
            {promo && <span className="ml-1.5 text-xs line-through">{promo.oldPriceLabel}</span>}
            {promo && <span className="ml-1.5 rounded-full bg-[#E5484D] px-1.5 py-0.5 text-[10px] font-bold text-white">-{promo.percent} %</span>}
          </p>
          {product.moderated_at ? (
            <Badge variant="destructive" className="mt-1 px-2 py-0.5 text-[10.5px]">
              {t("products.moderated")}
            </Badge>
          ) : (
            <Badge variant={STATUS_VARIANT[product.status]} className="mt-1 px-2 py-0.5 text-[10.5px]">
              {t(`products.status_${product.status}`)}
            </Badge>
          )}
        </div>
      </Link>

      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
        {!product.moderated_at && (product.status === "active" || product.status === "sold_out") && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={toggleSoldOut}>
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {product.status === "sold_out" ? t("products.markAvailable") : t("products.markSoldOut")}
          </Button>
        )}
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" asChild aria-label={t("products.createContent")} title={t("products.createContent")}>
            <Link href={`/dashboard/studio/${product.id}`}>
              <Megaphone className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild aria-label={t("products.createPoster")} title={t("products.createPoster")}>
            <Link href={`/dashboard/new?productId=${product.id}`}>
              <Sparkles className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild aria-label={t("products.edit")}>
            <Link href={`/dashboard/produits/${product.id}`}>
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant={confirmDelete ? "destructive" : "ghost"}
            size="sm"
            disabled={busy}
            onClick={remove}
            aria-label={confirmDelete ? t("products.deleteConfirm") : t("products.delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmDelete && <span className="text-[11px]">{t("products.deleteConfirm")}</span>}
          </Button>
        </div>
      </div>
    </li>
  );
}
