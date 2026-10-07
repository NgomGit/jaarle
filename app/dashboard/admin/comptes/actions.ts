"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, requireAdmin } from "@/lib/admin/guard";
import { generateTemporaryPassword } from "@/lib/auth/password";
import { getEntitlementsFor } from "@/lib/billing/entitlements";
import { notifySoft } from "@/lib/push/send";

export type ResetPasswordResult =
  | { ok: true; tempPassword: string; phone: string | null; name: string | null }
  | { ok: false; error: string };

/**
 * Admin : remplace le mot de passe d'un compte par un mot de passe provisoire et oblige
 * l'utilisateur à en choisir un nouveau à sa prochaine connexion (app_metadata.must_change_password).
 * Le mot de passe provisoire n'est renvoyé qu'une fois, à l'admin, et n'est jamais journalisé.
 */
export async function resetUserPassword(userId: string): Promise<ResetPasswordResult> {
  const { userId: adminId } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(userId)) return { ok: false, error: "Compte invalide." };

  const admin = createAdminClient();
  const { data, error: getError } = await admin.auth.admin.getUserById(userId);
  if (getError || !data.user) return { ok: false, error: "Compte introuvable." };
  const user = data.user;

  const tempPassword = generateTemporaryPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
    app_metadata: { ...user.app_metadata, must_change_password: true },
  });
  if (error) return { ok: false, error: `Échec : ${error.message}` };

  await logAdminAction(adminId, "password_reset", "user", userId, { phone: user.phone ?? null });
  return {
    ok: true,
    tempPassword,
    phone: user.phone ?? null,
    name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
  };
}

// ── Abonnements et crédits (fiche vendeur) ──────────────────────────────────
// Formulaires serveur : chaque action revérifie le statut admin, écrit avec la clé service_role
// (les vendeurs ne peuvent rien écrire dans les tables de facturation) et est tracée dans
// admin_actions. Retour sur la fiche avec ?ok=… / ?erreur=….

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY_MS = 86_400_000;

function field(fd: FormData, key: string, max = 300): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return t ? t.slice(0, max) : null;
}

function backToAccount(userId: string | null, params: Record<string, string>): never {
  const q = new URLSearchParams(params);
  redirect(userId && UUID.test(userId) ? `/dashboard/admin/comptes/${userId}?${q}` : `/dashboard/admin/comptes?${q}`);
}

/** Les droits du vendeur ont changé : ses pages tableau de bord et sa vitrine. */
function revalidateSeller(userId: string) {
  revalidatePath(`/dashboard/admin/comptes/${userId}`);
  revalidatePath("/dashboard", "layout");
  revalidatePath("/market", "layout");
}

/** Donner une formule (Pro, Business…) pour une durée, sans paiement. */
export async function grantPlanAction(fd: FormData) {
  const { userId: adminId } = await requireAdmin();
  const userId = field(fd, "userId", 64);
  const planKey = field(fd, "plan", 40);
  const days = Number(field(fd, "days", 4));
  const start = field(fd, "start", 10) === "after" ? "after" : "now";
  const note = field(fd, "note", 300);
  const notify = fd.get("notify") === "on";
  if (!userId || !UUID.test(userId)) backToAccount(null, { erreur: "Compte invalide." });
  if (!Number.isInteger(days) || days < 1 || days > 366) backToAccount(userId, { erreur: "Durée invalide (1 à 366 jours)." });
  if (!note) backToAccount(userId, { erreur: "Indique la raison (elle est conservée dans le journal)." });

  const admin = createAdminClient();
  const { data: plan } = await admin.from("plans").select("key, name").eq("key", planKey ?? "").maybeSingle();
  if (!plan || plan.key === "free") backToAccount(userId, { erreur: "Formule invalide." });

  // « À la suite » : la période commence à la fin de la période déjà active sur la même formule
  // (comme un renouvellement payé). « Maintenant » : elle s'applique tout de suite.
  const now = new Date();
  let startsAt = now;
  if (start === "after") {
    const { data: current } = await admin
      .from("subscriptions")
      .select("ends_at")
      .eq("user_id", userId)
      .eq("plan_key", plan.key)
      .eq("status", "active")
      .gt("ends_at", now.toISOString())
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (current?.ends_at) startsAt = new Date(Math.max(now.getTime(), new Date(current.ends_at).getTime()));
  }
  const endsAt = new Date(startsAt.getTime() + days * DAY_MS);

  const { data: sub, error } = await admin
    .from("subscriptions")
    .insert({
      user_id: userId,
      plan_key: plan.key,
      status: "active",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      source: "admin",
      price_paid: 0,
      note,
    })
    .select("id")
    .single();
  if (error || !sub) backToAccount(userId, { erreur: `Échec : ${error?.message ?? "abonnement non créé"}` });

  await logAdminAction(adminId, "subscription.grant", "user", userId, {
    subscription_id: sub.id,
    plan: plan.key,
    days,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    note,
  });
  if (notify) {
    const until = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Africa/Dakar" }).format(endsAt);
    await notifySoft(userId, "payment", {
      title: `🎁 Jaarle ${plan.name} activé`,
      body: start === "after" && startsAt > now ? `Jaarle t'offre ${days} jours de ${plan.name} en plus, jusqu'au ${until}.` : `Jaarle t'offre ${plan.name} jusqu'au ${until}. Profites-en !`,
      url: "/dashboard/abonnement",
      tag: `plan-${sub.id}`,
    });
  }
  revalidateSeller(userId);
  backToAccount(userId, { ok: `${plan.name} ajouté pour ${days} jour${days > 1 ? "s" : ""}.` });
}

