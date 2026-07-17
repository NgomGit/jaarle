"use client";

import { Camera, Palette, Rocket } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/locale-context";

export function HowItWorks() {
  const { t } = useLocale();
  const steps = [
    { icon: Camera, num: "01", title: t("how.s1t"), desc: t("how.s1d") },
    { icon: Palette, num: "02", title: t("how.s2t"), desc: t("how.s2d") },
    { icon: Rocket, num: "03", title: t("how.s3t"), desc: t("how.s3d") },
  ];

  return (
    <section id="how" className="py-24">
      <div className="container">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("how.title")}</h2>
          <p className="text-muted-foreground">{t("how.desc")}</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <Card key={s.num} className="p-7">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <s.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </div>
              <span className="mb-3 block font-mono text-xs text-primary">{s.num}</span>
              <h3 className="mb-2 text-[17px] font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
