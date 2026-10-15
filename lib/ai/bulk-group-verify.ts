import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  DEFAULT_BULK_GROUP_MODEL,
  PARTIAL_VIEWS,
  REVIEW,
  keywords,
  type GroupingImage,
  type NormalizedGroup,
  type NormalizedGrouping,
} from "@/lib/ai/bulk-group";

// Bulk Upload — 2e passage CIBLÉ (facultatif) : après le regroupement, on ne revérifie que les
// paires de groupes suspectes (même vidéo, même nom, vues partielles, même type d'article, photo
// presque identique), avec 1 ou 2 photos représentatives par groupe. Jamais toutes les photos.
//
// Réglage : BULK_GROUP_VERIFY = "off" (défaut) | "on". À n'activer que si le banc montre un gain
// (scripts/bulk-group-eval.ts --verify).
//
// Règle de décision : on ne fusionne d'office QUE si le vérificateur répond "same" avec une
// certitude "high" ; la fusion reste annulable par le vendeur (« défusionner ») et le groupe est
// marqué « à vérifier ». "different" retire les alertes de séparation de la paire ; "unsure" ne
// change rien.

export function verifyMode(v = process.env.BULK_GROUP_VERIFY): "off" | "on" {
  return v?.trim().toLowerCase() === "on" ? "on" : "off";
}

export const VERIFY_MAX_PAIRS = 6;
export const VERIFY_IMAGES_PER_GROUP = 2;

export const REVIEW_VERIFIED_MERGE = "regroupé après une 2e vérification : contrôle les photos";

export interface SuspectPair {
  a: string;
  b: string;
  why: string[];
}

const typeWords = (g: NormalizedGroup, r: NormalizedGrouping) =>
  new Set(g.items.flatMap((i) => keywords(r.photos[i]?.type ?? "").slice(0, 1)));
const onlyPartial = (g: NormalizedGroup, r: NormalizedGrouping) =>
  g.items.every((i) => {
    const n = r.photos[i];
    return !!n && PARTIAL_VIEWS.has(n.view);
  });

/**
 * Paires de groupes à revérifier, les plus suspectes d'abord, VERIFY_MAX_PAIRS au plus. Les paires
 * signalées comme variantes (autre couleur) sont exclues : elles ne doivent pas être fusionnées.
 */
export function suspiciousPairs(r: NormalizedGrouping, videoRefs: (string | null | undefined)[] = [], max = VERIFY_MAX_PAIRS): SuspectPair[] {
  const groups = r.groups;
  const groupOf = new Map<number, NormalizedGroup>();
  for (const g of groups) for (const i of g.items) groupOf.set(i, g);
  const isVariant = (a: string, b: string) => r.variants.some((v) => v.groups.includes(a) && v.groups.includes(b));
  const pairs = new Map<string, SuspectPair & { score: number }>();
  const add = (ga: NormalizedGroup | undefined, gb: NormalizedGroup | undefined, why: string, score: number) => {
    if (!ga || !gb || ga === gb || isVariant(ga.key, gb.key)) return;
    const [a, b] = ga.key < gb.key ? [ga.key, gb.key] : [gb.key, ga.key];
    const k = `${a}|${b}`;
    const cur = pairs.get(k) ?? { a, b, why: [], score: 0 };
    if (!cur.why.includes(why)) {
      cur.why.push(why);
      cur.score += score;
    }
    pairs.set(k, cur);
  };
  for (const d of r.duplicates) add(groupOf.get(d.a), groupOf.get(d.b), "photo presque identique", 3);
  const byVideo = new Map<string, NormalizedGroup[]>();
  videoRefs.forEach((ref, i) => {
    const g = groupOf.get(i);
    if (!ref || !g) return;
    const list = byVideo.get(ref) ?? [];
    if (!list.includes(g)) list.push(g);
    byVideo.set(ref, list);
  });
  for (const list of byVideo.values()) for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) add(list[x], list[y], "même vidéo", 3);
  for (let x = 0; x < groups.length; x++) {
    for (let y = x + 1; y < groups.length; y++) {
      const ga = groups[x];
      const gb = groups[y];
      const la = keywords(ga.label).join(" ");
      if (la && la === keywords(gb.label).join(" ")) add(ga, gb, "même nom", 2);
      const ta = typeWords(ga, r);
      const sharedType = [...typeWords(gb, r)].some((t) => ta.has(t));
      if (sharedType && (onlyPartial(ga, r) || onlyPartial(gb, r))) add(ga, gb, "vues partielles du même type", 2);
    }
  }
  return [...pairs.values()]
    .sort((p, q) => q.score - p.score || p.a.localeCompare(q.a) || p.b.localeCompare(q.b))
    .slice(0, max)
    .map(({ a, b, why }) => ({ a, b, why }));
}

