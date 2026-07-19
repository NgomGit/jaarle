"use client";

import {
  Home, Sparkles, LayoutGrid, Store, Settings, Camera, Mic, Target, Wallet, Gauge,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: Home, key: "dashboard", active: true },
  { icon: Sparkles, key: "new" },
  { icon: LayoutGrid, key: "creations" },
  { icon: Store, key: "brands" },
  { icon: Settings, key: "settings" },
];

const gallery = [
  { from: "from-primary", to: "to-[#3B2E8C]", label: "Robe wax — Facebook" },
  { from: "from-warning", to: "to-[#96601a]", label: "Chaussures — Promo" },
  { from: "from-success", to: "to-[#0d5c3a]", label: "Cosmétique — Story" },
  { from: "from-secondary", to: "to-[#1e3a8a]", label: "Sac — Luxe" },
];

export function DashboardPreview() {
  const { t } = useLocale();
  return (
    <section id="dashboard" className="pb-24">
      <div className="container">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("dashboard.title")}</h2>
          <p className="text-muted-foreground">{t("dashboard.desc")}</p>
        </div>

        <div className="grid grid-cols-1 overflow-hidden rounded-[26px] border border-border shadow-glow-lg md:grid-cols-[220px_1fr]">
          <aside className="hidden flex-col border-r border-border bg-muted p-4 md:flex">
            <Logo variant="image" />
            <nav className="flex flex-1 flex-col gap-1">
              {navItems.map((item) => (
                <div
                  key={item.key}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px]",
                    item.active ? "bg-card font-semibold text-foreground shadow-glow-sm" : "text-muted-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" strokeWidth={1.75} />
                  {t(`dashboard.nav_${item.key}`)}
                </div>
              ))}
            </nav>
            <div className="mt-3.5 rounded-2xl border border-border bg-card p-3.5">
              <div className="mb-1 text-[10.5px] text-muted-foreground">{t("dashboard.spent")}</div>
              <div className="mb-2.5 font-mono text-[15px] font-bold">2 150 FCFA</div>
              <Button variant="accent" size="sm" className="w-full">{t("dashboard.newCampaign")}</Button>
            </div>
          </aside>

          <div className="bg-card p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold">{t("dashboard.greeting")}</h2>
              <Badge variant="accent">9 · {t("dashboard.created")}</Badge>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard icon={Target} value="9" label={t("dashboard.created")} />
              <StatCard icon={Wallet} value="2 150" label={t("dashboard.spent")} mono />
              <StatCard icon={Gauge} value="91/100" label={t("dashboard.score")} />
            </div>

            <div className="mb-6 flex flex-wrap gap-2.5">
              <QuickAction icon={Camera} label={t("dashboard.qaSimple")} />
              <QuickAction icon={Sparkles} label={t("dashboard.qaCampaign")} />
              <QuickAction icon={Mic} label={t("dashboard.qaVoice")} />
            </div>

            <h3 className="mb-3 text-[13.5px] font-semibold text-muted-foreground">{t("dashboard.recent")}</h3>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {gallery.map((g) => (
                <div key={g.label} className={cn("relative aspect-[4/5] overflow-hidden rounded-xl bg-gradient-to-br", g.from, g.to)}>
                  <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/55 to-transparent p-2">
                    <span className="text-[10px] font-semibold text-white">{g.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
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
    <button className="flex min-w-[150px] flex-1 items-center gap-2.5 rounded-2xl border border-border p-3.5 text-left transition-colors hover:border-primary">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent">
        <Icon className="h-3.5 w-3.5 text-accent-foreground" strokeWidth={1.75} />
      </div>
      <p className="text-[12.5px] font-semibold">{label}</p>
    </button>
  );
}
