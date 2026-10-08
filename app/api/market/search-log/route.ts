import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchKey } from "@/lib/market/search";

// Journal des recherches du Market (migration 0042). Aucune donnée personnelle : ni compte, ni IP.
// Facultatif : toute erreur est ignorée (table absente, données invalides).

const SLUG = /^[a-z0-9-]{1,60}$/;

export async function POST(request: NextRequest) {
  // Appels venus d'un autre site ignorés (le journal n'accepte que les pages du Market).
  if (request.headers.get("sec-fetch-site") === "cross-site") return new NextResponse(null, { status: 204 });
  try {
    const body = (await request.json()) as { q?: unknown; results?: unknown; city?: unknown; category?: unknown };
    const q = typeof body.q === "string" ? body.q.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    const results = typeof body.results === "number" && Number.isFinite(body.results) ? Math.max(0, Math.min(Math.floor(body.results), 100000)) : -1;
    const qNorm = searchKey(q);
    if (q.length < 2 || results < 0 || !qNorm) return new NextResponse(null, { status: 204 });
    await createAdminClient()
      .from("market_search_logs")
      .insert({
        q,
        q_norm: qNorm,
        results,
        city: typeof body.city === "string" && SLUG.test(body.city) ? body.city : null,
        category: typeof body.category === "string" && SLUG.test(body.category) ? body.category : null,
      });
  } catch {
    // journal facultatif
  }
  return new NextResponse(null, { status: 204 });
}
