// Bulk Upload — PHASE 0 : banc d'évaluation du regroupement IA (aucune écriture en base, aucun
// produit créé, aucune route appelée, aucun quota consommé). Lit des lots locaux, écrit un rapport
// dans tmp/bulk-group-eval/<date>/. Documentation : docs/bulk-group-eval.md
//
//   # 1. Lots synthétiques (facultatif)
//   npx vite-node --config vitest.config.ts scripts/bulk-group-fixtures.ts
//   # 2. Simulation sans IA (vérifie lots, mesures et rapport ; 0 appel externe)
//   npx vite-node --config vitest.config.ts scripts/bulk-group-eval.ts -- --mock
//   # 3. Ce qui serait envoyé (nombre d'images, tokens, coût estimé ; 0 appel externe)
//   npx vite-node --config vitest.config.ts scripts/bulk-group-eval.ts -- --dry-run --models haiku,sonnet
//   # 4. Évaluation réelle (appels Anthropic, clé ANTHROPIC_API_KEY de .env.local)
//   npx vite-node --config vitest.config.ts scripts/bulk-group-eval.ts -- --models haiku,sonnet --runs 3
//
// Options : --lots <dossier> (défaut tmp/bulk-group-lots) · --lot a,b · --models haiku,sonnet,<id>
//           --runs N · --size 512 · --shuffle <graine> · --concurrency 2 · --out <dossier>
//           --mock · --dry-run · --hash-hints · --include-synthetic=false
//           --thinking on,off (réflexion interne du modèle, défaut : off)
//           --prompt v1,v2 (consignes à comparer, défaut v2) · --verify (ajoute la 2e vérification ciblée ;
//           avec --verify=both, chaque configuration est mesurée avec ET sans)

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_BULK_GROUP_MODEL,
  HAIKU_MODEL,
  groupMediaWithAi,
  normalizeGrouping,
  type GroupingImage,
  type GroupingOutput,
  type GroupingPromptVersion,
} from "@/lib/ai/bulk-group";
import { applyVerification, suspiciousPairs, verifyPairsWithAi } from "@/lib/ai/bulk-group-verify";
import { estimateImageTokens, exactDuplicatePairs, groupingThumbnail, imagePrint, nearDuplicatePairs, type ImagePrint } from "@/lib/ai/bulk-group-hash";
import {
  expandTruth,
  LotTruthSchema,
  PHASE1_THRESHOLDS,
  scoreLot,
  summarize,
  verdict,
  type CallRecord,
  type ExpandedTruth,
  type LotTruth,
} from "@/lib/ai/bulk-group-eval";
import { tokenCostUsd } from "@/lib/billing/usage";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm"]);
const MODEL_ALIASES: Record<string, string> = { haiku: HAIKU_MODEL, sonnet: "claude-sonnet-5", default: DEFAULT_BULK_GROUP_MODEL };
const PROMPT_TOKENS_ESTIMATE = 1300;

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

