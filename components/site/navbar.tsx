"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { useLocale } from "@/lib/locale-context";

const NAV_LINKS = [
  { href: "#how", key: "nav.how" },
  { href: "#preview", key: "nav.app" },
  { href: "#pricing", key: "nav.pricing" },
  { href: "#dashboard", key: "nav.dashboard" },
] as const;

export function Navbar() {
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="container flex h-[72px] items-center justify-between">
          <Logo variant="image" />
          <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-foreground">
                {t(link.key)}
              </Link>
            ))}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <LanguageToggle />
            <ThemeToggle />
            <Link href="/login" className="px-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              {t("auth.login")}
            </Link>
            <Button variant="accent" size="md" asChild>
              <Link href="/register">{t("nav.cta")}</Link>
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t("nav.openMenu")}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-foreground md:hidden"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
      </nav>

      <MobileDrawer open={open} onClose={close} side="right">
        <div className="flex h-full flex-col gap-1 p-5 pt-16">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
            >
              {t(link.key)}
            </Link>
          ))}

          <div className="my-3 h-px bg-border" />

          <div className="flex items-center gap-2 px-3">
            <LanguageToggle />
            <ThemeToggle />
          </div>

          <Link
            href="/login"
            onClick={close}
            className="mt-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            {t("auth.login")}
          </Link>
          <Button variant="accent" size="lg" className="mt-2 w-full" asChild>
            <Link href="/register" onClick={close}>
              {t("nav.cta")}
            </Link>
          </Button>
        </div>
      </MobileDrawer>
    </>
  );
}
