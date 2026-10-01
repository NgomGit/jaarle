"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/admin", label: "Vue d'ensemble" },
  { href: "/dashboard/admin/signalements", label: "Signalements" },
  { href: "/dashboard/admin/market", label: "Market & mises en avant" },
];

export function AdminNav({ openReports }: { openReports: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Administration" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {TABS.map((t) => {
        const active = t.href === "/dashboard/admin" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.href.endsWith("signalements") && openReports > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground tabular-nums">
                {openReports > 99 ? "99+" : openReports}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bandeau de retour d'une action (?ok=… / ?erreur=…). */
export function ActionFlash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "mb-5 rounded-xl border px-4 py-3 text-sm",
        error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-success/30 bg-success/10 text-success"
      )}
    >
      {error ?? ok}
    </p>
  );
}
