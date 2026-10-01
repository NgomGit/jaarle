import { randomInt } from "crypto";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/shops/format";
import type { ProductWithImages } from "@/lib/shops/products";

// Commandes du panier (migration 0024, table shop_orders) : chaque envoi de panier sur WhatsApp
// crée une commande avec un code court. Le message contient le lien /recu/{code} : WhatsApp en
// affiche l'aperçu (photos, quantités, total) et le vendeur peut ouvrir le récapitulatif complet.
// Écriture et lecture côté serveur uniquement (service_role). Jamais bloquant : si l'enregistrement
// échoue, le client envoie quand même sa commande en texte.

export interface OrderItem {
  product_id: string;
  slug: string;
  name: string;
  options: string;
  qty: number;
  unit_price: number | null;
  image_path: string | null;
}

export interface ShopOrder {
  code: string;
  shop_id: string;
  items: OrderItem[];
  item_count: number;
  total: number;
  has_unpriced: boolean;
  created_at: string;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0/O, 1/I : lisible au téléphone
const MAX_ORDERS_PER_VISITOR_PER_DAY = 30;
const DEDUPE_MINUTES = 15;

export function newOrderCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function isOrderCode(code: string): boolean {
  return /^[A-Z2-9]{8}$/.test(code);
}

/** « AB23-CD45 » : plus facile à lire et à dicter. */
export function formatOrderCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function orderUrl(code: string): string {
  return `${siteUrl()}/recu/${code}`;
}

/** Ligne de commande à partir d'une fiche (copie figée : nom, prix et photo du moment). */
export function toOrderItem(p: ProductWithImages, qty: number, options: string): OrderItem {
  return {
    product_id: p.id,
    slug: p.slug,
    name: p.name,
    options,
    qty,
    unit_price: p.price,
    image_path: p.product_images[0]?.path ?? null,
  };
}

/**
 * Enregistre la commande et renvoie son code, ou null (clé absente, limite atteinte, erreur).
 * Même panier renvoyé par le même visiteur dans les 15 minutes : on réutilise le même code.
 */
export async function createOrder(input: {
  shopId: string;
  items: OrderItem[];
  source: string | null;
  visitor: string | null;
}): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || input.items.length === 0) return null;
  const items = input.items.slice(0, 20);
  const total = items.reduce((n, i) => n + (i.unit_price ?? 0) * i.qty, 0);
  const itemCount = items.reduce((n, i) => n + i.qty, 0);
  const hasUnpriced = items.some((i) => i.unit_price == null);

  try {
    const admin = createAdminClient();

    if (input.visitor) {
      const since = new Date(Date.now() - DEDUPE_MINUTES * 60_000).toISOString();
      const { data: recent } = await admin
        .from("shop_orders")
        .select("code, items")
        .eq("shop_id", input.shopId)
        .eq("visitor_hash", input.visitor)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      const last = recent?.[0] as { code: string; items: OrderItem[] } | undefined;
      if (last && sameItems(last.items, items)) return last.code;

      const day = new Date(Date.now() - 86_400_000).toISOString();
      const { count } = await admin
        .from("shop_orders")
        .select("id", { count: "exact", head: true })
        .eq("visitor_hash", input.visitor)
        .gte("created_at", day);
      if ((count ?? 0) >= MAX_ORDERS_PER_VISITOR_PER_DAY) return null;
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const code = newOrderCode();
      const { error } = await admin.from("shop_orders").insert({
        code,
        shop_id: input.shopId,
        items,
        item_count: itemCount,
        total,
        has_unpriced: hasUnpriced,
        source: input.source,
        visitor_hash: input.visitor,
      });
      if (!error) return code;
      if (error.code !== "23505") {
        console.error("[orders/createOrder] insert failed:", error);
        return null;
      }
      // code déjà pris (très rare) : on en tire un autre
    }
    return null;
  } catch (err) {
    console.error("[orders/createOrder]", err);
    return null;
  }
}

function sameItems(a: OrderItem[], b: OrderItem[]): boolean {
  const key = (l: OrderItem[]) => JSON.stringify(l.map((i) => [i.product_id, i.options, i.qty]));
  return Array.isArray(a) && key(a) === key(b);
}

export interface OrderWithShop extends ShopOrder {
  shop: { id: string; slug: string; name: string; logo_path: string | null; city: string | null; district: string | null; whatsapp: string };
}

/** Commande par son code, avec sa boutique (publiée uniquement). */
export const getOrder = cache(async (code: string): Promise<OrderWithShop | null> => {
  if (!isOrderCode(code) || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const { data, error } = await createAdminClient()
      .from("shop_orders")
      .select("code, shop_id, items, item_count, total, has_unpriced, created_at, shop:shops!inner(id, slug, name, logo_path, city, district, whatsapp, status)")
      .eq("code", code)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as OrderWithShop & { shop: OrderWithShop["shop"] & { status: string } };
    if (row.shop?.status !== "published") return null;
    return row;
  } catch {
    return null;
  }
});
