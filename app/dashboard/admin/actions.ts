"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction, requireAdmin } from "@/lib/admin/guard";
import { dayEndExclusiveIso, dayStartIso, isValidDay } from "@/lib/admin/market";
import { getMarketCategory, isMarketLeaf } from "@/lib/market/categories";
import { getMarketCity } from "@/lib/market/cities";

// Actions des pages admin (formulaires serveur). Toutes revérifient le statut admin et écrivent
// avec la clé service_role ; chaque action sensible est tracée dans admin_actions (0026).

const REPORTS = "/dashboard/admin/signalements";
const MARKET = "/dashboard/admin/market";

function str(fd: FormData, key: string, max = 500): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return t ? t.slice(0, max) : null;
}

function back(path: string, params: Record<string, string>): never {
  const [base, query = ""] = path.split("?");
  const q = new URLSearchParams(query);
  // Le message précédent ne doit pas rester affiché.
  q.delete("ok");
  q.delete("erreur");
  for (const [k, v] of Object.entries(params)) q.set(k, v);
  redirect(`${base}?${q.toString()}`);
}

/** Retour uniquement vers une page admin (pas de redirection ouverte). */
function safeFrom(v: string | null): string {
  return v && v.startsWith("/dashboard/admin") ? v : REPORTS;
}

/** Ce que voit le public a changé : pages Market, annuaire et vitrine de la boutique. */
function revalidatePublic(shopSlug?: string | null) {
  revalidatePath("/market", "layout");
  revalidatePath("/boutiques", "layout");
  if (shopSlug) revalidatePath(`/boutique/${shopSlug}`, "layout");
}

// ── Signalements ─────────────────────────────────────────────────────────────

export async function updateReportAction(fd: FormData) {
  const { userId } = await requireAdmin();
  const id = str(fd, "id", 64);
  const status = str(fd, "status", 20);
  const note = str(fd, "note", 1000);
  const filter = str(fd, "filtre", 20) ?? "a-traiter";
  if (!id || !status || !["open", "reviewing", "dismissed", "actioned"].includes(status)) back(REPORTS, { filtre: filter, erreur: "Statut invalide." });

  const { error } = await createAdminClient()
    .from("shop_reports")
    .update({
      status,
      admin_note: note,
      handled_at: status === "dismissed" || status === "actioned" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) back(REPORTS, { filtre: filter, erreur: error.message });
  await logAdminAction(userId, `report.${status}`, "report", id, note ? { note } : {});
  revalidatePath(REPORTS);
  back(REPORTS, { filtre: filter, ok: "Signalement mis à jour." });
}

export async function suspendShopAction(fd: FormData) {
  const { userId } = await requireAdmin();
  const shopId = str(fd, "shopId", 64);
  const reason = str(fd, "reason", 500);
  const from = safeFrom(str(fd, "from", 200));
  if (!shopId) back(from, { erreur: "Boutique manquante." });
  if (!reason) back(from, { erreur: "Indique la raison de la suspension (elle est conservée dans le journal)." });

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: shop, error } = await admin
    .from("shops")
    .update({ status: "suspended", suspended_at: now, suspended_reason: reason, suspended_by: userId })
    .eq("id", shopId)
    .select("slug, name")
    .single();
  if (error || !shop) back(from, { erreur: error?.message ?? "Boutique introuvable." });

  // Les signalements en attente de cette boutique sont considérés comme traités ;
  // ses mises en avant sont coupées (elles ne reviendraient pas seules à la réactivation).
  await Promise.all([
    admin.from("shop_reports").update({ status: "actioned", handled_at: now }).eq("shop_id", shopId).in("status", ["open", "reviewing"]),
    admin.from("market_boosts").update({ active: false }).eq("shop_id", shopId).eq("active", true),
  ]);
  await logAdminAction(userId, "shop.suspend", "shop", shopId, { reason, name: shop.name });
  revalidatePublic(shop.slug);
  revalidatePath(REPORTS);
  revalidatePath(MARKET);
  back(from, { ok: `« ${shop.name} » est suspendue : hors ligne, hors Market et hors annuaire.` });
}

export async function reactivateShopAction(fd: FormData) {
  const { userId } = await requireAdmin();
  const shopId = str(fd, "shopId", 64);
  const from = safeFrom(str(fd, "from", 200));
  if (!shopId) back(from, { erreur: "Boutique manquante." });

  const { data: shop, error } = await createAdminClient()
    .from("shops")
    .update({ status: "published", suspended_at: null, suspended_reason: null, suspended_by: null })
    .eq("id", shopId)
    .eq("status", "suspended")
    .select("slug, name")
    .single();
  if (error || !shop) back(from, { erreur: error?.message ?? "Boutique introuvable ou déjà active." });
  await logAdminAction(userId, "shop.reactivate", "shop", shopId, { name: shop.name });
  revalidatePublic(shop.slug);
  revalidatePath(REPORTS);
  back(from, { ok: `« ${shop.name} » est de nouveau en ligne.` });
}

// ── Règles du Market ─────────────────────────────────────────────────────────

export async function saveMarketSettingsAction(fd: FormData) {
  const { userId } = await requireAdmin();
  const until = str(fd, "launchUntil", 10);
  const launchMin = Number(str(fd, "launchMin", 3));
  const proMin = Number(str(fd, "proMin", 3));
  if (until && !isValidDay(until)) back(MARKET, { erreur: "Date de fin d'ouverture invalide." });
  if (!Number.isInteger(launchMin) || launchMin < 1 || launchMin > 100) back(MARKET, { erreur: "Seuil d'ouverture : entre 1 et 100 annonces." });
  if (!Number.isInteger(proMin) || proMin < 1 || proMin > 100) back(MARKET, { erreur: "Seuil Pro : entre 1 et 100 annonces." });

  const launchUntil = until ? dayEndExclusiveIso(until) : null;
  const { error } = await createAdminClient()
    .from("market_settings")
    .upsert({ id: true, launch_until: launchUntil, launch_min_items: launchMin, pro_min_items: proMin, updated_at: new Date().toISOString(), updated_by: userId });
  if (error) back(MARKET, { erreur: error.message });
  await logAdminAction(userId, "market.settings", "settings", null, { launch_until: launchUntil, launch_min_items: launchMin, pro_min_items: proMin });
  revalidatePublic();
  back(MARKET, { ok: "Règles du Market enregistrées." });
}

