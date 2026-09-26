import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCreations } from "@/lib/supabase/creations";
import { CreationsGallery } from "@/components/dashboard/creations-gallery";
import { getEntitlements } from "@/lib/billing/entitlements";

// Studio = point d'entrée principal : toutes les affiches du commerçant (ex-« Mes créations »),
// un bouton « Créer une affiche », et sur chaque affiche « Publier sur mes réseaux ».
// Le Studio « produit » reste disponible depuis les fiches produits (/dashboard/studio/[productId]).
export default async function StudioPage({ searchParams }: { searchParams: { canceled?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const creations = await listCreations(supabase);
  const { billingEnabled } = await getEntitlements();
  return <CreationsGallery creations={creations} canceled={!!searchParams.canceled} billingEnabled={billingEnabled} />;
}
