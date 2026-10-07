// Test réel de la V2 multi-photos (étapes 1 → 3 + rendu), à lancer sur le Mac (OpenRouter + Anthropic).
//
//   npx vite-node --config vitest.config.ts scripts/poster-v2-scene.ts -- <dossier-photos> \
//       --name "BMW X4 M40i 2020" --price 32500000 --phone 771234567 \
//       [--industry automotive] [--category "SUV"] [--business "Auto Dakar"] [--logo chemin.png] \
//       [--photos face.jpeg,interieur.jpeg,arriere.jpeg] [--layout HERO_DETAIL.B] [--guide]
//
// --photos : 1 à 3 fichiers du dossier, la 1re est la photo principale (★). Sans --photos : les 3
// premières photos du dossier par ordre alphabétique.
// Résultats dans tmp/poster-v2/<date>/ : scene-N.jpg, poster-<mise en page>.jpg, report.json.
// Aucune écriture en base, aucun quota consommé.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeRaw, applyGate, localMetrics, type AnalysisImage } from "@/lib/poster-v2/analysis";
import { eligibleLayouts } from "@/lib/poster-v2/eligibility";
import { directPoster, benefitCandidates } from "@/lib/poster-v2/creative-director";
import { produceScene } from "@/lib/poster-v2/scene-step";
import { generateScene, type SceneRequest } from "@/lib/poster-v2/scene";
import { renderPosterV2 } from "@/lib/poster-v2/render";
import { LayoutUnfitError, type LayoutId } from "@/lib/poster-v2/types";

async function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      for (const line of (await readFile(f, "utf8")).split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* fichier absent */
    }
  }
}

function args() {
  const a = process.argv.slice(2).filter((x) => x !== "--");
  const opt = (k: string) => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const dir = a.find((x, i) => !x.startsWith("--") && !a[i - 1]?.startsWith("--"));
  if (!dir || !opt("name") || !opt("phone")) {
    console.error('Usage : … scripts/poster-v2-scene.ts -- <dossier> --name "…" --phone 77… [--price 25000]');
    process.exit(1);
  }
  return {
    dir,
    name: opt("name")!,
    phone: opt("phone")!,
    price: opt("price") ? Number(opt("price")) : null,
    industry: opt("industry") ?? null,
    category: opt("category") ?? null,
    business: opt("business") ?? null,
    logo: opt("logo") ?? null,
    photos: opt("photos")?.split(",").map((f) => f.trim()).filter(Boolean) ?? null,
    layout: (opt("layout") as LayoutId | undefined) ?? null,
    guide: a.includes("--guide"),
  };
}

