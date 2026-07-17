"use client";

import { Languages } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { Button } from "@/components/ui/button";

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <Button
      variant="secondary"
      size="sm"
      className="gap-1.5"
      onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
      aria-label="Changer de langue / Switch language"
    >
      <Languages className="h-3.5 w-3.5" />
      {locale === "fr" ? "FR" : "EN"}
    </Button>
  );
}