/** Arrêter un abonnement (offert ou payé) : il cesse de compter immédiatement. */
export async function cancelSubscriptionAction(fd: FormData) {
  const { userId: adminId } = await requireAdmin();
  const userId = field(fd, "userId", 64);
  const subId = field(fd, "subscriptionId", 64);
  const reason = field(fd, "reason", 300);
  if (!userId || !UUID.test(userId) || !subId || !UUID.test(subId)) backToAccount(userId, { erreur: "Abonnement invalide." });
  if (!reason) backToAccount(userId, { erreur: "Indique la raison de l'arrêt." });

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, plan_key, source, price_paid, note, ends_at")
    .eq("id", subId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!sub) backToAccount(userId, { erreur: "Abonnement introuvable ou déjà arrêté." });

  const { error } = await admin
    .from("subscriptions")
    .update({ status: "canceled", note: [sub.note, `Arrêté par l'admin : ${reason}`].filter(Boolean).join(" — ").slice(0, 1000) })
    .eq("id", subId);
  if (error) backToAccount(userId, { erreur: `Échec : ${error.message}` });

  await logAdminAction(adminId, "subscription.cancel", "user", userId, {
    subscription_id: subId,
    plan: sub.plan_key,
    source: sub.source,
    price_paid: sub.price_paid,
    ends_at: sub.ends_at,
    reason,
  });
  revalidateSeller(userId);
  backToAccount(userId, { ok: "Abonnement arrêté." });
}

/** Ajouter (ou retirer, montant négatif) des crédits de génération. */
export async function grantCreditsAction(fd: FormData) {
  const { userId: adminId } = await requireAdmin();
  const userId = field(fd, "userId", 64);
  const amount = Number(field(fd, "amount", 6));
  const expiresDaysRaw = field(fd, "expiresDays", 4);
  const expiresDays = expiresDaysRaw ? Number(expiresDaysRaw) : null;
  const note = field(fd, "note", 300);
  const notify = fd.get("notify") === "on";
  if (!userId || !UUID.test(userId)) backToAccount(null, { erreur: "Compte invalide." });
  if (!Number.isInteger(amount) || amount === 0 || amount < -500 || amount > 500) {
    backToAccount(userId, { erreur: "Nombre de crédits invalide (entre -500 et 500, différent de 0)." });
  }
  if (expiresDays != null && (!Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 366)) {
    backToAccount(userId, { erreur: "Expiration invalide (1 à 366 jours, ou vide)." });
  }
  if (!note) backToAccount(userId, { erreur: "Indique la raison (elle est conservée dans le journal)." });

  const admin = createAdminClient();
  if (amount < 0) {
    const ent = await getEntitlementsFor(userId);
    if (ent.credits + amount < 0) backToAccount(userId, { erreur: `Le vendeur n'a que ${ent.credits} crédit${ent.credits > 1 ? "s" : ""}.` });
  }
  const expiresAt = amount > 0 && expiresDays ? new Date(Date.now() + expiresDays * DAY_MS).toISOString() : null;
  const { data: ledgerId, error } = await admin.rpc("grant_credits", {
    p_user: userId,
    p_delta: amount,
    p_kind: "admin",
    p_note: note,
    p_order: null,
    p_expires_at: expiresAt,
  });
  if (error) backToAccount(userId, { erreur: `Échec : ${error.message}` });

  await logAdminAction(adminId, amount > 0 ? "credits.grant" : "credits.remove", "user", userId, {
    ledger_id: ledgerId,
    amount,
    expires_at: expiresAt,
    note,
  });
  if (notify && amount > 0) {
    await notifySoft(userId, "payment", {
      title: `🎁 ${amount} crédit${amount > 1 ? "s" : ""} offert${amount > 1 ? "s" : ""}`,
      body: `Jaarle t'offre ${amount} crédit${amount > 1 ? "s" : ""} pour créer de nouvelles affiches.`,
      url: "/dashboard/new",
      tag: `credits-${ledgerId}`,
    });
  }
  revalidateSeller(userId);
  backToAccount(userId, { ok: amount > 0 ? `${amount} crédit${amount > 1 ? "s" : ""} ajouté${amount > 1 ? "s" : ""}.` : `${-amount} crédit${amount < -1 ? "s" : ""} retiré${amount < -1 ? "s" : ""}.` });
}