function parseArgs() {
  const a = process.argv.slice(2).filter((x) => x !== "--");
  const opt = (k: string) => {
    const i = a.indexOf(`--${k}`);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return {
    lotsDir: opt("lots") ?? "tmp/bulk-group-lots",
    only: opt("lot")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null,
    models: (opt("models") ?? "haiku").split(",").map((m) => MODEL_ALIASES[m.trim()] ?? m.trim()),
    runs: Math.max(1, Number(opt("runs") ?? 1)),
    size: Number(opt("size") ?? 512),
    shuffle: opt("shuffle") != null ? Number(opt("shuffle")) : null,
    concurrency: Math.max(1, Number(opt("concurrency") ?? 2)),
    out: opt("out") ?? path.join("tmp/bulk-group-eval", stamp),
    mock: a.includes("--mock"),
    dryRun: a.includes("--dry-run"),
    /** Envoie aussi à l'IA les paires « très proches » calculées (par défaut : seulement les fichiers identiques). */
    hashHints: a.includes("--hash-hints"),
    includeSynthetic: !a.includes("--include-synthetic=false"),
    prompts: (opt("prompt") ?? "v2").split(",").map((p) => (p.trim() === "v1" ? "v1" : "v2")) as GroupingPromptVersion[],
    thinkings: (opt("thinking") ?? "off").split(",").map((t) => (t.trim() === "on" ? "on" : "off")) as ("on" | "off")[],
    verify: a.includes("--verify=both") ? [false, true] : a.includes("--verify") ? [true] : [false],
  };
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Lots ───────────────────────────────────────────────────────────────────────────────────────

interface PreparedLot {
  name: string;
  truth: LotTruth;
  expanded: ExpandedTruth;
  images: GroupingImage[];
  tokensEstimate: number;
  exactDuplicates: [number, number][];
  similarPairs: [number, number][];
  prints: ImagePrint[];
}

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** 3 images d'une vidéo (20 %, 50 %, 80 % de la durée), comme le fera le navigateur en phase 1. */
function extractFrames(video: string, cacheDir: string): string[] {
  const duration = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", video]).toString().trim()
  );
  const base = path.basename(video, path.extname(video));
  return [20, 50, 80].map((p) => {
    const out = path.join(cacheDir, `${base}__f${p}.jpg`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(((duration || 1) * p) / 100), "-i", video, "-frames:v", "1", "-q:v", "3", out]);
    return out;
  });
}

async function prepareLot(dir: string, name: string, args: ReturnType<typeof parseArgs>, cacheRoot: string): Promise<PreparedLot | { error: string }> {
  const truthPath = path.join(dir, "truth.json");
  if (!existsSync(truthPath)) return { error: "truth.json absent" };
  const parsed = LotTruthSchema.safeParse(JSON.parse(await readFile(truthPath, "utf8")));
  if (!parsed.success) return { error: `truth.json invalide : ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" ; ")}` };
  const truth = parsed.data;
  if (!truth.synthetic && !truth.consent?.trim() && !args.mock && !args.dryRun) {
    return { error: "lot réel sans champ « consent » dans truth.json : refusé (aucune photo n'est envoyée sans autorisation écrite)" };
  }

  const entries = (await readdir(dir)).filter((f) => !f.startsWith(".")).sort();
  const images = entries.filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()));
  const videos = entries.filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()));
  const unsupported = entries.filter((f) => f !== "truth.json" && !IMAGE_EXT.has(path.extname(f).toLowerCase()) && !VIDEO_EXT.has(path.extname(f).toLowerCase()));
  if (unsupported.length) console.warn(`  ${name} : fichiers ignorés (format) : ${unsupported.join(", ")} — convertis les HEIC en JPG.`);

  const media: { file: string; abs: string; videoRef: string | null }[] = images.map((f) => ({ file: f, abs: path.join(dir, f), videoRef: null }));
  const frameSource: Record<string, string> = {};
  if (videos.length) {
    if (!hasFfmpeg()) return { error: "le lot contient des vidéos mais ffmpeg/ffprobe est absent (brew install ffmpeg)" };
    const cacheDir = path.join(cacheRoot, "frames", name);
    await mkdir(cacheDir, { recursive: true });
    for (const v of videos) {
      for (const abs of extractFrames(path.join(dir, v), cacheDir)) {
        const f = path.basename(abs);
        frameSource[f] = v;
        media.push({ file: f, abs, videoRef: path.basename(v, path.extname(v)) });
      }
    }
  }
  // Ordre : celui de l'appareil (nom de fichier), images de vidéos à la fin ; mélange facultatif.
  if (args.shuffle != null) {
    const r = rng(args.shuffle);
    for (let i = media.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [media[i], media[j]] = [media[j], media[i]];
    }
  }

  const expanded = expandTruth(truth, media.map((m) => m.file), frameSource);
  if (!expanded.ok) return { error: `truth.json incohérent :\n    - ${expanded.errors.join("\n    - ")}` };

  const thumbs: GroupingImage[] = [];
  const prints: ImagePrint[] = [];
  let tokensEstimate = PROMPT_TOKENS_ESTIMATE;
  for (const m of media) {
    const buf = await readFile(m.abs);
    const t = await groupingThumbnail(buf, args.size);
    thumbs.push({ base64: t.base64, videoRef: m.videoRef });
    prints.push(await imagePrint(buf));
    tokensEstimate += estimateImageTokens(t.width, t.height) + 8;
  }
  // Images d'une même vidéo presque identiques : en phase 1, le navigateur n'en gardera qu'une.
  const exactDuplicates = exactDuplicatePairs(prints);
  const exactKeys = new Set(exactDuplicates.map(([a, b]) => `${a}-${b}`));
  const similarPairs = nearDuplicatePairs(prints).filter(([a, b]) => !exactKeys.has(`${a}-${b}`));
  return { name, truth, expanded: expanded.value, images: thumbs, tokensEstimate, exactDuplicates, similarPairs, prints };
}

