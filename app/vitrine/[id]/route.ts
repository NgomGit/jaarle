import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyJaarleSignature } from "@/lib/studio/signature";

// GET /vitrine/{id} — affiche choisie par l'admin pour la vitrine publique (migration 0037).
// Seules les affiches présentes dans showcase_creations sont servies. Une affiche non débloquée
// est servie réduite et signée du logo Jaarle, jamais en version nette (décision du 2026-10-02).

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return new Response("Affiche introuvable", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id.replace(/\.(jpe?g|png|webp)$/i, "");
  if (!UUID.test(id) || !process.env.SUPABASE_SERVICE_ROLE_KEY) return notFound();
  const admin = createAdminClient();

  const { data: pick } = await admin.from("showcase_creations").select("creation_id").eq("creation_id", id).maybeSingle();
  if (!pick) return notFound();
  const { data: creation } = await admin.from("creations").select("poster_path, unlocked").eq("id", id).maybeSingle();
  if (!creation?.poster_path) return notFound();

  const { data: blob } = await admin.storage.from("creations").download(creation.poster_path as string);
  if (!blob) return notFound();
  const source = Buffer.from(await blob.arrayBuffer());
  let jpeg: Buffer;
  try {
    jpeg = creation.unlocked
      ? await sharp(source).resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
      : await applyJaarleSignature(source);
  } catch {
    return notFound();
  }
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      // Cache court : une affiche retirée de la vitrine doit disparaître vite.
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
