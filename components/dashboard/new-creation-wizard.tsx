"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { UploadCloud, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/locale-context";
import { creationStyles } from "@/lib/creation-styles";
import { industries } from "@/lib/knowledge/industries";
import { CreationStepIndicator } from "@/components/dashboard/creation-step-indicator";
import { CAMPAIGN_PRICE_FCFA } from "@/lib/paytech";
import { cn } from "@/lib/utils";

type Language = "fr" | "wo";

export function NewCreationWizard({ userId }: { userId: string }) {
  const { t } = useLocale();
  const searchParams = useSearchParams();
  const [step, setStep] = React.useState<0 | 1 | 2>(0);
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [productName, setProductName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [style, setStyle] = React.useState<string>(creationStyles[0].key);
  const [industry, setIndustry] = React.useState("");
  const [language, setLanguage] = React.useState<Language>("fr");
  const [error, setError] = React.useState<string | null>(
    searchParams.get("canceled") ? t("creation.paymentCanceled") : null
  );
  const [submitting, setSubmitting] = React.useState(false);

  const canProceedStep0 = !!file && productName.trim() !== "" && price.trim() !== "";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError(null);
  }

  async function goToPayment() {
    if (!canProceedStep0 || !file) {
      setError(t("creation.errorMissingFields"));
      return;
    }
    setError(null);
    setSubmitting(true);
    setStep(2);

    try {
      const supabase = createClient();
      const photoPath = `${userId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("creations").upload(photoPath, file);
      if (uploadError) throw uploadError;

      const res = await fetch("/api/paytech/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoPath, productName, price: Number(price), style, industry: industry || null, language }),
      });
      const data = (await res.json()) as { redirectUrl?: string; error?: string };
      if (!res.ok || !data.redirectUrl) throw new Error(data.error || "checkout_failed");

      window.location.href = data.redirectUrl;
    } catch {
      setError(t("creation.errorGeneric"));
      setSubmitting(false);
      setStep(1);
    }
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
                  <p className="mb-1 text-sm font-semibold">{t("preview.uploadTitle")}</p>
                  <span className="text-xs text-muted-foreground">{t("preview.uploadHint")}</span>
                </>
              )}
              <input id="creation-photo" type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </label>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="productName" className="text-sm font-medium">
                {t("preview.fieldProduct")}
              </label>
              <Input
                id="productName"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Robe wax bleue"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="price" className="text-sm font-medium">
                {t("preview.fieldPrice")}
              </label>
              <Input
                id="price"
                type="number"
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="25000"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="industry" className="text-sm font-medium">
                {t("creation.industry")}
              </label>
              <select
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm text-foreground outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
              >
                <option value="">{t("creation.industryPlaceholder")}</option>
                {industries.map((ind) => (
                  <option key={ind.key} value={ind.key}>
                    {ind.labelFr}
                  </option>
                ))}
              </select>
            </div>

            <Button variant="accent" size="lg" className="mt-2 self-end" disabled={!canProceedStep0} onClick={() => setStep(1)}>
              {t("creation.next")}
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2.5">
              {creationStyles.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStyle(s.key)}
                  className={cn(
                    "relative aspect-[3/4] overflow-hidden rounded-xl border-2 bg-gradient-to-br transition-all",
                    s.from,
                    s.to,
                    style === s.key ? "border-primary" : "border-transparent"
                  )}
                >
                  <span className="absolute bottom-2 left-2 right-2 text-left text-[10px] font-bold capitalize text-white">
                    {s.key}
                  </span>
                </button>
              ))}
            </div>

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
              <Button variant="accent" size="lg" onClick={goToPayment} disabled={submitting}>
                <Sparkles className="h-4 w-4" />
                {t("creation.payAndGenerate").replace("{price}", String(CAMPAIGN_PRICE_FCFA))}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary">
              <span className="absolute inset-[-4px] animate-ping rounded-xl border border-primary/50" />
            </div>
            <p className="text-sm font-semibold">{t("creation.redirectingToPayment")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
