"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Megaphone, Store, Settings, LogOut, Menu, Package, Plus } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { logout } from "@/app/auth/actions";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

// Navigation volontairement courte (Jaarle 2.0) : le Studio regroupe les affiches (ex-« Mes
// créations ») et la création d'affiche ; les statistiques sont rangées dans « Ma boutique ».
// `match` : autres pages qui allument l'entrée (les anciennes adresses restent valables).
const navItems = [
  { icon: Home, key: "dashboard", href: "/dashboard", match: [] as string[] },
  { icon: Megaphone, key: "studio", href: "/dashboard/studio", match: ["/dashboard/creations", "/dashboard/new", "/dashboard/unlock"] },
  { icon: Store, key: "shop", href: "/dashboard/boutique", match: ["/dashboard/statistiques"] },
  { icon: Package, key: "products", href: "/dashboard/produits", match: [] },
  { icon: Settings, key: "settings", href: "/dashboard/settings", match: [] },
];

function isActive(item: (typeof navItems)[number], pathname: string): boolean {
  if (item.href === "/dashboard") return pathname === item.href;
  // Le Studio « produit » (/dashboard/studio/[productId]) s'ouvre depuis les produits.
  if (item.key === "products" && /^\/dashboard\/studio\/[^/]+/.test(pathname)) return true;
  if (item.key === "studio" && /^\/dashboard\/studio\/[^/]+/.test(pathname)) return false;
  return [item.href, ...item.match].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Résumé de l'offre affiché dans le menu (calculé côté serveur par getEntitlements). */
export interface ShellPlanSummary {
  billingEnabled: boolean;
  name: string;
  isFree: boolean;
  remaining: number | null;
  total: number | null;
  credits: number;
}

export function DashboardShell({ children, plan }: { children: React.ReactNode; plan?: ShellPlanSummary }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <>
        {navItems.map((item) => {
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] transition-colors",
                active ? "bg-card font-semibold text-foreground shadow-glow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" strokeWidth={1.75} />
              {t(`dashboard.nav_${item.key}`)}
            </Link>
          );
        })}
      </>
    );
  }

  function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <>
        <div className="mt-3.5 rounded-2xl border border-border bg-card p-2">
          {plan?.billingEnabled ? (
            <Link href="/dashboard/abonnement" onClick={onNavigate} className="mb-2.5 block rounded-xl px-1 py-0.5 hover:bg-muted">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold">Jaarle {plan.name}</span>
                {plan.isFree && <span className="text-[10.5px] font-semibold text-primary">{t("billing.seePlans")}</span>}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {plan.total == null
                  ? t("billing.sidebarUnlimited")
                  : t("billing.sidebarGenerations").replace("{remaining}", String(plan.remaining ?? 0)).replace("{total}", String(plan.total))}
                {plan.credits > 0 ? ` · ${t("billing.sidebarCredits").replace("{count}", String(plan.credits))}` : ""}
              </div>
              {plan.total != null && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round(((plan.remaining ?? 0) / Math.max(plan.total, 1)) * 100)}%` }}
                  />
                </div>
              )}
            </Link>
          ) : (
            <>
              <div className="mb-1 text-[10.5px] text-muted-foreground">{t("dashboard.spent")}</div>
              <div className="mb-2.5 font-mono text-[15px] font-bold">0 FCFA</div>
            </>
          )}
          <Button variant="accent" size="sm" className="w-full p-2" asChild>
            <Link href="/dashboard/new" onClick={onNavigate}>
              {t("studio.createPoster")}
            </Link>
          </Button>
        </div>
        <form action={logout} className="mt-3">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            {t("auth.logout")}
          </button>
        </form>
      </>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[220px_1fr]">
      <aside className="hidden flex-col border-r border-border bg-muted p-4 md:flex">
        <Logo variant="image" className="mb-8" />
        <nav className="flex flex-1 flex-col gap-1 ">
          <NavLinks />
        </nav>
        <SidebarFooter />
      </aside>

      <div className="flex flex-col">
        <header className="flex items-center justify-between border-b border-border p-4 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("dashboard.openMenu")}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
          >
            <Menu className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
          <Logo variant="image" />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/dashboard/settings" aria-label={t("dashboard.nav_settings")}>
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
            <form action={logout}>
              <Button variant="ghost" size="icon" type="submit" aria-label={t("auth.logout")}>
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-6 pb-28 md:pb-6">{children}</main>
      </div>

      {/* Mobile : barre d'onglets fixe (pouce), avec la création d'affiche au centre. */}
      <nav
        aria-label={t("dashboard.mainNav")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 items-end">
          {navItems.slice(0, 2).map((item) => (
            <TabLink key={item.key} item={item} active={isActive(item, pathname)} label={t(`dashboard.nav_${item.key}`)} />
          ))}
          <Link href="/dashboard/new" className="flex flex-col items-center gap-0.5 pb-1.5 pt-1" aria-label={t("studio.createPoster")}>
            <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Plus className="h-6 w-6" />
            </span>
            <span className="text-[10.5px] font-semibold">{t("studio.createShort")}</span>
          </Link>
          {navItems.slice(2, 4).map((item) => (
            <TabLink key={item.key} item={item} active={isActive(item, pathname)} label={t(`dashboard.nav_${item.key}`)} />
          ))}
        </div>
      </nav>

      <MobileDrawer open={drawerOpen} onClose={closeDrawer} side="left">
        <div className="flex h-full flex-col p-4 pt-14">
          <Logo variant="image" className="mb-8" />
          <nav className="flex flex-1 flex-col gap-1">
            <NavLinks onNavigate={closeDrawer} />
          </nav>
          <SidebarFooter onNavigate={closeDrawer} />
        </div>
      </MobileDrawer>
    </div>
  );
}

function TabLink({ item, active, label }: { item: (typeof navItems)[number]; active: boolean; label: string }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("flex flex-col items-center gap-0.5 py-2 text-[10.5px]", active ? "font-semibold text-primary" : "text-muted-foreground")}
    >
      <item.icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.75} />
      {label}
    </Link>
  );
}
