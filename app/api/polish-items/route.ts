import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildCulturalContext } from "@/lib/knowledge/context";

export const maxDuration = 30;

const ItemsSchema = z.object({
  items: z.array(z.string()).max(10),
});

/**
 * Corrige (orthographe/grammaire) et améliore (reformulation courte et vendeuse) les
 * arguments/prestations que le commerçant veut afficher. Ne change pas le sens, n'invente
 * rien, garde le même nombre d'éléments (fusionne seulement d'éventuels doublons). Repli
 * silencieux sur les items d'origine en cas d'échec.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { items, language, industry, subjectType } = (await request.json()) as {
    items: string[] | null;
    language: string | null;
    industry: string | null;
    subjectType: "product" | "service" | null;
  };

  const clean = (items ?? []).map((i) => (i ?? "").trim()).filter(Boolean).slice(0, 10);
  if (clean.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const languageLabel =
    language === "wo"
      ? "wolof (mélangé naturellement avec du français comme parlent les commerçants à Dakar)"
      : "français";
  const kind = subjectType === "service" ? "prestations / atouts d'un service" : "arguments de vente d'un produit";
  const culturalContext = buildCulturalContext({ industryKey: industry ?? undefined });

  try {
    const anthropic = new Anthropic();
    const message = await anthropic.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 512,
      thinking: { type: "disabled" },
      system: culturalContext,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Voici des ${kind} qu'un commerçant veut afficher sur son affiche marketing : ${JSON.stringify(
                clean
              )}.

Corrige l'orthographe et la grammaire, puis reformule chaque élément en un argument court, clair et vendeur (style « tag » d'affiche, max ~5 mots, en ${languageLabel}). Règles strictes : garde exactement le MÊME sens et le MÊME nombre d'éléments (n'en invente aucun, ne fusionne que d'éventuels doublons exacts), mets une majuscule en début, pas de point final, pas d'emoji. Renvoie la liste corrigée dans le même ordre.`,
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ItemsSchema) },
    });

    const out = message.parsed_output?.items?.map((s) => s.trim()).filter(Boolean);
    return NextResponse.json({ items: out && out.length > 0 ? out.slice(0, 10) : clean });
  } catch {
    return NextResponse.json({ items: clean });
  }
}
