"use client";

import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

const STEP_KEYS = ["preview.tab1", "creation.stepCustomize", "preview.tab3", "preview.tab4"] as const;

export function CreationStepIndicator({ step }: { step: 0 | 1 | 2 | 3 }) {
  const { t } = useLocale();
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {STEP_KEYS.map((key, i) => (
        <div
          key={key}
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold",
            i === step ? "border-primary bg-accent text-accent-foreground" : "border-border text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
              i <= step ? "bg-gradient-to-br from-primary to-secondary text-white" : "bg-muted"
            )}
          >
            {i + 1}
          </span>
          {t(key)}
        </div>
      ))}
    </div>
  );
}
