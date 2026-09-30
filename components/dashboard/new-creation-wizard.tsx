"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UploadCloud, CheckCircle2, Circle, Sparkles, X, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { listCreations } from "@/lib/supabase/creations";
import { useLocale } from "@/lib/locale-context";
import { TIERS, DEFAULT_TIER, MAX_POSTER_PHOTOS, type Tier } from "@/lib/pricing";
import { CreationStepIndicator } from "@/components/dashboard/creation-step-indicator";
import { CreationResult } from "@/components/dashboard/creation-result";
import { CategoryPicker } from "@/components/dashboard/category-picker";
import { cn } from "@/lib/utils";
import { LimitDialog, type LimitReason } from "@/components/billing/upgrade-card";

type Step = 0 | 1 | 2 | 3;
type Language = "fr" | "wo";
type SubjectType = "product" | "service";

/**
 * Valeurs par défaut issues de la boutique Jaarle 2.0 (null = pas de boutique → comportement
 * d'origine inchangé). Le commerçant peut toujours les modifier pour une affiche donnée.
 */
export interface ShopDefaults {
  businessName: string;
  logoUrl: string | null;
  industry: string | null;
  language: Language;
}

/** Produit de la boutique à partir duquel on crée l'affiche (« Créer une affiche » sur un produit). */
export interface ProductDefaults {
  productId: string;
  name: string;
  price: number | null;
  subjectType: SubjectType;
  description: string | null;
  imageUrls: string[];
}

export interface GenerationBudget {
  units: Record<Tier, number>;
  affordable: Record<Tier, boolean>;
  remaining: number | null; // null = illimité
  credits: number;
}

