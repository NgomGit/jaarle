"use client";

import { useLocale } from "@/lib/locale-context";

export function ComingSoon({ icon: Icon, titleKey }: { icon: React.ElementType; titleKey: string }) {
  const { t } = useLocale();
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent">
        <Icon className="h-5 w-5 text-accent-foreground" strokeWidth={1.75} />
      </div>
      <h1 className="mb-1 text-lg font-bold">{t(titleKey)}</h1>
      <p className="text-sm text-muted-foreground">{t("dashboard.comingSoonDesc")}</p>
    </div>
  );
}
