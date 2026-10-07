import Link from "next/link";
import { Search } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";
import { frDate, frDateTime } from "@/lib/admin/market";
import { mustChangePassword } from "@/lib/auth/password";
import { ResetPasswordButton } from "./reset-password-button";

// Comptes : retrouver un vendeur (numéro ou nom) et réinitialiser son mot de passe.
// Les comptes sont lus via l'API d'administration Supabase Auth (clé service_role).

export const dynamic = "force-dynamic";

const PER_PAGE = 1000;
const MAX_PAGES = 20; // jusqu'à 20 000 comptes parcourus par recherche
const MAX_RESULTS = 20;

function normalizeQuery(q: string): { digits: string | null; text: string } {
  const digits = q.replace(/\D/g, "");
  // 77 123 45 67 / 771234567 / +221771234567 → 221771234567 (format stocké par Supabase)
  const phone = digits.length >= 4 ? (digits.length === 9 ? `221${digits}` : digits) : null;
  return { digits: phone, text: q.trim().toLowerCase() };
}

async function searchUsers(q: string): Promise<User[]> {
  const { digits, text } = normalizeQuery(q);
  const admin = createAdminClient();
  const found: User[] = [];
  for (let page = 1; page <= MAX_PAGES && found.length < MAX_RESULTS; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error || !data) break;
    for (const u of data.users) {
      const name = String(u.user_metadata?.full_name ?? "").toLowerCase();
      const phone = (u.phone ?? "").replace(/\D/g, "");
      if ((digits && phone.includes(digits)) || (!digits && text.length >= 2 && name.includes(text))) found.push(u);
      if (found.length >= MAX_RESULTS) break;
    }
    if (data.users.length < PER_PAGE) break;
  }
  return found;
}

function formatPhone(phone: string | undefined): string {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("221")) return `+221 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return d ? `+${d}` : "—";
}

export default async function AdminAccountsPage({ searchParams }: { searchParams: { q?: string } }) {
  await requireAdmin();
  const q = (searchParams.q ?? "").slice(0, 60);
  const users = q.trim() ? await searchUsers(q) : [];

  const shops = new Map<string, { name: string; slug: string }>();
  // Formule en cours (la plus haute si plusieurs abonnements actifs, comme billing_entitlements).
  const plansByUser = new Map<string, { name: string; endsAt: string; sort: number }>();
  if (users.length) {
    const admin = createAdminClient();
    const ids = users.map((u) => u.id);
    const nowIso = new Date().toISOString();
    const [shopsRes, subsRes, plansRes] = await Promise.all([
      admin.from("shops").select("owner_id, name, slug").in("owner_id", ids),
      admin.from("subscriptions").select("user_id, plan_key, ends_at").in("user_id", ids).eq("status", "active").lte("starts_at", nowIso).gt("ends_at", nowIso),
      admin.from("plans").select("key, name, sort"),
    ]);
    for (const s of (shopsRes.data ?? []) as { owner_id: string; name: string; slug: string }[]) shops.set(s.owner_id, s);
    const plans = new Map(((plansRes.data ?? []) as { key: string; name: string; sort: number }[]).map((p) => [p.key, p]));
    for (const sub of (subsRes.data ?? []) as { user_id: string; plan_key: string; ends_at: string }[]) {
      const plan = plans.get(sub.plan_key);
      if (!plan) continue;
      const cur = plansByUser.get(sub.user_id);
      if (!cur || plan.sort > cur.sort || (plan.sort === cur.sort && sub.ends_at > cur.endsAt)) {
        plansByUser.set(sub.user_id, { name: plan.name, endsAt: sub.ends_at, sort: plan.sort });
      }
    }
  }

  return (
    <div className="pb-24 md:pb-8">
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">Comptes</h1>
        <p className="text-sm text-muted-foreground">
          Retrouve un vendeur pour gérer son abonnement et ses crédits, ou réinitialiser son mot de passe (il reçoit un mot de passe provisoire et doit en choisir un nouveau à sa connexion).
        </p>
      </div>

      <form className="mb-6 flex max-w-xl gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Numéro (77 123 45 67) ou nom"
            className="h-10 w-full bg-transparent text-sm outline-none"
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="accent">
          Rechercher
        </Button>
      </form>

      {q.trim() && users.length === 0 && <p className="text-sm text-muted-foreground">Aucun compte trouvé pour « {q} ».</p>}

      <ul className="flex flex-col gap-3">
        {users.map((u) => {
          const name = typeof u.user_metadata?.full_name === "string" ? u.user_metadata.full_name : null;
          const shop = shops.get(u.id);
          const plan = plansByUser.get(u.id);
          return (
            <li key={u.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {name ?? "Sans nom"}
                  {plan ? <Badge variant="success">{plan.name} → {frDate(plan.endsAt)}</Badge> : <Badge variant="neutral">Gratuit</Badge>}
                  {mustChangePassword(u) && <Badge variant="warning">Mot de passe provisoire</Badge>}
                </p>
                <p className="text-sm tabular-nums text-muted-foreground">{formatPhone(u.phone)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Inscrit le {frDate(u.created_at)}
                  {u.last_sign_in_at ? ` · dernière connexion ${frDateTime(u.last_sign_in_at)}` : " · jamais connecté"}
                  {shop && (
                    <>
                      {" · "}
                      <Link href={`/boutique/${shop.slug}`} target="_blank" className="font-medium text-primary hover:underline">
                        {shop.name}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Link
                  href={`/dashboard/admin/comptes/${u.id}`}
                  className="inline-flex h-8 items-center rounded-lg border border-input bg-card px-3 text-xs font-medium hover:bg-muted"
                >
                  Abonnement &amp; crédits
                </Link>
                <ResetPasswordButton userId={u.id} name={name} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
