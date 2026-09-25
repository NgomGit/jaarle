import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Pages publiques Jaarle 2.0 exclues (/boutique, /r/, /q/) : elles n'ont pas besoin de session,
  // ce qui évite un appel Supabase Auth par visite et permet leur mise en cache.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|boutique(?:/|$)|r/|q/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
