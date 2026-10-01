import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewCreationWizard, type ProductDefaults, type ShopDefaults } from "@/components/dashboard/new-creation-wizard";
import { getProductById } from "@/lib/shops/products";
import { getMyShop } from "@/lib/shops/queries";
import { shopMediaUrl } from "@/lib/shops/media";
import { canUseMultiPhoto, getEntitlements } from "@/lib/billing/entitlements";
import { canSpend, formatDateFr } from "@/lib/billing/format";
import { LimitPage } from "@/components/billing/limit-page";
import { usageUnits } from "@/lib/billing/usage";

export default async function NewCreationPage({ searchParams }: { searchParams: { productId?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Jaarle 2.0 — plus aucune génération disponible ce mois-ci (ni crédit) : on l'explique AVANT
  // que le commerçant remplisse le formulaire, avec l'offre Pro (le générateur n'est pas modifié).
  const entitlements = await getEntitlements();
  if (!canSpend(entitlements, 1)) {
    return (
      <LimitPage
        reason="generations"
        resetDate={entitlements.subscription ? null : formatDateFr(entitlements.periodEnd)}
        backHref="/dashboard/studio"
        backLabelKey="studio.title"
      />
    );
  }

  // Jaarle 2.0 : si le commerçant a une boutique, ses infos pré-remplissent l'affiche
  // (nom, logo, WhatsApp, activité, langue). Sans boutique : comportement d'origine.
  const shop = await getMyShop(supabase, user.id);

  const accountPhone = (user.user_metadata?.whatsapp_number as string | undefined) || user.phone || "";
  const defaultPhone = shop?.whatsapp || accountPhone;

  const shopDefaults: ShopDefaults | null = shop
    ? {
        businessName: shop.name,
        logoUrl: shopMediaUrl(shop.logo_path),
        industry: shop.industry,
        language: shop.brand?.language === "wo" ? "wo" : "fr",
      }
    : null;

  // « Créer une affiche » depuis un produit : le générateur existant, pré-rempli (Produit → adaptateur).
  const product = searchParams.productId ? await getProductById(supabase, searchParams.productId) : null;
  const productDefaults: ProductDefaults | null =
    product && product.owner_id === user.id
      ? {
          productId: product.id,
          name: product.name,
          price: product.price,
          subjectType: product.subject_type,
          description: product.description,
          imageUrls: product.product_images.map((img) => shopMediaUrl(img.path)).filter((u): u is string => !!u),
        }
      : null;

  return (
    <Suspense>
      <NewCreationWizard
        userId={user.id}
        defaultPhone={defaultPhone}
        shopDefaults={shopDefaults}
        productDefaults={productDefaults}
        multiPhotoAllowed={canUseMultiPhoto(entitlements)}
        generationBudget={
          entitlements.billingEnabled
            ? {
                // Coût de chaque qualité en générations (abonnement / crédits) au lieu d'un prix à l'unité.
                units: { premium: usageUnits("poster_generate", "premium"), gold: usageUnits("poster_generate", "gold") },
                affordable: {
                  premium: canSpend(entitlements, usageUnits("poster_generate", "premium")),
                  gold: canSpend(entitlements, usageUnits("poster_generate", "gold")),
                },
                remaining: entitlements.remainingGenerations,
                credits: entitlements.credits,
              }
            : null
        }
      />
    </Suspense>
  );
}