const MEDIA: Record<string, AnalysisImage["mediaType"]> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function main() {
  await loadEnv();
  const o = args();
  const files = (o.photos ?? (await readdir(o.dir)).filter((f) => MEDIA[path.extname(f).toLowerCase()]).sort()).slice(0, 3);
  for (const f of files) if (!MEDIA[path.extname(f).toLowerCase()]) throw new Error(`format non géré : ${f}`);
  const images: AnalysisImage[] = await Promise.all(files.map(async (f) => ({ buffer: await readFile(path.join(o.dir, f)), mediaType: MEDIA[path.extname(f).toLowerCase()] })));
  const out = path.join("tmp", "poster-v2", new Date().toISOString().replace(/[:.]/g, "-"));
  await mkdir(out, { recursive: true });
  const report: Record<string, unknown> = { input: { ...o, files } };
  const t = (label: string, t0: number) => console.log(`  ${label} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  console.log(`→ ${files.length} photo(s), sortie : ${out}`);
  let t0 = Date.now();
  const raw = await analyzeRaw(images, o.name, true);
  const gate = applyGate(raw, await Promise.all(images.map((i) => localMetrics(i.buffer))), { heroFixed: true });
  t("1. analyse", t0);
  report.gate = gate.ok ? { ok: true, secondaries: gate.secondaries, excluded: gate.excluded } : { ok: false, reason: gate.reason, excluded: gate.excluded };
  if (!gate.ok || !raw) {
    console.log(`✗ repli V1 : ${gate.ok ? "?" : gate.reason}`);
    return void (await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2)));
  }

  const hero = images[gate.heroIndex].buffer;
  const secondaries = gate.secondaries.map((s) => images[s.index].buffer);
  const benefitsCount = Math.min(3, benefitCandidates({ vendorBenefits: [], analysis: raw }).length);
  const eligible = eligibleLayouts({
    heroQuality: gate.heroQuality,
    secondaries: gate.secondaries,
    industry: o.industry,
    category: o.category,
    title: o.name,
    benefitsCount,
  });
  t0 = Date.now();
  const direction = await directPoster({
    productName: o.name,
    industry: o.industry,
    category: o.category,
    price: o.price,
    businessName: o.business,
    analysis: raw,
    secondaries: gate.secondaries,
    eligible,
    heroImage: hero,
  });
  if (o.layout && direction.tryOrder.includes(o.layout)) {
    direction.layout = o.layout;
    direction.tryOrder = [o.layout, ...direction.tryOrder.filter((l) => l !== o.layout)];
  }
  t("2. direction artistique", t0);
  console.log(`  mise en page ${direction.layout} · ${direction.typePair} · ${direction.scene.environment}`);
  report.direction = direction;

  t0 = Date.now();
  let n = 0;
  const step = await produceScene(
    { direction, analysis: raw, productName: o.name, hero, secondaries, layoutGuide: o.guide },
    {
      generate: async (req: SceneRequest) => {
        const r = await generateScene(req);
        n++;
        await writeFile(path.join(out, `scene-${n}.jpg`), r.image);
        await writeFile(path.join(out, `scene-${n}-prompt.txt`), r.prompt);
        console.log(`  scène ${n} : ${r.width}×${r.height} (${r.aspect}${r.aspect !== r.requestedAspect ? `, demandé ${r.requestedAspect}` : ""})`);
        return r;
      },
      check: (await import("@/lib/poster-v2/qa")).checkScene,
    }
  );
  t("3. scène + contrôle", t0);
  report.scene = { ...step, scene: step.status === "ok" ? { ...step.scene, image: undefined, prompt: undefined } : undefined };
  for (const a of step.attempts) console.log(`  essai ${a.layout} → ${a.outcome}${a.issues.length ? ` : ${a.issues.join(" | ")}` : ""}`);
  if (step.status !== "ok") {
    console.log(`✗ repli V1 : ${step.reason}`);
    return void (await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2)));
  }

  t0 = Date.now();
  const logo = o.logo ? await readFile(o.logo) : null;
  const renders: Record<string, unknown>[] = [];
  for (const layout of step.layouts) {
    try {
      const r = await renderPosterV2({
        layout,
        typePair: direction.typePair,
        palette: direction.palette,
        scene: step.scene.image,
        secondaries: gate.secondaries.map((s) => ({ image: images[s.index].buffer, role: s.role, caption: s.caption, focus: s.focus, quality: s.quality })),
        content: { ...direction.copy, price: o.price, phone: o.phone, businessName: o.business, logo },
      });
      await writeFile(path.join(out, `poster-${layout}.jpg`), r.image);
      renders.push({ layout, ok: true, warnings: r.warnings });
      console.log(`  ✓ poster-${layout}.jpg${r.warnings.length ? ` (${r.warnings.join(", ")})` : ""}`);
    } catch (e) {
      renders.push({ layout, ok: false, error: e instanceof LayoutUnfitError ? e.reason : String(e) });
      console.log(`  ✗ ${layout} : ${e instanceof Error ? e.message : e}`);
    }
  }
  t("4. rendu", t0);
  report.renders = renders;
  report.calls = step.calls;
  await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(`✓ terminé — ${step.calls.image} image(s), ${step.calls.qa} contrôle(s) + 2 Sonnet (analyse, direction)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
