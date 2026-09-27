"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { useLocale } from "@/lib/locale-context";

export function Footer() {
  const { t } = useLocale();
  return (
    <footer className="border-t border-border py-11">
      <div className="container flex flex-wrap items-center justify-between gap-5">
        <div className="flex flex-col">
          <Logo variant="image" />
          <span className="ml-8 mt-0.5 text-[11px] text-muted-foreground">{t("footer.tagline")}</span>
        </div>
        <nav aria-label="Liens" className="flex flex-wrap gap-5 text-[12.5px] text-muted-foreground">
          <Link href="/#how" className="hover:text-foreground">{t("nav.how")}</Link>
          <Link href="/tarifs" className="hover:text-foreground">{t("nav.pricing")}</Link>
          <Link href="/boutiques" className="hover:text-foreground">{t("nav.shops")}</Link>
          <a href="https://wa.me/221771350203" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">WhatsApp</a>
        </nav>
        <div className="text-xs text-muted-foreground">© 2026 Jaarle — Dakar, Sénégal</div>
      </div>
    </footer>
  );
}
