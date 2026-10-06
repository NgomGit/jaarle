import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEntitlements } from "@/lib/billing/entitlements";

// GET /api/admin/creations/{id}/thumb — miniature d'une affiche pour l'admin (/dashboard/admin/affiches).
// Réservé aux admins ; jamais mis en cache public.

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) return new Response("Non authentifié.", { status: 401 });
  if (!(await getEntitlements()).isAdmin) return new Response("Introuvable.", { status: 404 });
  if (!UUID.test(params.id)) return new Response("Introuvable.", { status: 404 });

  const admin = createAdminClient();
  const { data: creation } = await admin.from("creations").select("poster_path, poster_path_2, photo_path").eq("id", params.id).maybeSingle();
  const variant2 = new URL(request.url).searchParams.get("variant") === "2";
  const path = (variant2 ? creation?.poster_path_2 : creation?.poster_path ?? creation?.photo_path) as string | null | undefined;
  if (!path) return new Response("Image introuvable.", { status: 404 });

  const { data: blob } = await admin.storage.from("creations").download(path);
  if (!blob) return new Response("Image introuvable.", { status: 404 });
  try {
    const thumb = await sharp(Buffer.from(await blob.arrayBuffer()))
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
    return new Response(new Uint8Array(thumb), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("Image illisible.", { status: 500 });
  }
}
