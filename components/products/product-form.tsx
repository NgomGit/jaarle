"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Images, Loader2, Megaphone, Plus, Sparkles, Star, Tag, Trash2, X } from "lucide-react";
import { saveProduct } from "@/app/dashboard/produits/actions";
import { LimitDialog, type LimitReason } from "@/components/billing/upgrade-card";
import { Button } from "@/components/ui/button";
import { ModerationBanner } from "@/components/products/moderation-banner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorNote, Field } from "@/components/shop/shop-fields";
import { uploadShopMedia } from "@/lib/client-image";
import { shopMediaUrl } from "@/lib/shops/media";
import type { ProductWithImages } from "@/lib/shops/products";
import type { DisplayMedia, ProductStatus, SubjectType } from "@/lib/shops/types";
import type { ProductSuggestion } from "@/lib/ai/product-autofill";
import { useLocale } from "@/lib/locale-context";
import { MarketCategoryPicker } from "@/components/market/market-category-picker";
import { PosterChooser } from "@/components/products/poster-chooser";
import { ProductVideoField } from "@/components/products/product-video-field";
import type { ProductVideoDraft } from "@/lib/shops/video";
import { cn } from "@/lib/utils";
import { activePromo, promoEndToDay, promoInputError } from "@/lib/shops/promo";
import { optionValuesError, parseOptionValues } from "@/lib/shops/product-options";

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
export function ProductForm({
  product,
  importedNote = false,
  videoAllowed = true,
  promoAllowed = true,
}: {
  product?: ProductWithImages | null;
  importedNote?: boolean;
  /** Vidéo produit : offres payantes uniquement (Gratuit → bloc verrouillé « Pro »). */
  videoAllowed?: boolean;
  /** Promo (prix barré) : Pro uniquement (0046). */
  promoAllowed?: boolean;
}) {
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
  const [displayMedia, setDisplayMedia] = React.useState<DisplayMedia>(product?.display_media ?? "poster");
  const [name, setName] = React.useState(product?.name ?? "");
  const [price, setPrice] = React.useState(product?.price != null ? String(product.price) : "");
  const [priceOnRequest, setPriceOnRequest] = React.useState(isEdit && product?.price == null);
  // Promo : `price` devient le prix promo, `oldPrice` l'ancien prix barré.
  const [promoOn, setPromoOn] = React.useState(product?.compare_at_price != null);
  const [oldPrice, setOldPrice] = React.useState(product?.compare_at_price != null ? String(product.compare_at_price) : "");
  const [promoEnd, setPromoEnd] = React.useState(promoEndToDay(product?.promo_ends_at));
  const [description, setDescription] = React.useState(product?.description ?? "");
  const [category, setCategory] = React.useState(product?.category ?? "");
  const [marketCategory, setMarketCategory] = React.useState(product?.market_category ?? "");
  const marketTouched = React.useRef(isEdit && !!product?.market_category);
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
  const savedVideo = product?.product_video ?? null;
  const [video, setVideo] = React.useState<ProductVideoDraft | null>(
    savedVideo
      ? {
          path: savedVideo.path,
          posterPath: savedVideo.poster_path,
          durationMs: savedVideo.duration_ms,
          fileSize: savedVideo.file_size,
          width: savedVideo.width,
          height: savedVideo.height,
        }
      : null
  );
  const [videoBusy, setVideoBusy] = React.useState(false);

  // Après la proposition IA, il ne reste que le prix à saisir : on y place le curseur.
  React.useEffect(() => {
    if (aiState === "done" && !isEdit) document.getElementById("product-price")?.focus();
  }, [aiState, isEdit]);

  const uploading = photos.some((p) => !p.path && !p.error) || videoBusy;
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
      if (!marketTouched.current && s.marketCategory && s.marketCategory !== "none") setMarketCategory(s.marketCategory);
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
    if (videoBusy) return setError(t("products.videoBusy"));
    const promoActive = promoOn && !priceOnRequest;
    if (promoActive) {
      const promoError = promoInputError(Number(price.replace(/\D/g, "")) || null, Number(oldPrice.replace(/\D/g, "")) || null);
      if (promoError) return setError(promoError);
    }
    const parsedOptions = options
      .map((o) => ({ name: o.name.trim(), values: parseOptionValues(o.values) }))
      .filter((o) => o.name && o.values.length > 0);
    for (const o of parsedOptions) {
      const optionError = optionValuesError(o.name, o.values);
      if (optionError) return setError(optionError);
    }
    setSaving(mode);
    const res = await saveProduct(
      {
        subjectType,
        displayMedia,
        name,
        price: priceOnRequest ? null : Number(price.replace(/\D/g, "")),
        compareAtPrice: promoActive ? Number(oldPrice.replace(/\D/g, "")) : null,
        promoEndsOn: promoActive && promoEnd ? promoEnd : null,
        description,
        category,
        marketCategory: marketCategory || null,
        status: nextStatus,
        options: parsedOptions,
        images: photos
          .filter((p) => p.path)
          .map((p) => ({ path: p.path as string, width: p.width ?? null, height: p.height ?? null })),
        aiSuggestions: aiSuggestion ? (aiSuggestion as unknown as Record<string, unknown>) : undefined,
        video,
      },
      product?.id
    );
    setSaving(null);
    if (!res.ok) {
      if (res.limit) setLimitReason(res.limit);
      return setError(res.error);
    }
    if (res.videoError) {
      // Produit enregistré, vidéo non : on reste sur la fiche (celle du produit créé) pour réessayer.
      setError(res.videoError);
      if (!isEdit) router.replace(`/dashboard/produits/${res.id}`);
      return;
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
      {isEdit && product?.moderated_at && (
        <ModerationBanner productId={product.id} reason={product.moderated_reason ?? null} reviewRequestedAt={product.review_requested_at ?? null} />
      )}
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

      {showForm && (
        <ProductVideoField
          value={video}
          savedPath={savedVideo?.path ?? null}
          allowed={videoAllowed}
          onChange={setVideo}
          onBusyChange={setVideoBusy}
        />
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

          {subjectType === "service" && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t("products.displayLabel")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["poster", "photos"] as const).map((mode) => (
                  <label
                    key={mode}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                      displayMedia === mode ? "border-primary bg-accent" : "border-border hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="radio"
                      name="display-media"
                      value={mode}
                      checked={displayMedia === mode}
                      onChange={() => setDisplayMedia(mode)}
                      className="sr-only"
                    />
                    {mode === "poster" ? (
                      <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    ) : (
                      <Images className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    )}
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold">{mode === "poster" ? t("products.displayPoster") : t("products.displayPhotos")}</span>
                      <span className="text-xs text-muted-foreground">
                        {mode === "poster" ? t("products.displayPosterHint") : t("products.displayPhotosHint")}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {displayMedia === "poster" && product ? (
                <PosterChooser productId={product.id} />
              ) : (
                <p className="text-xs text-muted-foreground">{t("products.displayHint")}</p>
              )}
            </fieldset>
          )}

          <Field label={<>{t("products.nameLabel")}<AiHint field="name" /></>} htmlFor="product-name" hint={t("products.noBrandHint")}>
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

          <Field label={promoOn && !priceOnRequest ? t("products.pricePromoLabel") : t("products.priceLabel")} htmlFor="product-price">
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

          {!priceOnRequest && (
            <PromoFields
              allowed={promoAllowed}
              on={promoOn}
              price={price}
              oldPrice={oldPrice}
              end={promoEnd}
              onToggle={(next) => {
                if (next) {
                  // L'ancien prix = le prix actuel ; le vendeur baisse ensuite le prix.
                  if (!oldPrice && price) setOldPrice(price);
                  setPromoOn(true);
                  setTimeout(() => document.getElementById("product-price")?.focus(), 0);
                } else {
                  // Fin de la promo : on revient à l'ancien prix.
                  if (oldPrice) setPrice(oldPrice);
                  setOldPrice("");
                  setPromoEnd("");
                  setPromoOn(false);
                }
              }}
              onOldPrice={setOldPrice}
              onEnd={setPromoEnd}
            />
          )}

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

          <Field label={t("products.marketCategoryLabel")} optional hint={t("products.marketCategoryHint")}>
            <MarketCategoryPicker
              value={marketCategory}
              onChange={(slug) => {
                marketTouched.current = true;
                setMarketCategory(slug);
              }}
            />
          </Field>

          <Field label={t("products.optionsLabel")} optional hint={t("products.optionsHint")}>
            <div className="flex flex-col gap-2">
              {options.map((opt, i) => {
                const values = parseOptionValues(opt.values);
                return (
                <div key={i} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
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
                {values.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-[8.5rem]">
                    {values.map((v) => (
                      <span
                        key={v}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          v.length > 30 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                )}
                </div>
                );
              })}
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

/** Bloc « Mettre en promo » : ancien prix barré, fin facultative, aperçu de la remise (Pro). */
function PromoFields({
  allowed,
  on,
  price,
  oldPrice,
  end,
  onToggle,
  onOldPrice,
  onEnd,
}: {
  allowed: boolean;
  on: boolean;
  price: string;
  oldPrice: string;
  end: string;
  onToggle: (next: boolean) => void;
  onOldPrice: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  const { t } = useLocale();
  const preview = activePromo(Number(price) || null, Number(oldPrice) || null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className={cn("rounded-xl border p-3", on ? "border-primary/40 bg-primary/5" : "border-border")}>
      <label className={cn("flex items-center justify-between gap-3", !allowed && !on && "opacity-70")}>
        <span className="flex items-center gap-2 text-sm font-medium">
          <Tag className="h-4 w-4 text-primary" />
          {t("products.promoToggle")}
          {!allowed && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">PRO</span>}
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={!allowed && !on}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-5 w-5 rounded border-input accent-primary"
        />
      </label>
      {!allowed && !on && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("products.promoPro")}{" "}
          <Link href="/dashboard/abonnement" className="font-semibold text-primary hover:underline">
            {t("products.promoUpgrade")}
          </Link>
        </p>
      )}
      {on && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="product-old-price" className="text-sm font-medium">
              {t("products.promoOldPrice")}
            </label>
            <Input
              id="product-old-price"
              inputMode="numeric"
              value={oldPrice}
              onChange={(e) => onOldPrice(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="15000"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="product-promo-end" className="text-sm font-medium">
              {t("products.promoEnd")} <span className="font-normal text-muted-foreground">({t("shop.optional")})</span>
            </label>
            <Input id="product-promo-end" type="date" min={today} value={end} onChange={(e) => onEnd(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {preview
              ? t("products.promoPreview").replace("{old}", preview.oldPriceLabel).replace("{p}", String(preview.percent))
              : t("products.promoHint")}{" "}
            {t("products.promoEndHint")}
          </p>
        </div>
      )}
    </div>
  );
}
