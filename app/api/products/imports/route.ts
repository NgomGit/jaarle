import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bulkAccess, loadImport, publicImport } from "@/lib/products/bulk-server";
import { FRAMES_PER_VIDEO, type ImportItem } from "@/lib/products/bulk-import";

// POST /api/products/imports — ouvre une session d'import avec les photos déjà envoyées
// (/api/shop-media/upload, kind = product). Aucun appel IA ici, rien n'est consommé.

export const runtime = "nodejs";

const BodySchema = z.object({
  items: z
    .array(
      z.object({
        path: z.string().min(1).max(300),
        width: z.number().int().positive().nullable().optional(),
        height: z.number().int().positive().nullable().optional(),
        videoRef: z.string().trim().max(120).nullable().optional(),
        name: z.string().max(200).nullable().optional(),
        takenAt: z.number().int().positive().max(8_640_000_000_000).nullable().optional(),
      })
    )
    .min(1)
    .max(200),
});

export async function POST(request: Request) {
  const access = await bulkAccess();
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { supabase, userId, shop, limits } = access;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Aucune photo à importer." }, { status: 400 });
  const raw = parsed.data.items;

  if (raw.some((i) => !i.path.startsWith(`${userId}/products/`))) {
    return NextResponse.json({ error: "Photo invalide." }, { status: 400 });
  }
  const photos = raw.filter((i) => !i.videoRef).length;
  const videos = new Map<string, number>();
  for (const i of raw) if (i.videoRef) videos.set(i.videoRef, (videos.get(i.videoRef) ?? 0) + 1);
  if (photos > limits.photosPerLot) {
    return NextResponse.json({ error: `${limits.photosPerLot} photos maximum par lot.` }, { status: 400 });
  }
  if (videos.size > limits.videosPerLot) {
    return NextResponse.json({ error: `${limits.videosPerLot} vidéos maximum par lot.` }, { status: 400 });
  }
  if ([...videos.values()].some((n) => n > FRAMES_PER_VIDEO)) {
    return NextResponse.json({ error: "Trop d'images pour une vidéo." }, { status: 400 });
  }

  const seen = new Set<string>();
  const items: ImportItem[] = [];
  for (const i of raw) {
    if (seen.has(i.path)) continue;
    seen.add(i.path);
    items.push({ id: randomUUID(), path: i.path, width: i.width ?? null, height: i.height ?? null, videoRef: i.videoRef || null, name: i.name ?? null, takenAt: i.takenAt ?? null });
  }

  // Sessions expirées de ce vendeur : nettoyées au passage (pas de cron).
  await supabase.from("product_imports").delete().eq("owner_id", userId).lt("expires_at", new Date().toISOString()).then(undefined, () => undefined);

  const { data, error } = await supabase
    .from("product_imports")
    .insert({
      owner_id: userId,
      shop_id: shop.id,
      status: "analyzing",
      items,
      groups: [],
      unsorted: items.map((i) => i.id),
      removed: [],
      variants: [],
      stats: { photos, videos: videos.size },
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[imports] create failed:", error);
    return NextResponse.json({ error: "Impossible de démarrer l'import. Réessaie." }, { status: 500 });
  }
  const row = await loadImport(supabase, data.id as string);
  return NextResponse.json({ import: row ? publicImport(row) : null, id: data.id });
}
