"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, vapidKeys } from "@/lib/push/send";

// Abonnements push et préférences (migration 0033). Chaque action revérifie la session.
// Le cookie jaarle_push garde l'id de l'abonnement de CET appareil : à la déconnexion, on le
// supprime pour que l'appareil ne reçoive plus les notifications du compte.

import { PUSH_COOKIE } from "@/lib/push/device";
const PREF_TYPES = ["order", "payment", "market"] as const;

async function currentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  return user?.id ?? null;
}

function cleanKey(v: unknown, max: number): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]+=*$/.test(v) && v.length <= max ? v : null;
}

export async function savePushSubscription(input: { endpoint: string; p256dh: string; auth: string; userAgent?: string }): Promise<{ ok: boolean; error?: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Session expirée." };
  if (!vapidKeys()) return { ok: false, error: "Notifications pas encore configurées." };

  const endpoint = typeof input.endpoint === "string" && input.endpoint.startsWith("https://") && input.endpoint.length <= 1000 ? input.endpoint : null;
  const p256dh = cleanKey(input.p256dh, 200);
  const auth = cleanKey(input.auth, 100);
  if (!endpoint || !p256dh || !auth) return { ok: false, error: "Abonnement invalide." };

  const { data, error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, endpoint, p256dh, auth, user_agent: (input.userAgent || "").slice(0, 300) || null },
      { onConflict: "endpoint" }
    )
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Enregistrement impossible." };

  cookies().set(PUSH_COOKIE, data.id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 400 * 86_400 });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId || typeof endpoint !== "string") return { ok: false };
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", userId);
  cookies().delete(PUSH_COOKIE);
  return { ok: true };
}

export async function getNotificationSettings(): Promise<{ configured: boolean; devices: number; disabled: string[] }> {
  const userId = await currentUserId();
  if (!userId) return { configured: false, devices: 0, disabled: [] };
  const supabase = createClient();
  const [subs, prefs] = await Promise.all([
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }),
    supabase.from("notification_preferences").select("type, enabled"),
  ]);
  return {
    configured: !!vapidKeys(),
    devices: subs.count ?? 0,
    disabled: ((prefs.data ?? []) as { type: string; enabled: boolean }[]).filter((p) => !p.enabled).map((p) => p.type),
  };
}

export async function setNotificationPreference(type: string, enabled: boolean): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  if (!userId || !(PREF_TYPES as readonly string[]).includes(type)) return { ok: false };
  const { error } = await createClient()
    .from("notification_preferences")
    .upsert({ user_id: userId, type, enabled: !!enabled, updated_at: new Date().toISOString() }, { onConflict: "user_id,type" });
  return { ok: !error };
}

export async function sendTestNotification(): Promise<{ ok: boolean; devices: number }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, devices: 0 };
  const devices = await sendPush(userId, "test", {
    title: "🔔 Notifications activées",
    body: "C'est ici que Jaarle te préviendra de tes commandes et de tes paiements.",
    url: "/dashboard",
    tag: "test",
  });
  return { ok: devices > 0, devices };
}
