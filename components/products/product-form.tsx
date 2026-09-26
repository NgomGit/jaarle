"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Loader2, Megaphone, Plus, Sparkles, Star, Trash2, X } from "lucide-react";
import { saveProduct } from "@/app/dashboard/produits/actions";
import { LimitDialog, type LimitReason } from "@/components/billing/upgrade-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNote, Field } from "@/components/shop/shop-fields";
import { uploadShopMedia } from "@/lib/client-image";
import { shopMediaUrl } from "@/lib/shops/media";
import type { ProductWithImages } from "@/lib/shops/products";
import type { ProductStatus, SubjectType } from "@/lib/shops/types";
import type { ProductSuggestion } from "@/lib/ai/product-autofill";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 4;

interface PhotoSlot {
  key: string;
  url: string; // aperçu (URL locale pendant l'envoi, puis URL publique)
  path: string | null; // null tant que l'envoi n'est pas terminé
  width?: number | null;
  height?: number | null;
  error?: boolean;
}

interface OptionDraft {
  name: string;
  values: string;
}

type AiState = "idle" | "analyzing" | "done" | "error";
type AiField = "name" | "description" | "category";

/**
 * Formulaire produit « photo d'abord » : en création, la 1ʳᵉ photo déclenche l'analyse IA qui
 * propose nom / description / catégorie. Le commerçant vérifie, ajoute le prix, publie.
 */
