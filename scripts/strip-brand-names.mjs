// Retire les noms de marques (Supreme, Nike, Gucci…) du nom et de la description des produits
// existants — règle de vente de Jaarle. Les nouveaux produits sont nettoyés à l'enregistrement.
// L'adresse (slug) des produits ne change pas, pour ne pas casser les liens déjà partagés.
//
// Usage :
//   npx tsx scripts/strip-brand-names.mjs               # simulation : affiche les changements
//   npx tsx scripts/strip-brand-names.mjs --apply       # écrit les changements
//   option : --shop <slug>   une seule boutique
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { containsBrand, stripBrands, stripBrandsFromName } from "../lib/shops/brands.ts";

for (const line of readFileSync("./.env.local", "utf-8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const SHOP = args.includes("--shop") ? args[args.indexOf("--shop") + 1] : null;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  console.log(APPLY ? "ÉCRITURE\n" : "SIMULATION (ajoute --apply pour écrire)\n");
  let shopId = null;
  if (SHOP) {
    const { data, error } = await db.from("shops").select("id").eq("slug", SHOP).maybeSingle();
    if (error || !data) throw new Error(`Boutique introuvable : ${SHOP}`);
    shopId = data.id;
  }
  let changed = 0;
  for (let from = 0; ; from += 1000) {
    let q = db.from("products").select("id, name, description, shops(name)").order("id").range(from, from + 999);
    if (shopId) q = q.eq("shop_id", shopId);
    const { data, error } = await q;
    if (error) throw error;
    for (const p of data ?? []) {
      if (!containsBrand(p.name) && !containsBrand(p.description)) continue;
      const name = stripBrandsFromName(p.name);
      const description = p.description ? stripBrands(p.description) || null : null;
      changed++;
      console.log(`  ${(p.shops?.name ?? "").padEnd(18).slice(0, 18)} ${p.name}  →  ${name}`);
      if (APPLY) {
        const { error: upErr } = await db.from("products").update({ name, description }).eq("id", p.id);
        if (upErr) console.error(`    écriture impossible : ${upErr.message}`);
      }
    }
    if (!data || data.length < 1000) break;
  }
  console.log(`\n${changed} produit(s) ${APPLY ? "nettoyé(s)" : "à nettoyer"}.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