export function NewCreationWizard({
  userId,
  defaultPhone,
  shopDefaults = null,
  productDefaults = null,
  generationBudget = null,
}: {
  userId: string;
  defaultPhone: string;
  shopDefaults?: ShopDefaults | null;
  productDefaults?: ProductDefaults | null;
  /** Jaarle 2.0 : coût en générations (abonnement / crédits). null = affichage historique en FCFA. */
  generationBudget?: GenerationBudget | null;
}) {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const [step, setStep] = React.useState<Step>(0);
  const [subjectType, setSubjectType] = React.useState<SubjectType>("product");
  // Photos de l'affiche (1 à 3) choisies en une fois. `mainIndex` = photo principale désignée par
  // le commerçant ; null = l'IA la détermine. Les autres sont intégrées au design en vignettes.
  const [photos, setPhotos] = React.useState<{ file: File; url: string }[]>([]);
  const [mainIndex, setMainIndex] = React.useState<number | null>(null);
  // Nom proposé par l'IA à partir des photos quand le commerçant n'en a pas saisi.
  const [suggestingName, setSuggestingName] = React.useState(false);
  const [nameSuggested, setNameSuggested] = React.useState(false);
  const nameTouched = React.useRef(false);
  const [productName, setProductName] = React.useState("");
  const [serviceDescription, setServiceDescription] = React.useState("");
  const [serviceItems, setServiceItems] = React.useState<string[]>([]);
  const [newItemInput, setNewItemInput] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [priceOnRequest, setPriceOnRequest] = React.useState(false);
  const [industry, setIndustry] = React.useState(shopDefaults?.industry ?? "");
  const [language, setLanguage] = React.useState<Language>(shopDefaults?.language ?? "fr");
  // Toutes les affiches sont premium : plus de choix de palier.
  const tier: Tier = DEFAULT_TIER;
  const [contactPhone, setContactPhone] = React.useState(defaultPhone);
  const [extraPhones, setExtraPhones] = React.useState<string[]>([]);
  const [polishingItems, setPolishingItems] = React.useState(false);
  const [businessName, setBusinessName] = React.useState(shopDefaults?.businessName ?? "");
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = React.useState<string | null>(shopDefaults?.logoUrl ?? null);
  // Logo de la boutique utilisé tant que le commerçant n'en choisit pas un autre (ou ne le retire pas).
  const [useShopLogo, setUseShopLogo] = React.useState(!!shopDefaults?.logoUrl);
  const [productId, setProductId] = React.useState<string | null>(productDefaults?.productId ?? null);
  const [loadingProductPhotos, setLoadingProductPhotos] = React.useState(false);

  // Pré-remplissage depuis un produit de la boutique : infos + photos (récupérées depuis le bucket
  // public shop-media et converties en fichiers, comme si le commerçant venait de les choisir).
  React.useEffect(() => {
    if (!productDefaults) return;
    setProductName(productDefaults.name);
    setSubjectType(productDefaults.subjectType);
    if (productDefaults.price == null) setPriceOnRequest(true);
    else setPrice(String(productDefaults.price));
    if (productDefaults.subjectType === "service" && productDefaults.description) {
      setServiceDescription(productDefaults.description.slice(0, 300));
    }
    if (productDefaults.imageUrls.length === 0) return;
    let cancelled = false;
    setLoadingProductPhotos(true);
    (async () => {
      const files = await Promise.all(
        productDefaults.imageUrls.slice(0, MAX_POSTER_PHOTOS).map(async (url, i) => {
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const blob = await res.blob();
            return new File([blob], `produit-${i + 1}.webp`, { type: blob.type || "image/webp" });
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      setPhotos(
        files
          .filter((f): f is File => !!f)
          .slice(0, MAX_POSTER_PHOTOS)
          .map((f) => ({ file: f, url: URL.createObjectURL(f) }))
      );
      setLoadingProductPhotos(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [genStepIndex, setGenStepIndex] = React.useState(0);
  const [error, setError] = React.useState<string | null>(
    searchParams.get("canceled") ? t("creation.paymentCanceled") : null
  );
  const [generationFailed, setGenerationFailed] = React.useState(false);
  const [limitReason, setLimitReason] = React.useState<LimitReason | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);

  const [result, setResult] = React.useState<{
    creationId: string;
    imageUrl: string;
    imageUrl2: string | null;
    imageFallback: boolean;
    posterReady: boolean;
    salesCopy: string | null;
    hashtags: string[];
    tier: Tier;
    regenerationsRemaining: number;
    unlocked?: boolean;
    moreImages?: string[];
  } | null>(null);

  // Prix vide (ou 0) = « prix sur contact », comme si la case était cochée : le prix n'est plus
  // bloquant, seul le nom (et la photo pour un produit) conditionne le passage à l'étape suivante.
  const priceIsOnRequest = priceOnRequest || !(Number(price) > 0);
  const canProceedStep0 = (subjectType === "product" ? photos.length > 0 : true) && productName.trim() !== "";
  const formattedPrice = priceIsOnRequest ? null : Number(price).toLocaleString("fr-FR");

  function handlePhotosChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setPhotos((prev) => {
      const room = Math.max(0, MAX_POSTER_PHOTOS - prev.length);
      return [...prev, ...picked.slice(0, room).map((f) => ({ file: f, url: URL.createObjectURL(f) }))];
    });
    setError(null);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== index);
    });
    setMainIndex((m) => (m === null || m === index ? null : m > index ? m - 1 : m));
  }

  function toggleMainPhoto(index: number) {
    setMainIndex((m) => (m === index ? null : index));
  }

  // `force` = demande explicite (bouton) : remplace le nom actuel. Sinon (automatique), on ne
  // touche jamais à un nom que le commerçant a commencé à saisir.
  async function suggestName(force = false) {
    if (photos.length === 0 || suggestingName) return;
    if (!force && (nameTouched.current || productName.trim() !== "")) return;
    setSuggestingName(true);
    try {
      const fd = new FormData();
      for (const p of photos.slice(0, MAX_POSTER_PHOTOS)) {
        fd.append("photos", await toSmallJpeg(p.file), "photo.jpg");
      }
      const res = await fetch("/api/creations/suggest-name", { method: "POST", body: fd });
      const data = (await res.json()) as { name?: string };
      if (res.ok && data.name && (force || !nameTouched.current)) {
        setProductName(data.name);
        setNameSuggested(true);
        nameTouched.current = false;
      }
    } catch {
      // silencieux : le commerçant peut toujours saisir le nom lui-même
    } finally {
      setSuggestingName(false);
    }
  }

  // Proposition automatique dès que des photos sont ajoutées et que le nom est vide (petit délai
  // pour attendre la fin d'une sélection multiple). Pas pour une affiche créée depuis un produit.
  React.useEffect(() => {
    if (photos.length === 0 || productDefaults || nameTouched.current || productName.trim() !== "") return;
    const timer = setTimeout(() => void suggestName(false), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  function removeLogo() {
    if (logoPreviewUrl && logoFile) URL.revokeObjectURL(logoPreviewUrl);
    setUseShopLogo(false);
    setLogoFile(null);
    setLogoPreviewUrl(null);
    const input = document.getElementById("businessLogo") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  function addServiceItem() {
    const trimmed = newItemInput.trim();
    if (!trimmed || serviceItems.length >= 10) return;
    setServiceItems((prev) => [...prev, trimmed]);
    setNewItemInput("");
  }

  function removeServiceItem(index: number) {
    setServiceItems((prev) => prev.filter((_, i) => i !== index));
  }

  // Numéros de téléphone additionnels (jusqu'à 2 en plus du principal).
  function addPhoneField() {
    setExtraPhones((prev) => (prev.length >= 2 ? prev : [...prev, ""]));
  }
  function updateExtraPhone(index: number, value: string) {
    setExtraPhones((prev) => prev.map((p, i) => (i === index ? value : p)));
  }
  function removeExtraPhone(index: number) {
    setExtraPhones((prev) => prev.filter((_, i) => i !== index));
  }

  // Correction + amélioration des items par l'IA (orthographe + reformulation vendeuse).
  async function improveItems() {
    if (serviceItems.length === 0 || polishingItems) return;
    setPolishingItems(true);
    try {
      const res = await fetch("/api/polish-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: serviceItems, language, industry: industry || null, subjectType }),
      });
      const data = (await res.json()) as { items?: string[] };
      if (res.ok && Array.isArray(data.items) && data.items.length > 0) {
        setServiceItems(data.items.slice(0, 10));
      }
    } catch {
      // silencieux : en cas d'échec, on garde les items saisis tels quels
    } finally {
      setPolishingItems(false);
    }
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUseShopLogo(false);
    setLogoFile(f);
    setLogoPreviewUrl(URL.createObjectURL(f));
  }

  async function runGeneration() {
    if (!canProceedStep0) {
      setError(t("creation.errorMissingFields"));
      return;
    }
    setError(null);
    setGenerationFailed(false);
    setSubmitting(true);
    setStep(2);

    const genLabels = [t("preview.step1"), t("preview.step2"), t("preview.step3"), t("preview.step4"), t("preview.step5")];

    const generationPromise = (async () => {
      const supabase = createClient();

      // Photo principale en premier (choisie par le commerçant, sinon l'ordre d'ajout — l'IA
      // choisira alors la meilleure côté serveur), puis les photos secondaires.
      const ordered =
        mainIndex !== null && photos[mainIndex]
          ? [photos[mainIndex], ...photos.filter((_, i) => i !== mainIndex)]
          : photos;
      const uploadedPaths: string[] = [];
      for (let i = 0; i < ordered.length; i++) {
        const f = ordered[i].file;
        const path = `${userId}/${Date.now()}-${i}-${f.name}`;
        const { error: uploadError } = await supabase.storage.from("creations").upload(path, f);
        if (uploadError) {
          if (i === 0) throw uploadError; // la photo principale est indispensable
          continue;
        }
        uploadedPaths.push(path);
      }
      const photoPath: string | null = uploadedPaths[0] ?? null;
      const extraPhotoPaths = uploadedPaths.slice(1);

      const hasBranding = true;
      let logoPath: string | null = null;
      if (hasBranding && logoFile) {
        logoPath = `${userId}/${Date.now()}-logo-${logoFile.name}`;
        const { error: logoUploadError } = await supabase.storage.from("creations").upload(logoPath, logoFile);
        if (logoUploadError) logoPath = null;
      } else if (hasBranding && useShopLogo) {
        // Logo de la boutique (bucket public shop-media) copié dans le bucket `creations`, que le
        // générateur lit — le pipeline d'affiche reste inchangé. En cas d'échec : affiche sans logo.
        try {
          const logoRes = await fetch("/api/shop-media/logo-for-poster", { method: "POST" });
          if (logoRes.ok) logoPath = ((await logoRes.json()) as { path?: string }).path ?? null;
        } catch {
          logoPath = null;
        }
      }

      const res = await fetch("/api/generate-creation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoPath,
          extraPhotoPaths,
          mainPhotoChosen: mainIndex !== null && extraPhotoPaths.length > 0,
          productName,
          price: priceIsOnRequest ? null : Number(price),
          industry: industry || null,
          language,
          logoPath,
          businessName: hasBranding && businessName.trim() ? businessName.trim() : null,
          contactPhone: [contactPhone, ...extraPhones].map((p) => p.trim()).filter(Boolean).join(" | ") || null,
          subjectType,
          serviceDescription: subjectType === "service" && serviceDescription.trim() ? serviceDescription.trim() : null,
          serviceItems,
          productId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "generation_failed");

      return {
        creationId: data.creationId,
        imageUrl: data.imageUrl,
        imageUrl2: data.imageUrl2 ?? null,
        imageFallback: !!data.imageError,
        posterReady: !!data.posterReady,
        salesCopy: data.salesCopy,
        hashtags: data.hashtags ?? [],
        tier: (data.tier as Tier) || "premium",
        regenerationsRemaining: TIERS[(data.tier as Tier) || "premium"].maxRegenerations,
        unlocked: !!data.unlocked,
        moreImages: [] as string[],
      };
    })();

    for (let i = 0; i < genLabels.length; i++) {
      setGenStepIndex(i);
      await new Promise((r) => setTimeout(r, 500));
    }

    try {
      const generated = await generationPromise;
      setResult(generated);
      setStep(3);
    } catch (err) {
      if (err instanceof Error && err.message === "limit_reached") {
        // Jaarle 2.0 — quota de générations du plan atteint (vérifié avant tout appel IA).
        setLimitReason("generations");
        setError(t("billing.limit_generations"));
        setGenerationFailed(true);
        setStep(1);
        return;
      }
      if (err instanceof Error && err.message === "unpaid_limit_reached") {
        // Rejet explicite du serveur avant toute génération : pas de génération en cours dont
        // le résultat pourrait avoir abouti malgré l'erreur, donc pas besoin de tentative de
        // récupération — juste indiquer clairement pourquoi et quoi faire (débloquer une
        // création existante pour libérer un emplacement).
        setError(t("creation.errorUnpaidLimit"));
        setGenerationFailed(true);
        setStep(1);
        return;
      }
      // La génération tourne côté serveur pendant 30-120s+ ; si la connexion du client
      // décroche pendant l'attente (réseau mobile, onglet mis en arrière-plan...), le fetch
      // échoue même si l'enregistrement en base a bien abouti côté serveur (l'insert se fait
      // avant l'envoi de la réponse). Avant d'afficher une erreur, on vérifie si une création
      // très récente avec ce même nom existe déjà pour cet utilisateur — si oui, elle a bien
      // été générée, on l'affiche normalement au lieu d'induire en erreur (et d'exposer au
      // risque de double génération si le marchand relance).
      const recovered = await tryRecoverRecentCreation();
      if (recovered) {
        setResult(recovered);
        setStep(3);
      } else {
        setError(t("creation.errorGenerationUnclear"));
        setGenerationFailed(true);
        setStep(1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function tryRecoverRecentCreation() {
    try {
      const supabase = createClient();
      const recent = await listCreations(supabase, 5);
      const match = recent.find(
        (c) => c.product_name === productName.trim() && Date.now() - new Date(c.created_at).getTime() < 3 * 60 * 1000
      );
      if (!match) return null;

      return {
        creationId: match.id,
        imageUrl: match.photoUrl ?? "",
        imageUrl2: match.photoUrl2,
        imageFallback: !match.poster_path,
        posterReady: !!match.poster_path,
        salesCopy: match.generated_copy,
        hashtags: match.generated_hashtags ?? [],
        tier: (match.tier as Tier) || "premium",
        unlocked: !!match.unlocked,
        regenerationsRemaining: TIERS[(match.tier as Tier) || "premium"].maxRegenerations,
      };
    } catch {
      return null;
    }
  }

  async function unlockAndDownload() {
    if (!result) return;
    setUnlocking(true);
    try {
      const res = await fetch("/api/paytech/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creationId: result.creationId }),
      });
      const data = (await res.json()) as { redirectUrl?: string; error?: string };
      if (!res.ok || !data.redirectUrl) throw new Error(data.error || "checkout_failed");
      window.location.href = data.redirectUrl;
    } catch {
      setError(t("creation.errorGeneric"));
      setUnlocking(false);
    }
  }

  async function handleRegenerate(customInstructions: string) {
    if (!result) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/regenerate-creation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creationId: result.creationId, customInstructions: customInstructions || null }),
      });
      const data = (await res.json()) as { imageUrl?: string; regenerationsRemaining?: number; error?: string };
      if (!res.ok || !data.imageUrl) throw new Error(data.error || "regenerate_failed");
      // La nouvelle version s'ajoute au carrousel : les précédentes restent consultables.
      setResult({
        ...result,
        moreImages: [...(result.moreImages ?? []), data.imageUrl],
        posterReady: true,
        regenerationsRemaining: data.regenerationsRemaining ?? 0,
      });
    } catch {
      setError(t("creation.errorGeneric"));
    } finally {
      setRegenerating(false);
    }
  }

  function reset() {
    setStep(0);
    setProductId(null);
    setSubjectType("product");
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setMainIndex(null);
    setSuggestingName(false);
    setNameSuggested(false);
    nameTouched.current = false;
    setProductName("");
    setServiceDescription("");
    setServiceItems([]);
    setNewItemInput("");
    setPrice("");
    setPriceOnRequest(false);
    setIndustry(shopDefaults?.industry ?? "");
    setLanguage(shopDefaults?.language ?? "fr");
    setContactPhone(defaultPhone);
    setExtraPhones([]);
    setPolishingItems(false);
    setBusinessName(shopDefaults?.businessName ?? "");
    setLogoFile(null);
    setLogoPreviewUrl(shopDefaults?.logoUrl ?? null);
    setUseShopLogo(!!shopDefaults?.logoUrl);
    setGenStepIndex(0);
    setError(null);
    setGenerationFailed(false);
    setResult(null);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <CreationStepIndicator step={step} />
      <LimitDialog reason={limitReason} onClose={() => setLimitReason(null)} />

      {error && (
        <div className="mb-4 flex flex-col gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5">
          <p className="text-sm text-destructive">{error}</p>
          {generationFailed && (
            <Button variant="secondary" size="sm" className="self-start" asChild>
              <Link href="/dashboard/creations">{t("creation.viewCreations")}</Link>
            </Button>
          )}
        </div>
      )}

      <div className="rounded-[20px] border border-border bg-card p-6">
        {step === 0 && (
          <div className="flex flex-col gap-4">
            {productId && productDefaults && (
              <p className="rounded-lg bg-accent px-3.5 py-2.5 text-sm text-accent-foreground">
                {t("creation.fromProduct").replace("{name}", productDefaults.name)}
                {loadingProductPhotos && ` ${t("creation.fromProductLoading")}`}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("creation.subjectTypeLabel")}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSubjectType("product")}
                  className={cn(
                    "flex-1 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                    subjectType === "product" ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground"
                  )}
                >
                  {t("creation.subjectTypeProduct")}
                </button>
                <button
                  onClick={() => setSubjectType("service")}
                  className={cn(
                    "flex-1 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                    subjectType === "service" ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground"
                  )}
                >
                  {t("creation.subjectTypeService")}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                {subjectType === "service" ? t("creation.photosTitleOptional") : t("creation.photosTitle")}
              </span>
              <span className="-mt-1 text-[11px] text-muted-foreground">
                {subjectType === "service" ? t("creation.servicePhotoHint") : t("creation.photosHint")}
              </span>
              <div className="grid grid-cols-3 gap-2.5">
                {photos.map((p, i) => {
                  const isMain = mainIndex === i;
                  return (
                    <div
                      key={p.url}
                      className={cn(
                        "relative aspect-square overflow-hidden rounded-xl border-2 bg-muted",
                        isMain ? "border-primary" : "border-border"
                      )}
                    >
                      <img src={p.url} alt="" className="h-full w-full object-cover" />
                      {photos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => toggleMainPhoto(i)}
                          aria-label={t("creation.photosSetMain")}
                          aria-pressed={isMain}
                          className={cn(
                            "absolute left-1.5 top-1.5 flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-semibold shadow transition-colors",
                            isMain ? "bg-primary text-primary-foreground" : "bg-white/90 text-foreground hover:bg-white"
                          )}
                        >
                          <Star className={cn("h-3.5 w-3.5", isMain && "fill-current")} />
                          {isMain && t("creation.photosMainBadge")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        aria-label="Supprimer l'image"
                        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white shadow transition-colors hover:bg-destructive/90"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
                {photos.length < MAX_POSTER_PHOTOS && (
                  <label
                    htmlFor="creation-photo"
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-input bg-muted p-3 text-center transition-colors hover:border-primary",
                      photos.length === 0 ? "col-span-3 py-9" : "aspect-square"
                    )}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
                      {photos.length === 0 ? (
                        <UploadCloud className="h-4 w-4" strokeWidth={1.75} />
                      ) : (
                        <Plus className="h-4 w-4" strokeWidth={2} />
                      )}
                    </div>
                    <span className="text-xs font-semibold">{t("creation.photosAdd")}</span>
                    {photos.length === 0 && <span className="text-[11px] text-muted-foreground">{t("preview.uploadHint")}</span>}
                  </label>
                )}
              </div>
              <input id="creation-photo" type="file" accept="image/*" multiple className="hidden" onChange={handlePhotosChange} />
              {photos.length > 1 && (
                <p className="text-[11px] text-muted-foreground">
                  {mainIndex === null ? t("creation.photosMainAuto") : t("creation.photosMainManual")}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="productName" className="text-sm font-medium">
                {subjectType === "service" ? t("creation.serviceNameLabel") : t("creation.productNameLabel")}
              </label>
              <Input
                id="productName"
                value={productName}
                onChange={(e) => {
                  nameTouched.current = true;
                  setNameSuggested(false);
                  setProductName(e.target.value);
                }}
                placeholder={
                  suggestingName
                    ? t("creation.suggestingName")
                    : subjectType === "service"
                      ? "Nettoyage auto premium"
                      : "Robe wax bleue"
                }
              />
              {photos.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {nameSuggested && !suggestingName && (
                    <span className="text-[11px] text-muted-foreground">{t("creation.nameSuggestedHint")}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void suggestName(true)}
                    disabled={suggestingName}
                    className="flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <Sparkles className={cn("h-3.5 w-3.5", suggestingName && "animate-pulse")} />
                    {suggestingName
                      ? t("creation.suggestingName")
                      : productName.trim()
                        ? t("creation.suggestOtherName")
                        : t("creation.suggestName")}
                  </button>
                </div>
              )}
            </div>

            {subjectType === "service" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="serviceDescription" className="text-sm font-medium">
                  {t("creation.serviceDescriptionLabel")}
                </label>
                <Textarea
                  id="serviceDescription"
                  rows={2}
                  maxLength={400}
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  placeholder={t("creation.serviceDescriptionPlaceholder")}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">
                {subjectType === "service" ? t("creation.serviceItemsLabel") : t("creation.productItemsLabel")}
              </label>
              <span className="-mt-1 text-[11px] text-muted-foreground">{t("creation.itemsAiHint")}</span>
              <div className="flex gap-2">
                <Input
                  value={newItemInput}
                  onChange={(e) => setNewItemInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addServiceItem();
                    }
                  }}
                  placeholder={subjectType === "service" ? t("creation.serviceItemsPlaceholder") : t("creation.productItemsPlaceholder")}
                />
                <Button type="button" variant="secondary" onClick={addServiceItem} disabled={serviceItems.length >= 10}>
                  {t("creation.serviceItemsAdd")}
                </Button>
              </div>
              {serviceItems.length > 0 && (
                <button
                  type="button"
                  onClick={improveItems}
                  disabled={polishingItems}
                  className="flex items-center gap-1.5 self-start rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-accent disabled:opacity-60"
                >
                  <Sparkles className={cn("h-3.5 w-3.5", polishingItems && "animate-pulse")} />
                  {polishingItems ? "Amélioration…" : "Corriger & améliorer avec l'IA"}
                </button>
              )}
              {serviceItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {serviceItems.map((item, i) => (
                    <span
                      key={`${item}-${i}`}
                      className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                    >
                      {item}
                      <button type="button" onClick={() => removeServiceItem(i)} aria-label={t("creation.serviceItemsRemove")}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="price" className="text-sm font-medium">
                {t("preview.fieldPrice")}
              </label>
              {!priceOnRequest && (
                <Input
                  id="price"
                  type="number"
                  inputMode="numeric"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="25000"
                />
              )}
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={priceOnRequest}
                  onChange={(e) => {
                    setPriceOnRequest(e.target.checked);
                    if (e.target.checked) setPrice("");
                  }}
                  className="h-3.5 w-3.5 rounded border-input"
                />
                {t("creation.priceOnRequest")}
              </label>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t("creation.industry")}</label>
              <CategoryPicker value={industry} onChange={setIndustry} />
            </div>

            <Button variant="accent" size="lg" className="mt-2 self-end" disabled={!canProceedStep0} onClick={() => setStep(1)}>
              {t("creation.next")}
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            {generationBudget && (
              <div className="flex flex-col gap-1 rounded-xl bg-accent px-4 py-3">
                <span className="text-sm font-bold text-accent-foreground">
                  {t("creation.premiumIncluded").replace("{n}", String(generationBudget.units[tier] ?? 2))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {generationBudget.remaining == null
                    ? t("billing.generationsUnlimited")
                    : t("billing.wizardGenerationsLeft").replace("{n}", String(generationBudget.remaining))}
                  {generationBudget.credits > 0 && ` · ${t("billing.wizardCreditsLeft").replace("{n}", String(generationBudget.credits))}`}
                </span>
                {!generationBudget.affordable[tier] && (
                  <span className="text-[11px] font-medium text-destructive">{t("billing.notEnoughGenerations")}</span>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="contactPhone" className="text-sm font-medium">
                {t("creation.contactPhone")}
              </label>
              <Input
                id="contactPhone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="77 123 45 67"
              />
              {extraPhones.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={p}
                    onChange={(e) => updateExtraPhone(i, e.target.value)}
                    placeholder="77 987 65 43"
                  />
                  <Button type="button" variant="secondary" size="icon" onClick={() => removeExtraPhone(i)} aria-label="Retirer ce numéro">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {extraPhones.length < 2 && (
                <button
                  type="button"
                  onClick={addPhoneField}
                  className="flex items-center gap-1.5 self-start text-xs font-semibold text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un numéro
                </button>
              )}
              <span className="text-[11px] text-muted-foreground">{t("creation.contactPhoneHint")}</span>
            </div>

            {(
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-3.5">
                <span className="text-sm font-medium">{t("creation.brandingTitle")}</span>
                <span className="-mt-2 text-[11px] text-muted-foreground">
                  {shopDefaults ? t("creation.brandingHintShop") : t("creation.brandingHint")}
                </span>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="businessName" className="text-xs font-medium text-muted-foreground">
                    {t("creation.businessName")}
                  </label>
                  <Input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Awa Créations"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="businessLogo" className="text-xs font-medium text-muted-foreground">
                    {t("creation.businessLogo")}
                  </label>
                  <label
                    htmlFor="businessLogo"
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-input bg-card px-3.5 py-2 text-sm text-muted-foreground hover:border-primary"
                  >
                    {logoPreviewUrl ? (
                      <img src={logoPreviewUrl} alt="" className="h-8 w-8 rounded object-contain" />
                    ) : (
                      <UploadCloud className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                    )}
                    <span className="truncate">
                      {logoFile ? logoFile.name : useShopLogo ? t("creation.shopLogo") : t("creation.businessLogoPlaceholder")}
                    </span>
                    {(logoFile || useShopLogo) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeLogo();
                        }}
                        aria-label="Retirer le logo"
                        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted-foreground/15 transition-colors hover:bg-destructive hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </label>
                  <input
                    id="businessLogo"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("creation.language")}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setLanguage("fr")}
                  className={cn(
                    "rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                    language === "fr" ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground"
                  )}
                >
                  {t("creation.languageFr")}
                </button>
                <button
                  onClick={() => setLanguage("wo")}
                  className={cn(
                    "rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                    language === "wo" ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground"
                  )}
                >
                  {t("creation.languageWo")}
                </button>
              </div>
            </div>

            <div className="mt-2 flex justify-between">
              <Button variant="secondary" size="lg" onClick={() => setStep(0)}>
                {t("creation.back")}
              </Button>
              <Button variant="accent" size="lg" onClick={runGeneration} disabled={submitting}>
                <Sparkles className="h-4 w-4" />
                {t("creation.generate")}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-2xl border border-border bg-muted p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
                <span className="absolute inset-[-4px] animate-ping rounded-xl border border-primary/50" />
              </div>
              <div>
                <div className="text-sm font-bold">{t("preview.aiTitle")}</div>
              </div>
            </div>
            {[t("preview.step1"), t("preview.step2"), t("preview.step3"), t("preview.step4"), t("preview.step5")].map((label, i) => (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-3 border-t border-border py-2.5 text-sm first:border-t-0",
                  i < genStepIndex ? "text-foreground" : i === genStepIndex ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {i < genStepIndex ? (
                  <CheckCircle2 className="h-[18px] w-[18px] text-success" />
                ) : (
                  <Circle className={cn("h-[18px] w-[18px]", i === genStepIndex && "text-primary")} strokeWidth={1.75} />
                )}
                {label}
              </div>
            ))}
          </div>
        )}

        {step === 3 && result && (
          <CreationResult
            imageUrl={result.imageUrl}
            imageUrl2={result.imageUrl2}
            imageFallback={result.imageFallback}
            posterReady={result.posterReady}
            productName={productName}
            formattedPrice={formattedPrice}
            salesCopy={result.salesCopy}
            hashtags={result.hashtags}
            locked={!result.unlocked}
            unlocking={unlocking}
            // Jaarle 2.0 : plus de paiement à l'unité ici — la page de l'affiche explique comment
            // retirer le logo (abonnement / crédits) et permet déjà de publier.
            onUnlock={generationBudget ? () => (window.location.href = `/dashboard/creations/${result.creationId}`) : unlockAndDownload}
            unlockLabel={generationBudget ? t("billing.removeLogoCta") : undefined}
            onNewCreation={reset}
            tierPrice={TIERS[result.tier].price}
            regenerationsRemaining={result.regenerationsRemaining}
            regenerating={regenerating}
            onRegenerate={TIERS[result.tier].maxRegenerations > 0 ? handleRegenerate : undefined}
            moreImages={result.moreImages}
          />
        )}
      </div>
    </div>
  );
}

/** Réduit une photo (768 px, JPEG) avant de l'envoyer pour l'analyse du nom : envoi rapide en 3G/4G. */
async function toSmallJpeg(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}
