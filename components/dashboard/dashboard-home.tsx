"use client";

import Link from "next/link";
import { Target, Wallet, Gauge, Camera, Sparkles, Mic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";
import type { Creation } from "@/lib/supabase/creations";

export function DashboardHome({
  displayName,
  recentCreations,
  createdThisMonth,
}: {
  displayName: string;
  recentCreations: Creation[];
  createdThisMonth: number;
}) {
  const { t } = useLocale();

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-bold">
          {t("dashboard.welcomeBack")}, {displayName}
        </h1>
        <Badge variant="accent">
          {createdThisMonth} · {t("dashboard.created")}
        </Badge>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Target} value={String(createdThisMonth)} label={t("dashboard.created")} />
        <StatCard icon={Wallet} value="0" label={t("dashboard.spent")} mono />
        <StatCard icon={Gauge} value="—" label={t("dashboard.score")} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2.5">
        <QuickAction icon={Camera} label={t("dashboard.qaSimple")} />
        <QuickAction icon={Sparkles} label={t("dashboard.qaCampaign")} />
        <QuickAction icon={Mic} label={t("dashboard.qaVoice")} />
      </div>

      <h2 className="mb-3 text-[13.5px] font-semibold text-muted-foreground">{t("dashboard.recent")}</h2>

      {recentCreations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="mb-1 text-sm font-semibold">{t("dashboard.emptyTitle")}</p>
          <p className="mb-4 max-w-xs text-sm text-muted-foreground">{t("dashboard.emptyDesc")}</p>
          <Button variant="accent" asChild>
            <Link href="/dashboard/new">{t("dashboard.emptyCta")}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {recentCreations.map((c) => (
            <Link
              key={c.id}
              href={`/dashboard/creations/${c.id}`}
              className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border bg-muted"
            >
              {c.photoUrl && <img src={c.photoUrl} alt={c.product_name} className="h-full w-full object-cover" />}
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-2">
                <span className="text-[10px] font-semibold text-white">{c.product_name}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, value, label, mono }: { icon: React.ElementType; value: string; label: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-accent">
        <Icon className="h-3.5 w-3.5 text-accent-foreground" strokeWidth={1.75} />
      </div>
      <div className={cn("mb-0.5 text-xl font-bold", mono && "font-mono")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function QuickAction({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <Link
      href="/dashboard/new"
      className="flex min-w-[150px] flex-1 items-center gap-2.5 rounded-2xl border border-border p-3.5 text-left transition-colors hover:border-primary"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent">
        <Icon className="h-3.5 w-3.5 text-accent-foreground" strokeWidth={1.75} />
      </div>
      <p className="text-[12.5px] font-semibold">{label}</p>
    </Link>
  );
}