// ─── Simulation (sans IA) ───────────────────────────────────────────────────────────────────────

/**
 * Prédicteur simulé, déterministe : part de la vérité puis injecte des erreurs typiques (fusion de
 * deux articles, article éclaté, photo oubliée, indice invalide, principale hors groupe, doute sur
 * les photos ambiguës). Sert uniquement à vérifier le banc et le rapport.
 */
function mockPrediction(lot: PreparedLot, seed: number): GroupingOutput {
  const r = rng(seed);
  const ids = [...new Set(lot.expanded.groupOf)];
  const members = ids.map((id) => lot.expanded.groupOf.map((g, i) => (g === id ? i + 1 : -1)).filter((i) => i > 0));
  const out: GroupingOutput = { groups: [], unsure: [], duplicates: [], variants: [] };
  let forgot = false;
  members.forEach((items, k) => {
    const kept = items.filter((i) => {
      if (lot.expanded.ambiguous.has(i - 1)) {
        out.unsure.push({ item: i, candidates: [`G${k + 1}`], reason: "simulé : ambigu" });
        return false;
      }
      if (!forgot && r() < 0.15) {
        forgot = true;
        return false;
      }
      return true;
    });
    if (kept.length) out.groups.push({ key: `G${k + 1}`, items: kept, main: kept[0], confidence: r() < 0.8 ? "high" : "medium", label: ids[k], reason: "simulé" });
  });
  if (out.groups.length >= 3 && r() < 0.7) {
    const [a, b] = [out.groups[0], out.groups[1]];
    a.items.push(...b.items);
    out.groups.splice(1, 1);
  }
  const big = out.groups.find((g) => g.items.length >= 3);
  if (big && r() < 0.6) out.groups.push({ key: "GX", items: [big.items.pop()!], main: 999, confidence: "low", label: "fragment", reason: "simulé" });
  if (out.groups[0]) out.groups[0].items.push(lot.images.length + 5);
  return out;
}

// ─── Exécution ──────────────────────────────────────────────────────────────────────────────────

async function pool<T>(tasks: (() => Promise<T>)[], n: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]();
      }
    })
  );
  return results;
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

