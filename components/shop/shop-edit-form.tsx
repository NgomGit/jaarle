"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { updateShop } from "@/app/dashboard/boutique/actions";
import { CategoryPicker } from "@/components/dashboard/category-picker";
import { PhoneInput } from "@/components/phone-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CityFields, ErrorNote, Field, LogoPicker, SlugField, type SlugState } from "@/components/shop/shop-fields";
import { uploadShopMedia } from "@/lib/client-image";
import { categoryTree } from "@/lib/knowledge/category-tree";
import { toLocalSenegal } from "@/lib/shops/format";
import type { Shop } from "@/lib/shops/types";
import { useLocale } from "@/lib/locale-context";

export function ShopEditForm({ shop, logoUrl }: { shop: Shop; logoUrl: string | null }) {
  const { t } = useLocale();
  const router = useRouter();
  const slugLocked = shop.status !== "draft";

  const [name, setName] = React.useState(shop.name);
  const [slug, setSlug] = React.useState(shop.slug);
  const [slugState, setSlugState] = React.useState<SlugState>("available");
  const [industry, setIndustry] = React.useState(shop.industry ?? "");
  const [whatsapp, setWhatsapp] = React.useState(toLocalSenegal(shop.whatsapp));
  const [city, setCity] = React.useState(shop.city ?? "");
  const [district, setDistrict] = React.useState(shop.district ?? "");
  const [description, setDescription] = React.useState(shop.description ?? "");
  const [logoPath, setLogoPath] = React.useState<string | null>(shop.logo_path);
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState<string | null>(logoUrl);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const canSave = name.trim().length >= 2 && whatsapp.length === 9 && slugState === "available" && !saving;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      let nextLogoPath = logoPath;
      if (logoFile) nextLogoPath = (await uploadShopMedia(logoFile, "logo")).path;
      const res = await updateShop({
        name,
        slug,
        industry: industry || undefined,
        categoryLabel:
          industry === shop.industry
            ? (shop.category_label ?? undefined)
            : categoryTree.find((c) => c.industryKey === industry)?.label,
        whatsapp,
        city,
        district,
        description,
        logoPath: nextLogoPath,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLogoPath(nextLogoPath);
      setLogoFile(null);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("shop.errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link
        href="/dashboard/boutique"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("shop.navLabel")}
      </Link>
      <h1 className="mb-1 text-xl font-bold tracking-tight">{t("shop.ed_title")}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t("shop.ed_desc")}</p>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
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
              setLogoPath(null);
              setLogoPreview(null);
            }}
          />
        </Field>

        <Field label={t("shop.nameLabel")} htmlFor="shop-name">
          <Input id="shop-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>

        <div>
          <SlugField
            slug={slug}
            locked={slugLocked}
            onSlugChange={(s) => setSlug(s)}
            onStateChange={setSlugState}
          />
          {slugLocked && <p className="mt-1.5 text-xs text-muted-foreground">{t("shop.ed_slugLocked")}</p>}
        </div>

        <Field label={t("shop.activityLabel")}>
          <CategoryPicker value={industry} onChange={setIndustry} />
        </Field>

        <Field label={t("shop.whatsappLabel")} htmlFor="shop-whatsapp">
          <PhoneInput strict id="shop-whatsapp" value={whatsapp} onChange={setWhatsapp} placeholder={t("shop.whatsappPlaceholder")} required />
        </Field>

        <CityFields city={city} district={district} onCity={setCity} onDistrict={setDistrict} />

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

        <ErrorNote message={error} />
        {saved && (
          <p role="status" className="rounded-lg bg-accent px-3.5 py-2.5 text-sm text-accent-foreground">
            {t("shop.ed_saved")}
          </p>
        )}

        <Button type="submit" variant="accent" size="lg" disabled={!canSave}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? t("shop.ed_saving") : t("shop.ed_save")}
        </Button>
      </form>
    </div>
  );
}
