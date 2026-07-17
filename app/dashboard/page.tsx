import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = (user.user_metadata?.full_name as string | undefined) || user.phone;

  return (
    <main className="flex min-h-screen flex-col">
      <nav className="border-b border-border">
        <div className="container flex h-[72px] items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/settings">Paramètres</Link>
            </Button>
            <form action={logout}>
              <Button variant="secondary" size="sm" type="submit">
                Déconnexion
              </Button>
            </form>
          </div>
        </div>
      </nav>
      <div className="container flex flex-1 flex-col items-center justify-center gap-2 py-20 text-center">
        <h1 className="text-2xl font-bold">Bienvenue, {displayName}</h1>
        <p className="text-muted-foreground">Ton tableau de bord Affisse arrive bientôt.</p>
      </div>
    </main>
  );
}
