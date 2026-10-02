import { NextResponse } from "next/server";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatPrice, formatSenegalPhone } from "@/lib/shops/format";
import { shopMediaUrl } from "@/lib/shops/media";
import { toPngDataUri } from "@/lib/shops/og-images";
import { resolveTheme } from "@/lib/storefront/view-models";
import { creationPosterPath, loadOwnedCreation, loadOwnedProduct } from "@/lib/studio/load";
import { getPost } from "@/lib/studio/queries";
import { photoBox, renderStudioVisual } from "@/lib/studio/visual";
import { posterMatchesFormat, renderPosterVisual } from "@/lib/studio/poster-visual";
import { PLATFORM_BY_KEY } from "@/lib/studio/platforms";
import type { PostVariant } from "@/lib/studio/types";
import { getEntitlements } from "@/lib/billing/entitlements";

// GET /api/studio/visual/[postId]?v=0&dl=1
//   v  : index de variante (défaut : variante sélectionnée)
//   (l'aperçu est exactement le visuel téléchargé, en plus léger ; signé du logo Jaarle en Gratuit)
//   dl : 1 = téléchargement (fichier propre + compteur de téléchargements)
//   share : 1 = même fichier, pour le partage vers un réseau (compteur de partages, 0027)
// Visuel recalculé à la volée (aucun stockage).
//  - Pack « affiche » : l'affiche choisie, adaptée au format. Tant que l'affiche n'est pas
//    débloquée (payée), l'aperçu est TOUJOURS filigrané et réduit, et le téléchargement refusé (402).
//  - Pack « produit » : composition photo produit + identité de la boutique (inchangé).

export const runtime = "nodejs";

const BADGES: Record<string, string | null> = { sell: null, present: null, new: "NOUVEAU", promo: null };

function slugify(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "visuel"
  );
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const post = await getPost(supabase, params.id);
  if (!post) return NextResponse.json({ error: "Contenu introuvable." }, { status: 404 });
  const pack = post.marketing_packs;

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get("v"));
  const index = Number.isInteger(requested) && requested >= 0 && requested < post.variants.length ? requested : post.selected_variant;
  const variant: PostVariant | undefined = post.variants[index] ?? post.variants[0];
  // share=1 : même fichier que le téléchargement, demandé par le bouton « Publier sur … » (compté à part).
  const share = url.searchParams.get("share") === "1";
  const download = url.searchParams.get("dl") === "1" || share;
  const platformSlug = slugify(PLATFORM_BY_KEY[post.platform].shortLabel);
  // Offre gratuite : signature Jaarle sur les visuels créés depuis un produit (retirée avec Pro).
  const branding = (await getEntitlements()).brandingBadge;

  // ── Pack créé à partir d'une affiche ────────────────────────────────────────
  if (pack.creation_id) {
    const loaded = await loadOwnedCreation(supabase, user.id, pack.creation_id);
    if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    // Affiche non payée : téléchargement autorisé, mais signé du logo Jaarle (façon CapCut).
    // Payer l'affiche (à l'unité, en crédits ou avec Pro) retire la signature.
    // Les APERÇUS restent filigranés ; seul le fichier téléchargé est net + signé.
    const locked = !loaded.creation.unlocked;
    const signed = locked;

    const path = await creationPosterPath(supabase, user.id, pack.creation_id, pack.creation_version_id);
    if (!path || !path.startsWith(`${user.id}/`)) return NextResponse.json({ error: "Affiche introuvable." }, { status: 404 });
    // Les affiches nettes ne sont lisibles que par le serveur (migration 0034).
    const { data: blob } = await createAdminClient().storage.from("creations").download(path);
    if (!blob) return NextResponse.json({ error: "Affiche introuvable." }, { status: 404 });
    const poster = Buffer.from(await blob.arrayBuffer());
    const filename = `${slugify(loaded.creation.product_name)}-${platformSlug}.jpg`;

    try {
      let out: Buffer;
      if (download && !signed && (await posterMatchesFormat(poster, post.format))) {
        out = poster; // l'affiche payée, sans ré-encodage
      } else {
        const whatsappRaw = loaded.creation.contact_phone || loaded.shop?.whatsapp || null;
        const rendered = await renderPosterVisual({
          format: post.format,
          poster,
          headline: variant?.headline ?? "",
          cta: variant?.cta ?? "",
          whatsapp: whatsappRaw ? formatSenegalPhone(whatsappRaw) : null,
          watermark: false, // l'aperçu est exactement le fichier téléchargé
          branding: signed,
        });
        // Aperçus (et toute affiche non payée) : résolution réduite, légers pour la data mobile.
        out = download
          ? await sharp(rendered).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
          : await sharp(rendered).resize({ width: 540 }).jpeg({ quality: locked ? 62 : 74, mozjpeg: true }).toBuffer();
      }

      if (download) {
        await supabase.rpc("marketing_post_track", { p_post_id: post.id, p_action: share ? "share" : "download" }).then(undefined, () => undefined);
      }
      return new NextResponse(new Uint8Array(out), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=300",
          ...(download ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}),
        },
      });
    } catch (err) {
      // Jamais de repli vers l'affiche brute : on ne risque pas de servir un visuel non protégé.
      console.error("[studio/visual] poster render failed:", err);
      return NextResponse.json({ error: "Impossible de préparer le visuel." }, { status: 500 });
    }
  }

  // ── Pack créé à partir d'un produit (repli, comportement d'origine) ─────────
  if (!pack.product_id) return NextResponse.json({ error: "Contenu introuvable." }, { status: 404 });
  const loaded = await loadOwnedProduct(supabase, user.id, pack.product_id);
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const { shop, product } = loaded;
  const watermark = false; // aperçu = fichier téléchargé (signature Jaarle en Gratuit)

  const box = photoBox(post.format);
  const [theme, photo, logo] = await Promise.all([
    resolveTheme(shop),
    toPngDataUri(shopMediaUrl(product.product_images[0]?.path), box.width, box.height),
    toPngDataUri(shopMediaUrl(shop.logo_path), 128),
  ]);

  // Badge promo : texte de l'offre saisi par le commerçant (tronqué), jamais inventé.
  const promo = pack.promo_detail;
  const badge =
    product.status === "sold_out"
      ? "ÉPUISÉ"
      : pack.objective === "promo" && promo
        ? promo.length > 22 ? `${promo.slice(0, 21)}…` : promo
        : BADGES[pack.objective] ?? null;

  const image = await renderStudioVisual({
    format: post.format,
    theme,
    shopName: shop.name,
    logo,
    photo,
    headline: variant?.headline || product.name,
    subline: variant?.subline ?? "",
    cta: variant?.cta || "Commander sur WhatsApp",
    priceLabel: formatPrice(product.price),
    badge,
    whatsapp: formatSenegalPhone(shop.whatsapp),
    watermark,
    branding,
  });

  if (download) {
    await supabase.rpc("marketing_post_track", { p_post_id: post.id, p_action: share ? "share" : "download" }).then(undefined, () => undefined);
  }

  const filename = `${product.slug}-${platformSlug}.png`;
  return new NextResponse(image.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=300",
      ...(download ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}),
    },
  });
}
