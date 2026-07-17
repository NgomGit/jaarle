"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useLocale } from "@/lib/locale-context";

export function Navbar() {
  const { t } = useLocale();
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="container flex h-[72px] items-center justify-between">
        <Logo />
        <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          <Link href="#how" className="hover:text-foreground">{t("nav.how")}</Link>
          <Link href="#preview" className="hover:text-foreground">{t("nav.app")}</Link>
          <Link href="#pricing" className="hover:text-foreground">{t("nav.pricing")}</Link>
          <Link href="#dashboard" className="hover:text-foreground">{t("nav.dashboard")}</Link>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
          <Link href="/login" className="hidden px-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:block">
            {t("auth.login")}
          </Link>
          <Button variant="accent" size="md" asChild>
            <Link href="/register">{t("nav.cta")}</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
