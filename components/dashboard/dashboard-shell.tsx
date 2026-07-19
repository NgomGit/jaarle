"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Sparkles, LayoutGrid, Store, Settings, LogOut, Menu } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { logout } from "@/app/auth/actions";
import { useLocale } from "@/lib/locale-context";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: Home, key: "dashboard", href: "/dashboard" },
  { icon: Sparkles, key: "new", href: "/dashboard/new" },
  { icon: LayoutGrid, key: "creations", href: "/dashboard/creations" },
  { icon: Store, key: "brands", href: "/dashboard/brands" },
  { icon: Settings, key: "settings", href: "/dashboard/settings" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <>
        {navItems.map((item) => {
          const active = item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href);
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
          <div className="mb-1 text-[10.5px] text-muted-foreground">{t("dashboard.spent")}</div>
          <div className="mb-2.5 font-mono text-[15px] font-bold">0 FCFA</div>
          <Button variant="accent" size="sm" className="w-full p-2" asChild>
            <Link href="/dashboard/new" onClick={onNavigate}>
              {t("dashboard.newCampaign")}
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
        <main className="flex-1 p-6">{children}</main>
      </div>

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
