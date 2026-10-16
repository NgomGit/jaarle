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

// Robots, aperçus de liens (WhatsApp, Facebook, Telegram…), outils de surveillance et préchargements :
// ils ouvrent les liens /r/wa/… sans être des clients. On ne les compte jamais.
const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|facebookcatalog|meta-externalagent|whatsapp\/|telegram|twitterbot|linkedin|skype|discord|slack|embedly|pinterest|vkshare|headless|lighthouse|pingdom|uptime|monitor|curl\/|wget|python-requests|python-urllib|axios|node-fetch|undici|go-http-client|java\/|okhttp|httpclient|scrapy|ahrefs|semrush|mj12|dataforseo|bytespider|petalbot|gptbot|claudebot|ccbot|amazonbot|applebot|bingpreview|google-inspectiontool|googleother|vercel-screenshot|vercel-favicon/i;

/** Vrai si la requête vient d'un robot / aperçu de lien / préchargement, pas d'un visiteur. */
export function isAutomatedRequest(request: Request): boolean {
  if (request.method === "HEAD") return true;
  const ua = request.headers.get("user-agent") || "";
  if (!ua.trim() || BOT_UA.test(ua)) return true;
  const purpose = `${request.headers.get("purpose") || ""} ${request.headers.get("sec-purpose") || ""} ${request.headers.get("x-purpose") || ""}`;
  if (/prefetch|preview|prerender/i.test(purpose)) return true;
  if (request.headers.get("x-middleware-prefetch") || request.headers.get("next-router-prefetch")) return true;
  return false;
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
