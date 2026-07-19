import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyPreviewWatermark } from "@/lib/image-compose";

/**
 * Sert l'image d'une création sans jamais exposer le chemin/URL de stockage Supabase au
 * client. Tant que la création n'est pas débloquée, l'image est filigranée et réduite en
 * résolution — la version propre pleine résolution n'est servie qu'après paiement.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Non authentifié.", { status: 401 });
  }

  const { data: creation, error } = await supabase
    .from("creations")
    .select("poster_path, photo_path, unlocked")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !creation) {
    return new NextResponse("Introuvable.", { status: 404 });
  }

  const displayPath = creation.poster_path || creation.photo_path;
  if (!displayPath) {
    return new NextResponse("Image introuvable.", { status: 404 });
  }

  const { data: blob, error: downloadError } = await supabase.storage.from("creations").download(displayPath);
  if (downloadError || !blob) {
    return new NextResponse("Image introuvable.", { status: 404 });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());

  if (creation.unlocked) {
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
    });
  }

  try {
    const watermarked = await applyPreviewWatermark(buffer);
    return new NextResponse(new Uint8Array(watermarked), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" },
    });
  } catch {
    // Ne jamais servir l'image non protégée si le filigrane échoue — mieux vaut une erreur
    // qu'une fuite de la version pleine qualité avant paiement.
    return new NextResponse("Erreur lors de la préparation de l'aperçu.", { status: 500 });
  }
}
