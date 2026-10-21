import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { senegalE164, vcard } from "@/lib/whatsapp/contact";

// GET /api/admin/contacts[?periode=30] — carnet .vcf des vendeurs (boutiques non suspendues), à importer
// sur le téléphone du numéro Jaarle pour que les vendeurs voient ses statuts WhatsApp.
// Admin uniquement. Un contact par numéro (le nom de la boutique la plus récente l'emporte).

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireAdmin();
  const days = Number(new URL(request.url).searchParams.get("periode"));
  let query = createAdminClient()
    .from("shops")
    .select("name, slug, whatsapp, city, created_at")
    .neq("status", "suspended")
    .order("created_at", { ascending: true })
    .limit(20000);
  if (Number.isFinite(days) && days > 0 && days <= 3650) {
    query = query.gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString());
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byPhone = new Map<string, string>();
  for (const s of (data ?? []) as { name: string; slug: string; whatsapp: string; city: string | null }[]) {
    const phone = senegalE164(s.whatsapp);
    if (!phone) continue;
    byPhone.set(
      phone,
      vcard({
        // « (Jaarle) » : les vendeurs se retrouvent tous ensemble dans le carnet.
        name: `${s.name.trim()} (Jaarle)`,
        phone,
        org: s.name.trim(),
        note: [s.city, `jaarle.com/boutique/${s.slug}`].filter(Boolean).join(" · "),
      })
    );
  }

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse([...byPhone.values()].join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="vendeurs-jaarle-${day}.vcf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
