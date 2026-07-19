"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { UploadCloud, CheckCircle2, Circle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/locale-context";
import { TIERS, type Tier } from "@/lib/pricing";
import { CreationStepIndicator } from "@/components/dashboard/creation-step-indicator";
import { CreationResult } from "@/components/dashboard/creation-result";
import { CategoryPicker } from "@/components/dashboard/category-picker";
import { cn } from "@/lib/utils";

type Step = 0 | 1 | 2 | 3;
type Language = "fr" | "wo";
type SubjectType = "product" | "service";
const TIER_ORDER: Tier[] = ["basic", "medium", "premium"];

export function NewCreationWizard({ userId, defaultPhone }: { userId: string; defaultPhone: string }) {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const [step, setStep] = React.useState<Step>(0);
  const [subjectType, setSubjectType] = React.useState<SubjectType>("product");
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [productName, setProductName] = React.useState("");
  const [serviceDescription, setServiceDescription] = React.useState("");
  const [serviceItems, setServiceItems] = React.useState<string[]>([]);
  const [newItemInput, setNewItemInput] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [priceOnRequest, setPriceOnRequest] = React.useState(false);
  const [industry, setIndustry] = React.useState("");
  const [language, setLanguage] = React.useState<Language>("fr");
  const [tier, setTier] = React.useState<Tier>("basic");
  const [contactPhone, setContactPhone] = React.useState(defaultPhone);
  const [businessName, setBusinessName] = React.useState("");
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = React.useState<string | null>(null);
  const [genStepIndex, setGenStepIndex] = React.useState(0);
  const [error, setError] = React.useState<string | null>(
    searchParams.get("canceled") ? t("creation.paymentCanceled") : null
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [unlocking, setUnlocking] = React.useState(false);
  const [regenerating, setRegenerating] = React.useState(false);

  const [result, setResult] = React.useState<{
    creationId: string;
    imageUrl: string;
    imageFallback: boolean;
    posterReady: boolean;
    salesCopy: string | null;
    hashtags: string[];
    tier: Tier;
    regenerationsRemaining: number;
  } | null>(null);

  const canProceedStep0 =
    (subjectType === "product" ? !!file : true) && productName.trim() !== "" && (priceOnRequest || price.trim() !== "");
  const formattedPrice = priceOnRequest ? null : price ? Number(price).toLocaleString("fr-FR") : "";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError(null);
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

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    setLogoPreviewUrl(URL.createObjectURL(f));
  }

  async function runGeneration() {
    if (!canProceedStep0) {
      setError(t("creation.errorMissingFields"));
      return;
    }
    setError(null);
    setSubmitting(true);
    setStep(2);

    const genLabels = [t("preview.step1"), t("preview.step2"), t("preview.step3"), t("preview.step4"), t("preview.step5")];

    const generationPromise = (async () => {
      const supabase = createClient();

      let photoPath: string | null = null;
      if (file) {
        photoPath = `${userId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from("creations").upload(photoPath, file);
        if (uploadError) throw uploadError;
      }

      let logoPath: string | null = null;
      if (tier === "premium" && logoFile) {
        logoPath = `${userId}/${Date.now()}-logo-${logoFile.name}`;
        const { error: logoUploadError } = await supabase.storage.from("creations").upload(logoPath, logoFile);
        if (logoUploadError) logoPath = null;
      }

      const res = await fetch("/api/generate-creation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoPath,
          productName,
          price: priceOnRequest ? null : Number(price),
          industry: industry || null,
          language,
          tier,
          logoPath,
          businessName: tier === "premium" && businessName.trim() ? businessName.trim() : null,
          contactPhone: contactPhone.trim() || null,
          subjectType,
          serviceDescription: subjectType === "service" && serviceDescription.trim() ? serviceDescription.trim() : null,
          serviceItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "generation_failed");

      return {
        creationId: data.creationId,
        imageUrl: data.imageUrl,
        imageFallback: !!data.imageError,
        posterReady: !!data.posterReady,
        salesCopy: data.salesCopy,
        hashtags: data.hashtags ?? [],
        tier: (data.tier as Tier) || "basic",
        regenerationsRemaining: TIERS[(data.tier as Tier) || "basic"].maxRegenerations,
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
    } catch {
      setError(t("creation.errorGeneric"));
      setStep(1);
    } finally {
      setSubmitting(false);
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
      setResult({
        ...result,
        imageUrl: data.imageUrl,
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
    setSubjectType("product");
    setFile(null);
    setPreviewUrl(null);
    setProductName("");
    setServiceDescription("");
    setServiceItems([]);
    setNewItemInput("");
    setPrice("");
    setPriceOnRequest(false);
    setIndustry("");
    setLanguage("fr");
    setTier("basic");
    setContactPhone(defaultPhone);
    setBusinessName("");
    setLogoFile(null);
    setLogoPreviewUrl(null);
    setGenStepIndex(0);
    setError(null);
    setResult(null);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <CreationStepIndicator step={step} />

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="rounded-[20px] border border-border bg-card p-6">
        {step === 0 && (
          <div className="flex flex-col gap-4">
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

            <label
              htmlFor="creation-photo"
              className="cursor-pointer rounded-2xl border border-dashed border-input bg-muted p-9 text-center transition-colors hover:border-primary"
            >
              {previewUrl ? (
                <img src={previewUrl} alt="" className="mx-auto max-h-[220px] rounded-xl object-contain" />
              ) : (
                <>
                  <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
                    <UploadCloud className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <p className="mb-1 text-sm font-semibold">
                    {subjectType === "service" ? t("preview.uploadTitleOptional") : t("preview.uploadTitle")}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {subjectType === "service" ? t("creation.servicePhotoHint") : t("preview.uploadHint")}
                  </span>
                </>
              )}
              <input id="creation-photo" type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </label>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="productName" className="text-sm font-medium">
                {subjectType === "service" ? t("creation.serviceNameLabel") : t("creation.productNameLabel")}
              </label>
              <Input
                id="productName"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder={subjectType === "service" ? "Nettoyage auto premium" : "Robe wax bleue"}
              />
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
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("creation.tierLabel")}</span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {TIER_ORDER.map((key) => {
                  const cfg = TIERS[key];
                  return (
                    <button
                      key={key}
                      onClick={() => setTier(key)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-xl border-2 px-4 py-3 text-left transition-colors",
                        tier === key ? "border-primary bg-accent" : "border-border"
                      )}
                    >
                      <span className="text-sm font-bold">{t(`creation.tier.${key}.name`)}</span>
                      <span className="font-mono text-sm font-bold text-primary">{cfg.price} FCFA</span>
                      <span className="text-[11px] text-muted-foreground">{t(`creation.tier.${key}.desc`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

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
              <span className="text-[11px] text-muted-foreground">{t("creation.contactPhoneHint")}</span>
            </div>

            {tier === "premium" && (
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-3.5">
                <span className="text-sm font-medium">{t("creation.brandingTitle")}</span>
                <span className="-mt-2 text-[11px] text-muted-foreground">{t("creation.brandingHint")}</span>

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
                    <span className="truncate">{logoFile ? logoFile.name : t("creation.businessLogoPlaceholder")}</span>
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
            imageFallback={result.imageFallback}
            posterReady={result.posterReady}
            productName={productName}
            formattedPrice={formattedPrice}
            salesCopy={result.salesCopy}
            hashtags={result.hashtags}
            locked
            unlocking={unlocking}
            onUnlock={unlockAndDownload}
            onNewCreation={reset}
            tierPrice={TIERS[result.tier].price}
            regenerationsRemaining={result.regenerationsRemaining}
            regenerating={regenerating}
            onRegenerate={TIERS[result.tier].maxRegenerations > 0 ? handleRegenerate : undefined}
          />
        )}
      </div>
    </div>
  );
}
