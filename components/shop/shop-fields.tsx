"use client";

import * as React from "react";
import { Check, Loader2, Pencil, TriangleAlert, ImagePlus, X } from "lucide-react";
import { checkShopSlug } from "@/app/dashboard/boutique/actions";
import { SENEGAL_CITIES } from "@/lib/shops/cities";
import { shopInitials } from "@/lib/shops/media";
import { shopDisplayUrl } from "@/lib/shops/format";
import { normalizeSlugInput, validateSlug } from "@/lib/shops/slug";
import { useLocale } from "@/lib/locale-context";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Libellé + champ, avec mention « facultatif » éventuelle. */
export function Field({
  label,
  htmlFor,
  optional,
  children,
  hint,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  optional?: boolean;
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-muted-foreground">({t("shop.optional")})</span>}
      </label>
      {children}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Logo ou, à défaut, monogramme aux initiales. */
export function ShopMonogram({ name, logoUrl, size = 56 }: { name: string; logoUrl?: string | null; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-secondary font-bold text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-full w-full bg-card object-contain" />
      ) : (
        shopInitials(name || "Jaarle")
      )}
    </div>
  );
}

export function LogoPicker({
  name,
  previewUrl,
  onSelect,
  onRemove,
}: {
  name: string;
  previewUrl: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const { t } = useLocale();
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-4">
      <ShopMonogram name={name} logoUrl={previewUrl} size={72} />
      <div className="flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm font-medium hover:bg-muted"
          >
            <ImagePlus className="h-4 w-4" strokeWidth={1.75} />
            {previewUrl ? t("shop.logoChange") : t("shop.logoAdd")}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={() => {
                if (inputRef.current) inputRef.current.value = "";
                onRemove();
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
              {t("shop.logoRemove")}
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("shop.logoHint")}</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSelect(file);
          }}
        />
      </div>
    </div>
  );
}

export type SlugState = "checking" | "available" | "taken" | "invalid";

/**
 * Aperçu du lien jaarle.com/boutique/{slug} avec vérification de disponibilité (debounce).
 * `locked` : boutique publiée → le lien n'est plus modifiable.
 */
export function SlugField({
  slug,
  onSlugChange,
  onStateChange,
  locked = false,
}: {
  slug: string;
  onSlugChange: (slug: string, touched: boolean) => void;
  onStateChange: (state: SlugState) => void;
  locked?: boolean;
}) {
  const { t } = useLocale();
  const [editing, setEditing] = React.useState(false);
  const [state, setState] = React.useState<SlugState>("checking");
  const [problem, setProblem] = React.useState<string | null>(null);
  const [suggestion, setSuggestion] = React.useState<string | null>(null);

  const update = React.useCallback(
    (s: SlugState) => {
      setState(s);
      onStateChange(s);
    },
    [onStateChange]
  );

  React.useEffect(() => {
    if (locked) {
      update("available");
      return;
    }
    const localProblem = validateSlug(slug);
    setSuggestion(null);
    if (localProblem) {
      setProblem(localProblem);
      update("invalid");
      return;
    }
    setProblem(null);
    update("checking");
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await checkShopSlug(slug);
        if (cancelled) return;
        if (res.status === "available") update("available");
        else if (res.status === "taken") {
          setSuggestion(res.suggestion);
          update("taken");
        } else {
          setProblem(res.problem);
          update("invalid");
        }
      } catch {
        if (!cancelled) update("available"); // la vérification finale se refait côté serveur à l'envoi
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, locked, update]);

  return (
    <div className="rounded-xl border border-border bg-muted/50 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("shop.linkLabel")}</span>
        {!locked && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            <Pencil className="h-3 w-3" strokeWidth={2} />
            {t("shop.linkEdit")}
          </button>
        )}
      </div>

      {editing && !locked ? (
        <div className="flex items-center overflow-hidden rounded-lg border border-input bg-card focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <span className="whitespace-nowrap border-r border-input bg-muted px-2.5 py-2 text-xs text-muted-foreground">
            …/boutique/
          </span>
          <input
            value={slug}
            autoFocus
            maxLength={40}
            onChange={(e) => onSlugChange(normalizeSlugInput(e.target.value), true)}
            className="h-9 w-full bg-transparent px-2.5 text-sm outline-none"
            aria-label={t("shop.linkLabel")}
          />
        </div>
      ) : (
        <p className="break-all text-sm">
          <span className="text-muted-foreground">{shopDisplayUrl("").replace(/\/$/, "")}/</span>
          <span className="font-semibold">{slug || "…"}</span>
        </p>
      )}

      {!locked && (
        <div className="mt-1.5 flex min-h-[18px] flex-wrap items-center gap-1.5 text-xs">
          {state === "checking" && slug && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {t("shop.linkChecking")}
            </span>
          )}
          {state === "available" && (
            <span className="inline-flex items-center gap-1 text-success">
              <Check className="h-3 w-3" strokeWidth={2.5} /> {t("shop.linkAvailable")}
            </span>
          )}
          {state === "invalid" && slug && problem && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <TriangleAlert className="h-3 w-3" /> {t(`shop.slug_${problem}`)}
            </span>
          )}
          {state === "taken" && (
            <>
              <span className="inline-flex items-center gap-1 text-destructive">
                <TriangleAlert className="h-3 w-3" /> {t("shop.linkTaken")}
              </span>
              {suggestion && (
                <button
                  type="button"
                  onClick={() => onSlugChange(suggestion, true)}
                  className="rounded-md bg-accent px-1.5 py-0.5 font-medium text-accent-foreground"
                >
                  {t("shop.linkUseSuggestion")} « {suggestion} »
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CityFields({
  city,
  district,
  onCity,
  onDistrict,
}: {
  city: string;
  district: string;
  onCity: (v: string) => void;
  onDistrict: (v: string) => void;
}) {
  const { t } = useLocale();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label={t("shop.cityLabel")} htmlFor="shop-city">
        <Input
          id="shop-city"
          list="shop-city-list"
          value={city}
          onChange={(e) => onCity(e.target.value)}
          placeholder={t("shop.cityPlaceholder")}
          autoComplete="address-level2"
          maxLength={60}
        />
        <datalist id="shop-city-list">
          {SENEGAL_CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label={t("shop.districtLabel")} htmlFor="shop-district" optional>
        <Input
          id="shop-district"
          value={district}
          onChange={(e) => onDistrict(e.target.value)}
          placeholder={t("shop.districtPlaceholder")}
          maxLength={60}
        />
      </Field>
    </div>
  );
}

export function ErrorNote({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={cn(
        "rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive",
        className
      )}
    >
      {message}
    </p>
  );
}
