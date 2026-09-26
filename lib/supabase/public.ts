// Client Supabase ANONYME pour les pages publiques (/boutique/…) : aucun cookie, donc la page
// reste cachable (ISR) et la RLS publique s'applique (boutiques publiées uniquement).
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createPublicClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