async function main() {
  await loadEnv();
  const args = parseArgs();
  const mode = args.mock ? "simulation (sans IA)" : args.dryRun ? "dry-run (rien n'est envoyé)" : "réel (appels Anthropic)";
  console.log(`Banc de regroupement — mode ${mode}\nLots : ${args.lotsDir}  ·  modèles : ${args.mock ? "mock" : args.models.join(", ")}  ·  passages : ${args.runs}\n`);
  if (!args.mock && !args.dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY absente (.env.local).");
    process.exit(1);
  }
  if (!existsSync(args.lotsDir)) {
    console.error(`Dossier introuvable : ${args.lotsDir}. Génère des lots synthétiques (scripts/bulk-group-fixtures.ts) ou ajoute tes lots (docs/bulk-group-eval.md).`);
    process.exit(1);
  }
  await mkdir(args.out, { recursive: true });

  const lotNames = (await readdir(args.lotsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name)
    .filter((n) => !args.only || args.only.includes(n))
    .sort();

  const lots: PreparedLot[] = [];
  const skipped: { lot: string; error: string }[] = [];
  for (const name of lotNames) {
    const prepared = await prepareLot(path.join(args.lotsDir, name), name, args, args.out);
    if ("error" in prepared) {
      skipped.push({ lot: name, error: prepared.error });
      console.warn(`✗ ${name} ignoré : ${prepared.error}`);
      continue;
    }
    if (prepared.truth.synthetic && !args.includeSynthetic) continue;
    lots.push(prepared);
    const hashFalse = prepared.similarPairs.filter(([a, b]) => prepared.expanded.groupOf[a] !== prepared.expanded.groupOf[b]).length;
    console.log(`• ${name}${prepared.truth.synthetic ? " [synthétique]" : ""} : ${prepared.images.length} images, ${new Set(prepared.expanded.groupOf).size} articles, ~${prepared.tokensEstimate} tokens d'entrée, fichiers identiques ${prepared.exactDuplicates.length}, paires très proches ${prepared.similarPairs.length} (dont ${hashFalse} entre articles différents)`);
  }
  if (lots.length === 0) {
    console.error("\nAucun lot utilisable.");
    process.exit(1);
  }

  if (args.dryRun) {
    console.log("\nEstimation (sortie ≈ 60 tokens par image) :");
    for (const model of args.models) {
      const cost = lots.reduce((a, l) => a + tokenCostUsd(model, l.tokensEstimate, l.images.length * 60), 0) * args.runs;
      console.log(`  ${model} : ${lots.length} lots × ${args.runs} passage(s) ≈ $${cost.toFixed(3)}`);
    }
    console.log("\nAucun appel effectué.");
    return;
  }

  const models = args.mock ? ["mock"] : args.models;
  const tasks: (() => Promise<CallRecord>)[] = [];
  const configs = models.flatMap((model) =>
    args.prompts.flatMap((prompt) => args.thinkings.flatMap((thinking) => args.verify.map((verify) => ({ model, prompt, verify, thinking }))))
  );
  for (const lot of lots) {
    for (const { model, prompt, verify, thinking } of configs) {
      for (let run = 1; run <= args.runs; run++) {
        tasks.push(async () => {
          const label = `${model} · ${prompt}${thinking === "on" ? " · avec réflexion" : ""}${verify ? " · vérif" : ""}`;
          const base = { lot: lot.name, model: label, run };
          let raw: GroupingOutput;
          let durationMs = 0;
          let inputTokens = 0;
          let outputTokens = 0;
          try {
            if (args.mock) {
              raw = mockPrediction(lot, lot.name.length * 31 + run);
            } else {
              const res = await groupMediaWithAi(
                lot.images,
                { exactDuplicates: lot.exactDuplicates, similarPairs: args.hashHints ? lot.similarPairs : [], shopContext: lot.truth.shopContext },
                { model, promptVersion: prompt, thinking }
              );
              raw = res.raw;
              durationMs = res.durationMs;
              inputTokens = res.inputTokens;
              outputTokens = res.outputTokens;
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`  ✗ ${lot.name} · ${model} · passage ${run} : ${message}`);
            return { ...base, ok: false, error: message, durationMs, inputTokens, outputTokens, costUsd: 0 };
          }
          const videoRefs = lot.images.map((i) => i.videoRef ?? null);
          let normalized: ReturnType<typeof normalizeGrouping> = normalizeGrouping(raw, lot.images.length, { nearDuplicates: [...lot.exactDuplicates, ...lot.similarPairs], videoRefs });
          let costUsd = args.mock ? 0 : tokenCostUsd(model, inputTokens, outputTokens);
          let verifyInfo: Record<string, unknown> | null = null;
          if (verify && !args.mock) {
            const pairs = suspiciousPairs(normalized, videoRefs);
            if (pairs.length) {
              try {
                const v = await verifyPairsWithAi(lot.images, normalized, pairs, { model });
                normalized = applyVerification(normalized, pairs, v.raw);
                durationMs += v.durationMs;
                inputTokens += v.inputTokens;
                outputTokens += v.outputTokens;
                costUsd += tokenCostUsd(model, v.inputTokens, v.outputTokens);
                verifyInfo = { pairs, raw: v.raw, durationMs: v.durationMs, images: v.images };
              } catch (err) {
                verifyInfo = { pairs, error: err instanceof Error ? err.message : String(err) };
              }
            } else verifyInfo = { pairs: [] };
          }
          const score = scoreLot(lot.expanded, normalized);
          const named = {
            groups: normalized.groups.map((g) => ({ ...g, files: g.items.map((i) => lot.expanded.files[i]), truth: g.items.map((i) => lot.expanded.groupOf[i]) })),
            unsorted: normalized.unsorted.map((u) => ({ ...u, file: lot.expanded.files[u.item], truth: lot.expanded.groupOf[u.item] })),
            duplicates: normalized.duplicates.map((d) => ({ ...d, files: [lot.expanded.files[d.a], lot.expanded.files[d.b]] })),
            variants: normalized.variants,
            issues: normalized.issues,
            signals: normalized.signals,
            photos: normalized.photos.map((p, i) => (p ? { file: lot.expanded.files[i], ...p } : null)),
            verify: verifyInfo,
          };
          const safeModel = label.replace(/[^a-z0-9.-]+/gi, "_");
          await mkdir(path.join(args.out, lot.name), { recursive: true });
          await writeFile(path.join(args.out, lot.name, `${safeModel}-run${run}.json`), JSON.stringify({ raw, result: named, score, durationMs, inputTokens, outputTokens, costUsd }, null, 2));
          console.log(
            `  ${lot.name} · ${label} · #${run} : ${score.predictedGroups}/${score.truthGroups} groupes, fusions ${score.wrongMergeItems}, séparations ${score.splitExtraFragments}, non rangées ${score.unsortedClear}+${score.unsortedAmbiguous} amb., corrections ${score.corrections}, ${(durationMs / 1000).toFixed(1)} s, $${costUsd.toFixed(4)}`
          );
          return { ...base, ok: true, score, durationMs, inputTokens, outputTokens, costUsd };
        });
      }
    }
  }
  const records = await pool(tasks, args.concurrency);
  const summaries = summarize(records);
  const syntheticOnly = lots.every((l) => l.truth.synthetic);

  // Rapport Markdown.
  const lines: string[] = [];
  lines.push(`# Banc de regroupement Bulk Upload — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, "");
  lines.push(`Mode : **${mode}** · lots : ${lots.length} · passages par lot : ${args.runs} · vignettes ${args.size} px${args.shuffle != null ? ` · ordre mélangé (graine ${args.shuffle})` : ""} · indices d'empreinte envoyés à l'IA : ${args.hashHints ? "fichiers identiques + paires très proches" : "fichiers identiques seulement"}`, "");
  if (args.mock) lines.push("> **SIMULATION** : résultats produits par un prédicteur simulé, pas par l'IA. Ils vérifient seulement le banc.", "");
  if (syntheticOnly) lines.push("> **Lots synthétiques uniquement** : ces chiffres ne valident pas la phase 1. Il faut des lots réels (voir docs/bulk-group-eval.md).", "");
  if (skipped.length) lines.push(`Lots ignorés : ${skipped.map((s) => `${s.lot} (${s.error.split("\n")[0]})`).join(" ; ")}`, "");
  lines.push("## Synthèse par modèle", "");
  lines.push("| Configuration | Appels (échecs) | Photos | Mal fusionnées | Non rangées évitables | Non rangées (toutes) | Précision | Rappel | Articles exacts | Corrections / 10 photos | dont fusions / sorties | Variantes trouvées | Doublons trouvés | Sorties brutes à corriger | Perdus | Coût / 30 photos | Durée p50 / p95 | Écart entre passages |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const s of summaries) {
    lines.push(
      `| ${s.model} | ${s.calls} (${s.failedCalls}) | ${s.photos} | ${pct(s.wrongMergeItemRate)} | ${pct(s.unsortedClearRate)} | ${pct(s.unsortedRate)} | ${s.pairPrecision.toFixed(3)} | ${s.pairRecall.toFixed(3)} | ${pct(s.exactGroupRate)} | ${s.correctionsPer10Photos.toFixed(2)} | ${s.mergeFixesPer10Photos.toFixed(2)} / ${s.splitFixesPer10Photos.toFixed(2)} | ${s.variantsRecall == null ? "—" : pct(s.variantsRecall)} | ${s.duplicatesRecall == null ? "—" : pct(s.duplicatesRecall)} | ${s.rawIssueCalls} | ${s.lost} | $${s.costPer30PhotosUsd.toFixed(4)} | ${(s.durationP50Ms / 1000).toFixed(1)} / ${(s.durationP95Ms / 1000).toFixed(1)} s | ${s.maxCorrectionSpread} |`
    );
  }
  lines.push("", "## Critères de passage en phase 1 (à juger sur lots réels)", "");
  for (const s of summaries) {
    const v = verdict(s);
    lines.push(`**${s.model}** : ${v.pass ? "✅ tous les critères sont atteints" : "❌ critères non atteints"}${syntheticOnly ? " (lots synthétiques : indicatif)" : ""}`, "");
    lines.push("| Critère | Valeur | Cible |", "|---|---|---|");
    for (const c of v.checks) lines.push(`| ${c.ok ? "✅" : "❌"} ${c.label} | ${c.value} | ${c.target} |`);
    lines.push("");
  }
  lines.push("## Détail par lot", "");
  lines.push("| Lot | Configuration | # | Groupes (prévus/vrais) | Fusions (photos) | Séparations | Non rangées (évitables + ambiguës) | Ambiguës mal placées | Exacts | Variantes | Doublons (dont calcul) | Sortie brute à corriger | Durée | Coût |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of records) {
    if (!r.ok || !r.score) {
      lines.push(`| ${r.lot} | ${r.model} | ${r.run} | échec : ${(r.error ?? "").slice(0, 80)} | | | | | | | | | | |`);
      continue;
    }
    const s = r.score;
    lines.push(
      `| ${r.lot} | ${r.model} | ${r.run} | ${s.predictedGroups}/${s.truthGroups} | ${s.wrongMergeItems} (${s.wrongMergeGroups} gr.) | ${s.splitExtraFragments} | ${s.unsortedClear} + ${s.unsortedAmbiguous} | ${s.ambiguousMisplaced} | ${s.exactGroups}/${s.truthGroups} | ${s.variantsFound}/${s.variantsExpected}${s.variantsFalse ? ` (+${s.variantsFalse} fausses)` : ""} | ${s.duplicatesFound}/${s.duplicatesExpected} (${s.duplicatesFoundByHash})${s.duplicatesFalse ? ` +${s.duplicatesFalse} faux` : ""} | ${s.rawIssues} | ${(r.durationMs / 1000).toFixed(1)} s | $${r.costUsd.toFixed(4)} |`
    );
  }
  lines.push("", `Seuils : lib/ai/bulk-group-eval.ts (PHASE1_THRESHOLDS). Sorties détaillées : ${args.out}/<lot>/<modèle>-run<N>.json`, "");
  await writeFile(path.join(args.out, "report.md"), lines.join("\n"));
  await writeFile(
    path.join(args.out, "report.json"),
    JSON.stringify({ mode, args: { ...args }, thresholds: PHASE1_THRESHOLDS, lots: lots.map((l) => ({ lot: l.name, synthetic: l.truth.synthetic, images: l.images.length, cases: l.truth.cases })), skipped, records, summaries }, null, 2)
  );

  console.log("\n" + lines.slice(lines.indexOf("## Synthèse par modèle"), lines.indexOf("## Détail par lot")).join("\n"));
  console.log(`\nRapport : ${path.join(args.out, "report.md")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
