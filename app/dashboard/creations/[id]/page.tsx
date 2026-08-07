import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreation, getCreationVersions } from "@/lib/supabase/creations";
import { getTierConfig } from "@/lib/pricing";
import { CreationDetail } from "@/components/dashboard/creation-detail";

export default async function CreationDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const creation = await getCreation(supabase, params.id, user.id);
  if (!creation) {
    notFound();
  }

  const versions = await getCreationVersions(supabase, creation.id);

  return <CreationDetail creation={creation} versions={versions} tierPrice={getTierConfig(creation.tier).price} />;
}
