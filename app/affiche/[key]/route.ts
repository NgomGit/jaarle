import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /affiche/{clé} — affiche d'un service, servie au public (Jaarle Market, vitrines, aperçus).
// Les affiches sont dans le bucket privé « creations » : on ne sert que celles qui sont débloquées,
// liées à une fiche en vente d'une boutique publiée. Réponse JPEG 1000 px, mise en cache longue
// (la clé change à chaque nouvelle version d'affiche).

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return new Response("Affiche introuvable", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
}

export async function GET(_req: Request, { params }: { params: { key: string } }) {
  const key = params.key.replace(/\.(jpe?g|png|webp)$/i, "");
  if (!UUID.test(key) || !process.env.SUPABASE_SERVICE_ROLE_KEY) return notFound();
  const admin = createAdminClient();

  // La clé est une version d'affiche, ou une affiche sans versions enregistrées.
  let path: string | null = null;
  let creationId: string | null = null;
  const { data: version } = await admin.from("creation_versions").select("creation_id, poster_path").eq("id", key).maybeSingle();
  if (version) {
    path = version.poster_path as string;
    creationId = version.creation_id as string;
  } else {
    creationId = key;
  }
  const { data: creation } = await admin
    .from("creations")
    .select("id, poster_path, unlocked, product_id")
    .eq("id", creationId)
    .maybeSingle();
  if (!creation || !creation.unlocked || !creation.product_id) return notFound();
  path ??= creation.poster_path as string | null;
  if (!path) return notFound();

  const { data: product } = await admin
    .from("products")
    .select("status, shops!inner(status)")
    .eq("id", creation.product_id)
    .maybeSingle();
  const shopStatus = (product?.shops as unknown as { status: string } | null)?.status;
  if (!product || !["active", "sold_out"].includes(product.status as string) || shopStatus !== "published") return notFound();

  const { data: blob } = await admin.storage.from("creations").download(path);
  if (!blob) return notFound();
  const jpeg = await sharp(Buffer.from(await blob.arrayBuffer()))
    .resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
    },
  });
}
