// Client Supabase avec la clé service_role — contourne la RLS.
// À utiliser UNIQUEMENT côté serveur, et seulement après une vérification de sécurité
// applicative équivalente (ex: signature HMAC du webhook PayTech). Ne jamais exposer
// cette clé ou ce client au navigateur.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