export function ProductForm({ product, importedNote = false }: { product?: ProductWithImages | null; importedNote?: boolean }) {
  const { t } = useLocale();
  const router = useRouter();
  const isEdit = !!product;
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = React.useState<PhotoSlot[]>(
    (product?.product_images ?? []).map((img) => ({
      key: img.id,
      url: shopMediaUrl(img.path) ?? "",
      path: img.path,
      width: img.width,
      height: img.height,
    }))
  );
  const [subjectType, setSubjectType] = React.useState<SubjectType>(product?.subject_type ?? "product");
  const [name, setName] = React.useState(product?.name ?? "");
  const [price, setPrice] = React.useState(product?.price != null ? String(product.price) : "");
  const [priceOnRequest, setPriceOnRequest] = React.useState(isEdit && product?.price == null);
  const [description, setDescription] = React.useState(product?.description ?? "");
  const [category, setCategory] = React.useState(product?.category ?? "");
  const [options, setOptions] = React.useState<OptionDraft[]>(
    (product?.options ?? []).map((o) => ({ name: o.name, values: o.values.join(", ") }))
  );
  const [status, setStatus] = React.useState<ProductStatus>(product?.status ?? "active");
  const [aiState, setAiState] = React.useState<AiState>("idle");
  const [aiFilled, setAiFilled] = React.useState<Set<AiField>>(new Set());
  const [aiSuggestion, setAiSuggestion] = React.useState<ProductSuggestion | null>(null);
  const [saving, setSaving] = React.useState<null | "publish" | "draft" | "save">(null);
  const [error, setError] = React.useState<string | null>(null);
  const [limitReason, setLimitReason] = React.useState<LimitReason | null>(null);

  // Après la proposition IA, il ne reste que le prix à saisir : on y place le curseur.
  React.useEffect(() => {
    if (aiState === "done" && !isEdit) document.getElementById("product-price")?.focus();
  }, [aiState, isEdit]);

  const uploading = photos.some((p) => !p.path && !p.error);
  const readyPaths = photos.filter((p) => p.path).map((p) => p.path as string);
  const showForm = isEdit || photos.length > 0;

  // Champs modifiés à la main : l'IA ne les écrase plus.
  const touched = React.useRef<Set<AiField>>(new Set(isEdit ? ["name", "description", "category"] : []));

  async function analyze(paths: string[]) {
    if (paths.length === 0) return;
    setAiState("analyzing");
    try {
      const res = await fetch("/api/products/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });
      const data = (await res.json()) as { suggestion?: ProductSuggestion; error?: string };
      if (!res.ok || !data.suggestion) throw new Error(data.error);
      const s = data.suggestion;
      const filled = new Set<AiField>();
      if (!touched.current.has("name") || !name.trim()) {
        setName(s.name);
        filled.add("name");
      }
      if (!touched.current.has("description") || !description.trim()) {
        setDescription(s.description);
        filled.add("description");
      }
      if (!touched.current.has("category") || !category.trim()) {
        setCategory(s.category);
        filled.add("category");
      }
      if (!isEdit) setSubjectType(s.subjectType === "service" ? "service" : "product");
      setAiFilled(filled);
      setAiSuggestion(s);
      setAiState("done");
    } catch {
      setAiState("error");
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    const selected = Array.from(files).slice(0, room);
    const slots: PhotoSlot[] = selected.map((file) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url: URL.createObjectURL(file),
      path: null,
    }));
    const hadNoPhoto = photos.length === 0;
    setPhotos((prev) => [...prev, ...slots]);

    const results = await Promise.all(
      selected.map(async (file, i) => {
        try {
          const up = await uploadShopMedia(file, "product");
          setPhotos((prev) =>
            prev.map((p) => (p.key === slots[i].key ? { ...p, path: up.path, width: up.width, height: up.height } : p))
          );
          return up.path;
        } catch (err) {
          setPhotos((prev) => prev.map((p) => (p.key === slots[i].key ? { ...p, error: true } : p)));
          setError(err instanceof Error ? err.message : t("shop.errorGeneric"));
          return null;
        }
      })
    );

    // Création : la toute première série de photos déclenche la proposition IA.
    if (!isEdit && hadNoPhoto && aiState === "idle") {
      void analyze(results.filter((p): p is string => !!p));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(key: string) {
    setPhotos((prev) => prev.filter((p) => p.key !== key));
  }

  function makeMain(key: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.key === key);
      return target ? [target, ...prev.filter((p) => p.key !== key)] : prev;
    });
  }

  function markTouched(field: AiField) {
    touched.current.add(field);
    setAiFilled((prev) => {
      if (!prev.has(field)) return prev;
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  async function submit(nextStatus: ProductStatus, mode: "publish" | "draft" | "save") {
    setError(null);
    if (readyPaths.length === 0) return setError(t("products.needPhoto"));
    if (!priceOnRequest && price.trim() === "") return setError(t("products.needPrice"));
    setSaving(mode);
    const res = await saveProduct(
      {
        subjectType,
        name,
        price: priceOnRequest ? null : Number(price.replace(/\D/g, "")),
        description,
        category,
        status: nextStatus,
        options: options
          .map((o) => ({
            name: o.name.trim(),
            values: o.values
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          }))
          .filter((o) => o.name && o.values.length > 0),
        images: photos
          .filter((p) => p.path)
          .map((p) => ({ path: p.path as string, width: p.width ?? null, height: p.height ?? null })),
        aiSuggestions: aiSuggestion ? (aiSuggestion as unknown as Record<string, unknown>) : undefined,
      },
      product?.id
    );
    setSaving(null);
    if (!res.ok) {
      if (res.limit) setLimitReason(res.limit);
      return setError(res.error);
    }
    router.push("/dashboard/produits?saved=1");
    router.refresh();
  }

  const AiHint = ({ field }: { field: AiField }) =>
    aiFilled.has(field) ? (
      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 align-middle text-[10px] font-semibold text-accent-foreground">
        <Sparkles className="h-2.5 w-2.5" />
        {t("products.aiBadge")}
      </span>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-xl pb-24 sm:pb-6">
      <Link
        href="/dashboard/produits"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("products.back")}
      </Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">{isEdit ? t("products.editTitle") : t("products.newTitle")}</h1>
        {isEdit && product && (
          <div className="flex flex-wrap gap-2">
            <Button variant="accent" size="sm" asChild>
              <Link href={`/dashboard/studio/${product.id}`}>
                <Megaphone className="h-3.5 w-3.5" />
                {t("products.createContent")}
              </Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/dashboard/new?productId=${product.id}`}>
                <Sparkles className="h-3.5 w-3.5" />
                {t("products.createPoster")}
              </Link>
            </Button>
          </div>
        )}
      </div>
      {importedNote && (
        <p className="mb-4 rounded-xl bg-accent px-3.5 py-3 text-sm text-accent-foreground">{t("products.importedNote")}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void addFiles(e.target.files)}
      />

      {/* Photo d'abord */}
      {photos.length === 0 ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-accent/40 px-6 py-12 text-center transition-colors hover:bg-accent"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white">
            <Camera className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <span className="text-base font-semibold">{t("products.photoFirstTitle")}</span>
          <span className="max-w-xs text-sm text-muted-foreground">{t("products.photoFirstDesc")}</span>
          <span className="mt-1 rounded-xl bg-gradient-to-br from-primary to-secondary px-5 py-2.5 text-sm font-semibold text-white">
            {t("products.photoPick")}
          </span>
        </button>
      ) : (
        <div className="mb-2">
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div key={p.key} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className={cn("h-full w-full object-cover", !p.path && "opacity-60")} />
                {!p.path && !p.error && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-white drop-shadow" />
                  </span>
                )}
                {i === 0 ? (
                  <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {t("products.photoMain")}
                  </span>
                ) : (
                  p.path && (
                    <button
                      type="button"
                      onClick={() => makeMain(p.key)}
                      aria-label={t("products.photoMakeMain")}
                      className="absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => removePhoto(p.key)}
                  aria-label={t("products.photoRemove")}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-input text-xs text-muted-foreground hover:bg-muted"
              >
                <Plus className="h-5 w-5" />
                {t("products.photoAdd")}
              </button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t("products.photosHint")}</p>
        </div>
      )}

      {/* État de l'IA */}
      {aiState === "analyzing" && (
        <div className="my-4 flex items-center gap-2 rounded-xl bg-accent px-3.5 py-3 text-sm text-accent-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("products.aiAnalyzing")}
        </div>
      )}
      {aiState === "done" && aiFilled.size > 0 && (
        <div className="my-4 flex items-center gap-2 rounded-xl bg-accent px-3.5 py-3 text-sm text-accent-foreground">
          <Sparkles className="h-4 w-4 shrink-0" />
          {t("products.aiDone")}
        </div>
      )}
      {aiState === "error" && (
        <p className="my-4 rounded-xl border border-border bg-muted px-3.5 py-3 text-sm text-muted-foreground">
          {t("products.aiError")}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(isEdit ? status : "active", isEdit ? "save" : "publish");
          }}
          className="mt-4 flex flex-col gap-5"
        >
          {(isEdit || aiState === "error" || aiState === "done") && readyPaths.length > 0 && aiState !== "analyzing" && (
            <button
              type="button"
              onClick={() => void analyze(readyPaths)}
              className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary"
            >
              <Sparkles className="h-4 w-4" />
              {t("products.aiRetry")}
            </button>
          )}

          <div className="inline-flex self-start rounded-xl border border-border bg-muted p-1">
            {(["product", "service"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSubjectType(type)}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
                  subjectType === type ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                {type === "product" ? t("products.typeProduct") : t("products.typeService")}
              </button>
            ))}
          </div>

          <Field label={<>{t("products.nameLabel")}<AiHint field="name" /></>} htmlFor="product-name">
            <Input
              id="product-name"
              value={name}
              onChange={(e) => {
                markTouched("name");
                setName(e.target.value);
              }}
              placeholder={aiState === "analyzing" ? "…" : t("products.namePlaceholder")}
              maxLength={120}
              required
            />
          </Field>

          <Field label={t("products.priceLabel")} htmlFor="product-price">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="product-price"
                inputMode="numeric"
                value={priceOnRequest ? "" : price}
                disabled={priceOnRequest}
                onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 9))}
                placeholder={t("products.pricePlaceholder")}
                className="sm:max-w-[200px]"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={priceOnRequest}
                  onChange={(e) => setPriceOnRequest(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                {t("products.priceOnRequest")}
              </label>
            </div>
          </Field>

          <Field label={<>{t("products.descriptionLabel")}<AiHint field="description" /></>} htmlFor="product-description" optional>
            <Textarea
              id="product-description"
              value={description}
              onChange={(e) => {
                markTouched("description");
                setDescription(e.target.value);
              }}
              placeholder={t("products.descriptionPlaceholder")}
              maxLength={2000}
              rows={3}
            />
          </Field>

          <Field label={<>{t("products.categoryLabel")}<AiHint field="category" /></>} htmlFor="product-category" optional>
            <Input
              id="product-category"
              value={category}
              onChange={(e) => {
                markTouched("category");
                setCategory(e.target.value);
              }}
              placeholder={t("products.categoryPlaceholder")}
              maxLength={60}
            />
          </Field>

          <Field label={t("products.optionsLabel")} optional hint={t("products.optionsHint")}>
            <div className="flex flex-col gap-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={opt.name}
                    onChange={(e) =>
                      setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, name: e.target.value } : o)))
                    }
                    placeholder={t("products.optionName")}
                    maxLength={30}
                    className="w-32 shrink-0"
                  />
                  <Input
                    value={opt.values}
                    onChange={(e) =>
                      setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, values: e.target.value } : o)))
                    }
                    placeholder={t("products.optionValues")}
                  />
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={t("products.delete")}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {options.length < 3 && (
                <div className="flex flex-wrap gap-2">
                  {[t("products.optionSize"), t("products.optionColor"), t("products.optionShoe")]
                    .filter((label) => !options.some((o) => o.name === label))
                    .map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setOptions((prev) => [...prev, { name: label, values: "" }])}
                        className="inline-flex items-center gap-1 rounded-lg border border-input px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        <Plus className="h-3 w-3" />
                        {label}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => [...prev, { name: "", values: "" }])}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary"
                  >
                    <Plus className="h-3 w-3" />
                    {t("products.optionAdd")}
                  </button>
                </div>
              )}
            </div>
          </Field>

          {isEdit && (
            <Field label={t("products.statusLabel")}>
              <div className="flex flex-wrap gap-2">
                {(["active", "sold_out", "hidden", "draft"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                      status === s ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground"
                    )}
                  >
                    {t(`products.status_${s}`)}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <ErrorNote message={error} />
          <LimitDialog reason={limitReason} onClose={() => setLimitReason(null)} />

          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            {(!isEdit || status === "draft") && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                disabled={!!saving || uploading}
                onClick={() => void submit("draft", "draft")}
              >
                {saving === "draft" && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEdit ? t("products.keepDraft") : t("products.saveDraft")}
              </Button>
            )}
            {isEdit && status === "draft" ? (
              <Button
                type="button"
                variant="accent"
                size="lg"
                disabled={!!saving || uploading || !name.trim()}
                onClick={() => void submit("active", "publish")}
              >
                {saving === "publish" && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving === "publish" ? t("products.saving") : t("products.publishDraft")}
              </Button>
            ) : (
              <Button type="submit" variant="accent" size="lg" disabled={!!saving || uploading || !name.trim()}>
                {(saving === "publish" || saving === "save") && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? t("products.saving") : isEdit ? t("products.save") : t("products.publish")}
              </Button>
            )}
          </div>
        </form>
      )}

      {!showForm && <ErrorNote message={error} className="mt-4" />}
    </div>
  );
}
