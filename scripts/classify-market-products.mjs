// Classe les produits existants dans une catégorie Jaarle Market (products.market_category)
// grâce à l'IA (Claude Haiku 4.5 : nom, description, rayon de la boutique + 1re photo), et
// affiche pour chaque boutique ce qui lui manque encore pour apparaître sur le Market.
//
// Prérequis : migration 0020_market.sql appliquée ; .env.local avec NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY et ANTHROPIC_API_KEY.
//
// Usage :
//   npx tsx scripts/classify-market-products.mjs                 # simulation, boutiques Pro seulement
//   npx tsx scripts/classify-market-products.mjs --apply         # écrit les catégories
//   options : --shop <slug>   une seule boutique
//             --all-shops     toutes les boutiques (pas seulement les Pro)
//             --force         reclasse aussi les produits qui ont déjà une catégorie
import { readFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getMarketCategory, isMarketLeaf, marketLeafOptions, MARKET_INDUSTRIES } from "../lib/market/categories.ts";

for (const line of readFileSync("./.env.local", "utf-8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const ALL_SHOPS = args.includes("--all-shops");
const SHOP = args.includes("--shop") ? args[args.indexOf("--shop") + 1] : null;
const MODEL = process.env.MARKET_CLASSIFY_MODEL || "claude-haiku-4-5-20251001";
const BATCH = 8;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.ANTHROPIC_API_KEY) {
  console.error("Variables manquantes dans .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY).");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anthropic = new Anthropic();

const GROUPS = marketLeafOptions();
const KEYS = GROUPS.flatMap((g) => g.options.map((o) => o.key));
const LIST = GROUPS.map((g) => `${g.group} : ${g.options.map((o) => `${o.key} (${o.label})`).join(", ")}`).join("\n");
const MARKET_INDUSTRY_KEYS = new Set(MARKET_INDUSTRIES.map((i) => i.industryKey));
const imageUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}`;

const Result = z.object({
  items: z.array(z.object({ id: z.string(), marketCategory: z.enum([...KEYS, "none"]) })),
});

async function targetShops() {
  let q = db.from("shops").select("id, slug, name, owner_id, industry, whatsapp, status");
  if (SHOP) q = q.eq("slug", SHOP);
  const { data: shops, error } = await q;
  if (error) throw error;
  if (SHOP || ALL_SHOPS) return shops;
  const now = new Date().toISOString();
  const { data: subs, error: subErr } = await db
    .from("subscriptions")
    .select("user_id")
    .eq("status", "active")
    .neq("plan_key", "free")
    .lte("starts_at", now)
    .gt("ends_at", now);
  if (subErr) throw subErr;
  const pro = new Set((subs ?? []).map((s) => s.user_id));
  return shops.filter((s) => pro.has(s.owner_id));
}

async function diagnose(shop, isPro) {
  const { data: products } = await db
    .from("products")
    .select("id, product_images(id)")
    .eq("shop_id", shop.id)
    .in("status", ["active", "sold_out"]);
  const withPhoto = (products ?? []).filter((p) => (p.product_images ?? []).length > 0).length;
  return [
    [isPro, "abonnement Pro actif"],
    [shop.status === "published", "boutique publiée"],
    [MARKET_INDUSTRY_KEYS.has(shop.industry), `secteur de vente de produits (actuel : ${shop.industry ?? "aucun"})`],
    [withPhoto >= 3, `au moins 3 produits en vente avec photo (${withPhoto})`],
  ];
}

async function classify(shop, batch) {
  const content = [];
  for (const p of batch) {
    content.push({
      type: "text",
      text: `Produit id=${p.id}\nNom : ${p.name}\nRayon dans la boutique : ${p.category ?? "—"}\nDescription : ${(p.description ?? "—").slice(0, 300)}`,
    });
    if (p.image) content.push({ type: "image", source: { type: "url", url: imageUrl(p.image) } });
  }
  content.push({
    type: "text",
    text: `Boutique « ${shop.name} » (secteur : ${shop.industry ?? "inconnu"}), au Sénégal.
Pour CHAQUE produit ci-dessus, choisis la catégorie Jaarle Market la plus précise dans cette liste (la clé seulement), ou "none" si aucune ne convient vraiment :
${LIST}
Règles : le TYPE d'article doit correspondre exactement (un jean, un pantalon ou un short n'est jamais un t-shirt ; une casquette n'est pas des lunettes). Un ensemble haut + bas va dans « ensembles » ; un jogging seul dans « joggings ». S'il n'existe aucune catégorie du même type, réponds "none" plutôt qu'une catégorie approchante.
Réponds avec un élément par produit, en reprenant exactement son id.`,
  });
  const message = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(Result) },
  });
  return message.parsed_output?.items ?? [];
}

async function main() {
  console.log(`${APPLY ? "ÉCRITURE" : "SIMULATION (ajoute --apply pour écrire)"} — modèle ${MODEL}\n`);
  const shops = await targetShops();
  if (shops.length === 0) {
    console.log("Aucune boutique concernée.");
    return;
  }
  const now = new Date().toISOString();
  const { data: subs } = await db.from("subscriptions").select("user_id").eq("status", "active").neq("plan_key", "free").lte("starts_at", now).gt("ends_at", now);
  const pro = new Set((subs ?? []).map((s) => s.user_id));

  let total = 0;
  let classified = 0;
  for (const shop of shops) {
    console.log(`━━ ${shop.name} (/boutique/${shop.slug})`);
    let q = db
      .from("products")
      .select("id, name, description, category, market_category, product_images(path, position)")
      .eq("shop_id", shop.id)
      .in("status", ["active", "sold_out"]);
    if (!FORCE) q = q.is("market_category", null);
    const { data: rows, error } = await q;
    if (error) {
      console.error("  Lecture impossible :", error.message, "\n  (la migration 0020_market.sql est-elle appliquée ?)");
      process.exit(1);
    }
    const products = (rows ?? []).map((p) => ({
      ...p,
      image: [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.path ?? null,
    }));
    if (products.length === 0) console.log("  Tous les produits en vente ont déjà une catégorie.");

    for (let i = 0; i < products.length; i += BATCH) {
      const batch = products.slice(i, i + BATCH);
      let items = [];
      try {
        items = await classify(shop, batch);
      } catch (err) {
        console.error(`  Échec IA sur un lot (${err?.message ?? err}) — lot ignoré.`);
        continue;
      }
      for (const p of batch) {
        total++;
        const key = items.find((it) => it.id === p.id)?.marketCategory;
        const ok = key && key !== "none" && isMarketLeaf(key);
        const label = ok ? `${getMarketCategory(getMarketCategory(key).parentSlug)?.label ?? ""} › ${getMarketCategory(key).label}` : "— aucune catégorie adaptée";
        console.log(`  ${ok ? "✓" : "·"} ${p.name.padEnd(42).slice(0, 42)} → ${label}`);
        if (!ok) continue;
        classified++;
        if (APPLY) {
          const { error: upErr } = await db.from("products").update({ market_category: key }).eq("id", p.id);
          if (upErr) console.error(`    écriture impossible : ${upErr.message}`);
        }
      }
    }

    const checks = await diagnose(shop, pro.has(shop.owner_id));
    const missing = checks.filter(([ok]) => !ok);
    console.log(missing.length === 0 ? "  ✅ Remplit toutes les conditions du Market." : "  Conditions du Market :");
    for (const [ok, label] of checks) if (missing.length) console.log(`    ${ok ? "✓" : "✗"} ${label}`);
    console.log("");
  }

  console.log(`${classified}/${total} produit(s) ${APPLY ? "classé(s)" : "à classer"}.`);
  if (APPLY) {
    const { data: listed } = await db.rpc("market_shops", { p_limit: 100 });
    console.log(`Boutiques visibles sur le Market : ${(listed ?? []).map((s) => s.name).join(", ") || "aucune"}.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
