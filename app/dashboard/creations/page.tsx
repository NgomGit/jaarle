import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listCreations } from "@/lib/supabase/creations";
import { CreationsGallery } from "@/components/dashboard/creations-gallery";

export default async function CreationsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const creations = await listCreations(supabase);

  return <CreationsGallery creations={creations} />;
}
