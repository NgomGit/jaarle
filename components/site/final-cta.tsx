"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";

export function FinalCta() {
  const { t } = useLocale();
  return (
    <section className="pb-28">
      <div className="container">
        <div className="relative overflow-hidden rounded-[22px] bg-foreground px-10 py-16 text-center">
          <div className="pointer-events-none absolute left-1/2 top-[-50%] h-[400px] w-[500px] -translate-x-1/2 rounded-full bg-primary/35 blur-3xl" />
          <h2 className="relative mb-3 text-3xl font-bold text-background sm:text-4xl">{t("cta.title")}</h2>
          <p className="relative mx-auto mb-7 max-w-md text-[15px] text-background/65">{t("cta.desc")}</p>
          <Button variant="accent" size="lg" className="relative" asChild>
            <Link href="/register">{t("cta.button")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