/** Photos représentatives d'un groupe : la principale, puis une vue différente (vraies photos d'abord). */
export function representativeItems(g: NormalizedGroup, r: NormalizedGrouping, images: Pick<GroupingImage, "videoRef">[], n = VERIFY_IMAGES_PER_GROUP): number[] {
  const out = [g.main];
  const mainView = r.photos[g.main]?.view;
  const rest = g.items.filter((i) => i !== g.main).sort((x, y) => Number(!!images[x]?.videoRef) - Number(!!images[y]?.videoRef) || x - y);
  const other = rest.find((i) => r.photos[i]?.view && r.photos[i]?.view !== mainView) ?? rest[0];
  if (other != null && out.length < n) out.push(other);
  return out;
}

export const VerifyOutputSchema = z.object({
  pairs: z.array(
    z.object({
      a: z.string(),
      b: z.string(),
      verdict: z.enum(["same", "different", "unsure"]),
      certainty: z.enum(["high", "medium", "low"]),
      reason: z.string(),
    })
  ),
});
export type VerifyOutput = z.infer<typeof VerifyOutputSchema>;

export function buildVerifyPrompt(pairs: SuspectPair[], labels: Record<string, string>): string {
  return `Tu vérifies le classement de photos d'articles à vendre. Chaque groupe (G1, G2…) devrait contenir UN SEUL objet physique. Pour chaque paire ci-dessous, dis si les deux groupes montrent le MÊME objet physique.

Paires à vérifier :
${pairs.map((p) => `- ${p.a} (« ${labels[p.a] ?? ""} ») et ${p.b} (« ${labels[p.b] ?? ""} »)`).join("\n")}

Règles :
- "same" : c'est le même objet vu autrement (autre angle, de dos, gros plan, porté, plié) ; les motifs, couleurs et détails visibles correspondent.
- "different" : deux objets distincts, même s'ils se ressemblent (autre couleur, autre motif, autre coupe, autre détail). Une autre couleur du même modèle = "different".
- "unsure" : impossible de trancher avec ces photos.
- "certainty" : "high" seulement si les détails le prouvent. "reason" : une phrase qui cite les détails.

Réponds uniquement avec l'objet structuré demandé, une entrée par paire.`;
}

export interface VerifyCallResult {
  raw: VerifyOutput;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  images: number;
}

export async function verifyPairsWithAi(
  images: GroupingImage[],
  r: NormalizedGrouping,
  pairs: SuspectPair[],
  { model = process.env.BULK_GROUP_VERIFY_MODEL || process.env.BULK_GROUP_MODEL || DEFAULT_BULK_GROUP_MODEL, client }: { model?: string; client?: Anthropic } = {}
): Promise<VerifyCallResult> {
  const anthropic = client ?? new Anthropic();
  const keys = [...new Set(pairs.flatMap((p) => [p.a, p.b]))];
  const content: (
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg"; data: string } }
    | { type: "text"; text: string }
  )[] = [];
  let count = 0;
  const labels: Record<string, string> = {};
  for (const key of keys) {
    const g = r.groups.find((x) => x.key === key);
    if (!g) continue;
    labels[key] = g.label;
    representativeItems(g, r, images).forEach((i, k) => {
      content.push({ type: "text", text: `${key} — photo ${k + 1}` });
      content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: images[i].base64 } });
      count++;
    });
  }
  content.push({ type: "text", text: buildVerifyPrompt(pairs, labels) });
  const started = Date.now();
  const message = await anthropic.messages.parse({
    model,
    max_tokens: 400 + pairs.length * 120,
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(VerifyOutputSchema) },
  });
  if (!message.parsed_output) throw new Error("Réponse IA invalide (vérification).");
  return {
    raw: message.parsed_output,
    model,
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
    durationMs: Date.now() - started,
    images: count,
  };
}

