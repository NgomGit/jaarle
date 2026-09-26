import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STUDIO_MAX_REGENERATIONS_PER_POST } from "@/lib/studio/access";
import { generateVariants } from "@/lib/studio/generate";
import { getPost } from "@/lib/studio/queries";
import { factsForPack } from "@/lib/studio/sources";
import { logAiCall } from "@/lib/billing/ai-cost";

// POST /api/studio/posts/[id]/regenerate — 3 nouvelles variantes pour UNE plateforme
// (même fiche de faits et même objectif que le pack d'origine : affiche ou produit).

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const post = await getPost(supabase, params.id);
  if (!post) return NextResponse.json({ error: "Contenu introuvable." }, { status: 404 });
  if (post.regenerated_count >= STUDIO_MAX_REGENERATIONS_PER_POST) {
    return NextResponse.json({ error: "Limite de régénérations atteinte pour ce réseau. Lance un nouveau contenu." }, { status: 429 });
  }

  const loaded = await factsForPack(supabase, user.id, post.marketing_packs);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });

  try {
    const generated = await generateVariants(loaded.facts, [post.platform]);
    const variants = generated.variants[post.platform];
    void logAiCall({
      userId: user.id,
      feature: "studio_regenerate",
      model: generated.usage.model,
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      shopId: post.marketing_packs.shop_id,
      creationId: post.marketing_packs.creation_id,
    });
    const { data, error } = await supabase
      .from("marketing_posts")
      .update({ variants, selected_variant: 0, regenerated_count: post.regenerated_count + 1 })
      .eq("id", post.id)
      .select("*")
      .single();
    if (error || !data) throw error;
    return NextResponse.json({ post: data });
  } catch (err) {
    console.error("[studio/regenerate] failed:", err);
    return NextResponse.json({ error: "La régénération a échoué. Réessaie." }, { status: 502 });
  }
}
