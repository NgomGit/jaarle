"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Store } from "lucide-react";
import { createShop } from "@/app/dashboard/boutique/actions";
import { TERMS_PATH } from "@/lib/legal/terms";
import { CategoryPicker } from "@/components/dashboard/category-picker";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CityFields, ErrorNote, Field, LogoPicker, SlugField, type SlugState } from "@/components/shop/shop-fields";
import { uploadShopMedia } from "@/lib/client-image";
import { categoryTree } from "@/lib/knowledge/category-tree";
import { slugify } from "@/lib/shops/slug";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

type Step = 0 | 1 | 2;

/**
 * Création de boutique en 3 écrans courts, pensés pour le téléphone :
 * 1. nom + activité (+ lien auto) → 2. WhatsApp + ville → 3. logo + présentation (facultatifs).
 */
export function ShopOnboarding({ defaultWhatsapp }: { defaultWhatsapp: string }) {
  const { t } = useLocale();
  const router = useRouter();

  const [step, setStep] = React.useState<Step>(0);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [slugState, setSlugState] = React.useState<SlugState>("invalid");
  const [industry, setIndustry] = React.useState("");
  const [whatsapp, setWhatsapp] = React.useState(defaultWhatsapp);
  const [city, setCity] = React.useState("");
  const [district, setDistrict] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<"idle" | "uploading" | "creating">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = React.useState(false);

  React.useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  function onNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  const canContinue =
    step === 0
      ? name.trim().length >= 2 && slugState === "available" // activité facultative, comme dans l'assistant d'affiche
      : step === 1
        ? whatsapp.length === 9 && city.trim().length > 0
        : acceptTerms;

  async function submit() {
    setError(null);
    try {
      let logoPath: string | null = null;
      if (logoFile) {
        setPhase("uploading");
        logoPath = (await uploadShopMedia(logoFile, "logo")).path;
      }
      setPhase("creating");
      const res = await createShop({
        name,
        slug,
        industry: industry || undefined,
        categoryLabel: categoryTree.find((c) => c.industryKey === industry)?.label,
        whatsapp,
        city,
        district,
        description,
        logoPath,
      }, acceptTerms);
      if (!res.ok) {
        setError(res.error);
        if (res.field === "slug" || res.field === "name") setStep(0);
        else if (res.field === "whatsapp") setStep(1);
        setPhase("idle");
        return;
      }
      router.replace("/dashboard/boutique?created=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("shop.errorGeneric"));
      setPhase("idle");
    }
  }

  function goNext() {
    if (!canContinue) return;
    if (step < 2) setStep((s) => (s + 1) as Step);
    else void submit();
  }

  const busy = phase !== "idle";
  const titles = [t("shop.ob_step1Title"), t("shop.ob_step2Title"), t("shop.ob_step3Title")];
  const descs = [t("shop.ob_step1Desc"), t("shop.ob_step2Desc"), t("shop.ob_step3Desc")];

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-5 flex items-center gap-2 text-xs font-semibold text-primary">
        <Store className="h-4 w-4" strokeWidth={1.75} />
        {t("shop.ob_kicker")}
      </div>

      {/* Progression */}
      <div className="mb-2 flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              i <= step ? "bg-gradient-to-r from-primary to-secondary" : "bg-muted"
            )}
          />
        ))}
      </div>
      <p className="mb-5 text-xs text-muted-foreground">{t("shop.stepOf").replace("{n}", String(step + 1))}</p>

      <h1 className="mb-1 text-xl font-bold tracking-tight">{titles[step]}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{descs[step]}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          goNext();
        }}
        className="flex flex-col gap-5"
      >
        {step === 0 && (
          <>
            <Field label={t("shop.nameLabel")} htmlFor="shop-name">
              <Input
                id="shop-name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder={t("shop.namePlaceholder")}
                maxLength={60}
                autoFocus
                autoComplete="organization"
              />
            </Field>
            <SlugField
              slug={slug}
              onSlugChange={(s, touched) => {
                setSlug(s);
                if (touched) setSlugTouched(true);
              }}
              onStateChange={setSlugState}
            />
            <Field label={t("shop.activityLabel")}>
              <CategoryPicker value={industry} onChange={setIndustry} />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label={t("shop.whatsappLabel")} htmlFor="shop-whatsapp">
              <PhoneInput strict
                id="shop-whatsapp"
                value={whatsapp}
                onChange={setWhatsapp}
                placeholder={t("shop.whatsappPlaceholder")}
                required
                autoComplete="tel-national"
              />
            </Field>
            <CityFields city={city} district={district} onCity={setCity} onDistrict={setDistrict} />
          </>
        )}

        {step === 2 && (
          <>
            <Field label={t("shop.logoLabel")} optional>
              <LogoPicker
                name={name}
                previewUrl={logoPreview}
                onSelect={(file) => {
                  setLogoFile(file);
                  setLogoPreview(URL.createObjectURL(file));
                }}
                onRemove={() => {
                  setLogoFile(null);
                  setLogoPreview(null);
                }}
              />
            </Field>
            <Field label={t("shop.descriptionLabel")} htmlFor="shop-description" optional>
              <Textarea
                id="shop-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("shop.descriptionPlaceholder")}
                maxLength={500}
                rows={3}
              />
            </Field>
            <label className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-sm leading-snug">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
              />
              <span>
                {t("shop.ob_acceptTermsBefore")}{" "}
                <Link href={TERMS_PATH} target="_blank" className="font-semibold text-primary hover:underline">
                  {t("shop.ob_acceptTermsLink")}
                </Link>
                {t("shop.ob_acceptTermsAfter")}
              </span>
            </label>
          </>
        )}

        <ErrorNote message={error} />

        <div className="mt-1 flex items-center gap-2.5">
          {step > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => setStep((s) => (s - 1) as Step)}
              aria-label={t("shop.back")}
              className="px-4"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <Button type="submit" variant="accent" size="lg" className="flex-1" disabled={!canContinue || busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {phase === "uploading"
              ? t("shop.ob_uploading")
              : phase === "creating"
                ? t("shop.ob_creating")
                : step < 2
                  ? t("shop.next")
                  : t("shop.ob_create")}
          </Button>
        </div>
      </form>
    </div>
  );
}
