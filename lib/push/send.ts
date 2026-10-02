import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/shops/format";
import { PushError, sendWebPush, type VapidKeys } from "./web-push";
import type { NotificationType } from "./types";

export type { NotificationType };

// Envoi des notifications push aux vendeurs (migration 0033).
// • respecte les préférences (type coupé = rien n'est envoyé) ;
// • envoie à tous les appareils du vendeur, supprime les abonnements expirés ;
// • ne lève jamais d'erreur et ne bloque jamais plus de ~2 s l'action qui l'appelle
//   (une commande ou un paiement ne doit pas échouer à cause d'une notification).

export interface PushMessage {
  title: string;
  body: string;
  /** Page ouverte au toucher (chemin du site). */
  url: string;
  /** Même tag = la nouvelle notification remplace l'ancienne au lieu de s'empiler. */
  tag?: string;
  urgency?: "low" | "normal" | "high";
}

export function vapidKeys(): VapidKeys | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "mailto:contact@jaarle.com" };
}

/** Envoie à tous les appareils du vendeur. Renvoie le nombre d'appareils atteints. */
export async function sendPush(userId: string, type: NotificationType, message: PushMessage): Promise<number> {
  const vapid = vapidKeys();
  if (!vapid) return 0;
  try {
    const admin = createAdminClient();
    if (type !== "test") {
      const { data: pref } = await admin
        .from("notification_preferences")
        .select("enabled")
        .eq("user_id", userId)
        .eq("type", type)
        .maybeSingle();
      if (pref && pref.enabled === false) return 0;
    }

    const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId).limit(10);
    if (!subs?.length) return 0;

    const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: message.tag ?? type });
    const gone: string[] = [];
    const reached: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await sendWebPush(s, payload, vapid, { urgency: message.urgency ?? "normal", topic: message.tag, timeoutMs: 4000 });
          reached.push(s.id);
        } catch (err) {
          if (err instanceof PushError && err.gone) gone.push(s.id);
          else console.error("[push] envoi échoué:", err instanceof Error ? err.message : err);
        }
      })
    );
    if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
    if (reached.length) await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", reached);
    return reached.length;
  } catch (err) {
    console.error("[push]", err);
    return 0;
  }
}

/** Comme sendPush, mais n'attend jamais plus de `ms` (l'envoi continue si la fonction reste en vie). */
export async function notifySoft(userId: string, type: NotificationType, message: PushMessage, ms = 2000): Promise<void> {
  await Promise.race([sendPush(userId, type, message).catch(() => 0), new Promise((r) => setTimeout(r, ms))]);
}

// ── Messages ────────────────────────────────────────────────────────────────

export async function notifyNewOrder(input: { shopId: string; code: string; itemCount: number; total: number; hasUnpriced: boolean }) {
  if (!vapidKeys()) return;
  const { data: shop } = await createAdminClient().from("shops").select("owner_id").eq("id", input.shopId).maybeSingle();
  if (!shop?.owner_id) return;
  const articles = `${input.itemCount} article${input.itemCount > 1 ? "s" : ""}`;
  const total = input.total > 0 ? ` · ${formatPrice(input.total)}${input.hasUnpriced ? " +" : ""}` : "";
  await notifySoft(shop.owner_id, "order", {
    title: "🛒 Nouvelle commande",
    body: `Un client t'envoie son panier sur WhatsApp : ${articles}${total}. Réponds-lui vite !`,
    url: `/recu/${input.code}`,
    tag: `order-${input.code}`,
    urgency: "high",
  });
}

export async function notifyPaymentConfirmed(input: { userId: string; ref: string; kind: string }) {
  const body =
    input.kind === "subscription"
      ? "Ton offre est active. Profite de toutes tes générations."
      : input.kind === "credits"
        ? "Tes crédits sont disponibles."
        : "Ton affiche est débloquée, sans filigrane.";
  await notifySoft(input.userId, "payment", {
    title: "✅ Paiement confirmé",
    body,
    url: input.kind === "subscription" || input.kind === "credits" ? "/dashboard/abonnement" : "/dashboard/studio",
    tag: `payment-${input.ref}`,
  });
}

export async function notifyMarketPick(input: { productId: string }) {
  if (!vapidKeys()) return;
  const { data: p } = await createAdminClient().from("products").select("name, owner_id").eq("id", input.productId).maybeSingle();
  if (!p?.owner_id) return;
  await notifySoft(p.owner_id, "market", {
    title: "⭐ Ton annonce est sur Jaarle Market",
    body: `Jaarle a mis « ${p.name} » sur le Market. Ajoute d'autres annonces pour y faire entrer toute ta boutique !`,
    url: "/dashboard/produits",
    tag: `market-${input.productId}`,
  });
}
