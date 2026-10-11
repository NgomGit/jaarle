// Contrôle des pages publiques (Market, boutiques, fiches) — lecture seule, sans dépendance.
//   node scripts/smoke-public-routes.mjs https://jaarle.com
// À lancer avant / après un déploiement. Le script ne suit jamais /r/wa (un clic WhatsApp serait
// compté dans les statistiques du vendeur) et n'exécute pas le JavaScript des pages (aucune vue
// comptée). Une fiche produit et une fiche service sont trouvées automatiquement sur le Market.

export async function smoke(base, fetchImpl = fetch) {
  const results = [];
  const get = async (path) => {
    const res = await fetchImpl(new URL(path, base), { redirect: "manual" });
    return { status: res.status, html: res.status === 200 ? await res.text() : "" };
  };
  const meta = (html, key) => html.match(new RegExp(`<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]*)"`))?.[1] ?? null;
  const canonical = (html) => html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1] ?? null;
  const title = (html) => html.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
  const ldTypes = (html) =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
      try {
        const j = JSON.parse(m[1]);
        return (Array.isArray(j) ? j : [j]).map((x) => x?.["@type"]).filter(Boolean);
      } catch {
        return ["(invalide)"];
      }
    });
  const cards = (html) => (html.match(/<article/g) ?? []).length;
  const firstItem = (html) => html.match(/href="(\/boutique\/[a-z0-9-]+\/p\/[a-z0-9-]+)/)?.[1] ?? null;

  const check = async (path, expect) => {
    const r = await get(path);
    const errors = [];
    const statuses = [expect.status ?? 200].flat();
    if (!statuses.includes(r.status)) errors.push(`statut ${r.status}`);
    if (r.status === 200) {
      if (expect.canonical !== false && !canonical(r.html)) errors.push("canonique absente");
      if (!title(r.html)) errors.push("titre vide");
      if (expect.noindex !== undefined && /noindex/.test(meta(r.html, "robots") ?? "") !== expect.noindex) errors.push(`robots inattendu (${meta(r.html, "robots")})`);
      if (expect.ogImage && !meta(r.html, "og:image")) errors.push("og:image absente");
      if (expect.minCards && cards(r.html) < expect.minCards) errors.push(`${cards(r.html)} carte(s) < ${expect.minCards}`);
      for (const t of expect.ld ?? []) if (!ldTypes(r.html).includes(t)) errors.push(`JSON-LD ${t} absent`);
      for (const s of expect.contains ?? []) if (!r.html.includes(s)) errors.push(`texte absent : ${s}`);
      for (const s of expect.notContains ?? []) if (r.html.includes(s)) errors.push(`texte inattendu : ${s}`);
    }
    results.push({ path, ok: errors.length === 0, errors, title: title(r.html) });
    return r;
  };

  await check("/market", { ld: ["WebSite", "BreadcrumbList"], minCards: 4 });
  await check("/market/mode", { ld: ["BreadcrumbList", "ItemList"], minCards: 1 });
  await check("/market/dakar", { minCards: 1 });
  await check("/market/mode/dakar", { minCards: 1 });
  await check("/market/services", {});
  // Préexistant (2026-10-11) : une page Market inconnue répond 200 « Page introuvable » en noindex
  // au lieu de 404. Toléré ici tant que la page reste non indexée.
  await check("/market/n-existe-pas", { status: [404, 200], noindex: true, canonical: false });
  const products = await check("/market/recherche?type=produits", { noindex: true, minCards: 1, canonical: false });
  const services = await check("/market/recherche?type=services", { noindex: true, canonical: false });
  await check("/market/recherche?q=robe", { noindex: true, canonical: false });
  await check("/boutiques", {});

  const p = firstItem(products.html);
  if (p) {
    const shop = p.split("/p/")[0];
    await check(shop, { ld: ["Store"], ogImage: true });
    await check(p, { ogImage: true, contains: ["Commander sur WhatsApp"] });
    const og = await get(`${p}/opengraph-image`);
    results.push({ path: `${p}/opengraph-image`, ok: og.status === 200, errors: og.status === 200 ? [] : [`statut ${og.status}`] });
  } else results.push({ path: "(fiche produit)", ok: false, errors: ["aucun produit trouvé sur le Market"] });

  const s = firstItem(services.html);
  if (s) {
    await check(s, { ogImage: true, ld: ["Service"], contains: ["Réserver sur WhatsApp"] });
    const og = await get(`${s}/opengraph-image`);
    results.push({ path: `${s}/opengraph-image`, ok: og.status === 200, errors: og.status === 200 ? [] : [`statut ${og.status}`] });
  } else results.push({ path: "(fiche service)", ok: true, errors: [], title: "aucun service sur le Market : contrôle ignoré" });

  return results;
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("smoke-public-routes.mjs")) {
  const base = process.argv[2] || "http://localhost:3000";
  const results = await smoke(base);
  for (const r of results) console.log(`${r.ok ? "OK  " : "ÉCHEC"} ${r.path}${r.errors.length ? ` — ${r.errors.join(", ")}` : ""}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} contrôles réussis sur ${base}`);
  process.exit(failed ? 1 : 0);
}