/** Groupe absorbé par une fusion de vérification (pour pouvoir la défaire). */
export interface MergedFrom {
  key: string;
  items: number[];
  main: number;
  label: string;
}

export interface VerifiedGrouping extends NormalizedGrouping {
  /** Groupes absorbés, par clé du groupe qui les a reçus. */
  mergedFrom: Record<string, MergedFrom[]>;
  verification: { pairs: number; merged: number; cleared: number; unsure: number };
}

const SPLIT_REASONS: string[] = [REVIEW.sameLabel, REVIEW.partialOnly, REVIEW.sameVideo];

/**
 * Applique les réponses du vérificateur (pure). Fusion seulement sur "same" + "high", vers le groupe
 * qui montre l'article en entier (sinon le plus grand, sinon le premier). Une fusion ne touche
 * jamais une paire marquée comme variante ni un groupe déjà absorbé.
 */
export function applyVerification(r: NormalizedGrouping, pairs: SuspectPair[], out: VerifyOutput): VerifiedGrouping {
  const groups = r.groups.map((g) => ({ ...g, items: [...g.items], reviewReasons: [...g.reviewReasons] }));
  const byKey = new Map(groups.map((g) => [g.key, g]));
  const asked = new Set(pairs.map((p) => (p.a < p.b ? `${p.a}|${p.b}` : `${p.b}|${p.a}`)));
  const isVariant = (a: string, b: string) => r.variants.some((v) => v.groups.includes(a) && v.groups.includes(b));
  const mergedFrom: Record<string, MergedFrom[]> = {};
  const absorbed = new Map<string, string>();
  const root = (k: string) => {
    let cur = k;
    while (absorbed.has(cur)) cur = absorbed.get(cur)!;
    return cur;
  };
  let merged = 0;
  let cleared = 0;
  let unsure = 0;
  const whole = (g: NormalizedGroup) => g.items.some((i) => {
    const v = r.photos[i]?.view;
    return !!v && !PARTIAL_VIEWS.has(v);
  });
  for (const p of out.pairs ?? []) {
    const key = p.a < p.b ? `${p.a}|${p.b}` : `${p.b}|${p.a}`;
    if (!asked.has(key)) continue;
    const ga = byKey.get(root(p.a));
    const gb = byKey.get(root(p.b));
    if (!ga || !gb || ga === gb) continue;
    if (p.verdict === "same" && p.certainty === "high" && !isVariant(p.a, p.b)) {
      const [into, from] = whole(ga) !== whole(gb) ? (whole(ga) ? [ga, gb] : [gb, ga]) : gb.items.length > ga.items.length ? [gb, ga] : [ga, gb];
      (mergedFrom[into.key] ??= []).push({ key: from.key, items: [...from.items], main: from.main, label: from.label }, ...(mergedFrom[from.key] ?? []));
      delete mergedFrom[from.key];
      into.items.push(...from.items);
      into.reviewReasons = [...into.reviewReasons.filter((x) => !SPLIT_REASONS.includes(x)), REVIEW_VERIFIED_MERGE].slice(0, 10);
      into.needsReview = true;
      absorbed.set(from.key, into.key);
      byKey.delete(from.key);
      merged++;
    } else if (p.verdict === "different" && p.certainty !== "low") {
      for (const g of [ga, gb]) {
        const before = g.reviewReasons.length;
        g.reviewReasons = g.reviewReasons.filter((x) => x !== REVIEW.sameLabel && x !== REVIEW.partialOnly);
        if (g.reviewReasons.length < before) cleared++;
        g.needsReview = g.reviewReasons.length > 0 || g.confidence !== "high";
      }
    } else {
      unsure++;
    }
  }
  const kept = groups.filter((g) => !absorbed.has(g.key));
  const keys = new Set(kept.map((g) => g.key));
  return {
    ...r,
    groups: kept,
    unsorted: r.unsorted.map((u) => ({ ...u, candidates: [...new Set(u.candidates.map(root))].filter((c) => keys.has(c)) })),
    variants: r.variants
      .map((v) => ({ ...v, groups: [...new Set(v.groups.map(root))].filter((k) => keys.has(k)) }))
      .filter((v) => v.groups.length >= 2),
    mergedFrom,
    verification: { pairs: pairs.length, merged, cleared, unsure },
  };
}