// ── Mises en avant ───────────────────────────────────────────────────────────

export async function createBoostAction(fd: FormData) {
  const { userId } = await requireAdmin();
  const shopId = str(fd, "shopId", 64);
  const productId = str(fd, "productId", 64);
  const placement = str(fd, "placement", 20);
  const title = str(fd, "title", 80);
  const subtitle = str(fd, "subtitle", 160);
  const cta = str(fd, "cta", 30);
  const categorySlug = str(fd, "category", 80);
  const citySlug = str(fd, "city", 60);
  const start = str(fd, "startsOn", 10);
  const end = str(fd, "endsOn", 10);
  const priority = Number(str(fd, "priority", 4) ?? 0);

  if (!shopId) back(MARKET, { erreur: "Choisis une boutique Pro." });
  if (placement !== "banner" && placement !== "spotlight") back(MARKET, { erreur: "Emplacement inconnu." });
  if (placement === "banner" && !title) back(MARKET, { erreur: "Une bannière a besoin d'un titre." });
  if (!start || !isValidDay(start) || !end || !isValidDay(end)) back(MARKET, { erreur: "Dates de début et de fin requises." });
  if (end < start) back(MARKET, { erreur: "La fin doit être après le début." });
  if (!Number.isInteger(priority) || priority < -100 || priority > 100) back(MARKET, { erreur: "Priorité entre -100 et 100." });
  const category = categorySlug ? getMarketCategory(categorySlug) : null;
  if (categorySlug && !category) back(MARKET, { erreur: "Catégorie inconnue." });
  const city = citySlug ? getMarketCity(citySlug) : null;
  if (citySlug && !city) back(MARKET, { erreur: "Ville inconnue." });

  const { data, error } = await createAdminClient()
    .from("market_boosts")
    .insert({
      shop_id: shopId,
      product_id: productId,
      placement,
      title,
      subtitle,
      cta_label: cta,
      category_slug: category?.slug ?? null,
      category_keys: category ? category.leafKeys : null,
      city: city?.slug ?? null,
      starts_at: dayStartIso(start),
      ends_at: dayEndExclusiveIso(end),
      priority,
      source: "admin",
      created_by: userId,
    })
    .select("id")
    .single();
  if (error || !data) back(MARKET, { erreur: error?.message ?? "Création impossible." });
  await logAdminAction(userId, "boost.create", "boost", data.id, { placement, shop_id: shopId, product_id: productId });
  revalidatePublic();
  back(MARKET, { ok: "Mise en avant créée." });
}

export async function toggleBoostAction(fd: FormData) {
  const { userId } = await requireAdmin();
  const id = str(fd, "id", 64);
  const active = str(fd, "active", 5) === "true";
  if (!id) back(MARKET, { erreur: "Mise en avant manquante." });
  const { error } = await createAdminClient().from("market_boosts").update({ active }).eq("id", id);
  if (error) back(MARKET, { erreur: error.message });
  await logAdminAction(userId, active ? "boost.resume" : "boost.pause", "boost", id);
  revalidatePublic();
  back(MARKET, { ok: active ? "Mise en avant réactivée." : "Mise en avant désactivée." });
}

// ── Classement des annonces ──────────────────────────────────────────────────

export async function setProductCategoryAction(fd: FormData) {
  const { userId } = await requireAdmin();
  const productId = str(fd, "productId", 64);
  const category = str(fd, "category", 80);
  if (!productId || !category || !isMarketLeaf(category)) back(MARKET, { erreur: "Choisis une catégorie dans la liste." });
  const { error } = await createAdminClient().from("products").update({ market_category: category }).eq("id", productId);
  if (error) back(MARKET, { erreur: error.message });
  await logAdminAction(userId, "product.categorize", "product", productId, { category });
  revalidatePublic();
  back(MARKET, { ok: "Annonce classée." });
}

// ── Annonces choisies (boutiques sous le seuil, migration 0032) ──────────────

export async function toggleMarketPickAction(fd: FormData) {
  const { userId } = await requireAdmin();
  const productId = str(fd, "productId", 64);
  const pick = str(fd, "pick", 5) === "true";
  if (!productId) back(MARKET, { erreur: "Annonce introuvable." });
  const admin = createAdminClient();
  const { data: product } = await admin.from("products").select("id, shops(slug)").eq("id", productId).maybeSingle();
  if (!product) back(MARKET, { erreur: "Annonce introuvable." });
  const { error } = pick
    ? await admin.from("market_product_picks").upsert({ product_id: productId, picked_by: userId }, { onConflict: "product_id" })
    : await admin.from("market_product_picks").delete().eq("product_id", productId);
  if (error) back(MARKET, { erreur: error.message });
  await logAdminAction(userId, pick ? "product.market_pick" : "product.market_unpick", "product", productId, {});
  const shop = (product as { shops: { slug: string } | { slug: string }[] | null }).shops;
  revalidatePublic(Array.isArray(shop) ? shop[0]?.slug : shop?.slug);
  back(MARKET, { ok: pick ? "Annonce ajoutée au Market." : "Annonce retirée du Market." });
}
