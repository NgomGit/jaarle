import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShopEventType } from "@/lib/shops/types";

// Écriture des événements de boutique (vues, clics WhatsApp, partages) — côté serveur uniquement,
// avec la clé service_role (la table shop_events n'accepte aucune écriture depuis le navigateur).
// Jamais bloquant : un échec de suivi ne doit jamais empêcher un client de contacter le vendeur.

const SOURCES = new Set(["wa", "qr", "ig", "fb", "tt", "direct", "share", "poster", "card", "market", "cart"]);

export function normalizeSource(raw: string | null | undefined): string | null {
  const s = (raw || "").toLowerCase().slice(0, 16);
  return SOURCES.has(s) ? s : null;
}

/** Empreinte anonyme du visiteur pour la journée (aucune IP stockée en clair). */
export function visitorHash(request: Request): string {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ua = request.headers.get("user-agent") || "";
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-16) || "jaarle";
  return createHash("sha256").update(`${ip}|${ua}|${day}|${salt}`).digest("hex").slice(0, 32);
}

export async function recordShopEvent(event: {
  shopId: string;
  productId?: string | null;
  type: ShopEventType;
  source?: string | null;
  visitor?: string | null;
  dedupeMinutes?: number;
}): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const admin = createAdminClient();
    if (event.dedupeMinutes && event.visitor) {
      // Même visiteur, même page, dans les dernières minutes : on ne compte qu'une fois.
      const since = new Date(Date.now() - event.dedupeMinutes * 60_000).toISOString();
      let q = admin
        .from("shop_events")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", event.shopId)
        .eq("type", event.type)
        .eq("visitor_hash", event.visitor)
        .gte("created_at", since);
      q = event.productId ? q.eq("product_id", event.productId) : q.is("product_id", null);
      const { count } = await q;
      if ((count ?? 0) > 0) return;
    }
    await admin.from("shop_events").insert({
      shop_id: event.shopId,
      product_id: event.productId ?? null,
      type: event.type,
      source: event.source ?? null,
      visitor_hash: event.visitor ?? null,
    });
  } catch (err) {
    console.error("[tracking] recordShopEvent failed:", err);
  }
}
