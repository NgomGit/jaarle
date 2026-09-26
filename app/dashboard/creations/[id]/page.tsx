import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCreation, getCreationVersions } from "@/lib/supabase/creations";
import { getTierConfig } from "@/lib/pricing";
import { CreationDetail } from "@/components/dashboard/creation-detail";
import { getMyShop } from "@/lib/shops/queries";
import { shopMediaUrl } from "@/lib/shops/media";
import { getLatestCreationPack } from "@/lib/studio/queries";
import { getEntitlements } from "@/lib/billing/entitlements";
import { canSpend } from "@/lib/billing/format";
import { usageUnits } from "@/lib/billing/usage";

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

  const [versions, shop, pack] = await Promise.all([
    getCreationVersions(supabase, creation.id),
    getMyShop(supabase, user.id),
    getLatestCreationPack(supabase, creation.id),
  ]);

  // Identité affichée dans les aperçus de publication : la boutique si elle existe, sinon le nom
  // d'entreprise saisi sur l'affiche.
  const businessName = (creation as { business_name?: string | null }).business_name?.trim();
  const mockName = shop?.name ?? (businessName || creation.product_name);
  const mockShop = {
    name: mockName,
    handle: shop?.slug ?? mockName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, ""),
    logoUrl: shop ? shopMediaUrl(shop.logo_path) : null,
    city: shop?.city ?? null,
  };

  // Déblocage sans paiement à l'unité : quota de l'abonnement (Pro / Business) ou crédits.
  const entitlements = await getEntitlements();
  const units = usageUnits("poster_unlock", creation.tier);
  const unlockOptions = entitlements.billingEnabled
    ? {
        withPlan: entitlements.posterUnlockIncluded && canSpend(entitlements, units, ["quota"]),
        withCredits: entitlements.credits >= units,
        units,
        showProHint: !entitlements.posterUnlockIncluded,
      }
    : undefined;

  return (
    <CreationDetail
      creation={creation}
      versions={versions}
      tierPrice={getTierConfig(creation.tier).price}
      studioPack={pack}
      studioShop={mockShop}
      unlockOptions={unlockOptions}
    />
  );
}
