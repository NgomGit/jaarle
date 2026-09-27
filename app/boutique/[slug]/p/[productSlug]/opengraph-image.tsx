import { ImageResponse } from "next/og";
import { formatPrice } from "@/lib/shops/format";
import { shopMediaUrl } from "@/lib/shops/media";
import { toJpegResponse, toPngDataUri } from "@/lib/shops/og-images";
import { getPublicProduct, getPublicShop } from "@/lib/shops/public";

// Aperçu du lien produit : photo, nom, prix, boutique — ce que le client voit dans WhatsApp.
export const runtime = "nodejs";
export const revalidate = 300;
export const alt = "Produit sur Jaarle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg"; // JPEG : aperçus WhatsApp légers

export default async function Image({ params }: { params: { slug: string; productSlug: string } }) {
  const shop = await getPublicShop(params.slug);
  const product = shop ? await getPublicProduct(shop.id, params.productSlug) : null;
  const photo = await toPngDataUri(shopMediaUrl(product?.product_images[0]?.path), 630);

  return toJpegResponse(
    new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#FAFAFA", fontFamily: "sans-serif" }}>
        <div style={{ width: 630, height: 630, display: "flex", background: "#EEE" }}>
          {photo ? <img src={photo} width={630} height={630} style={{ objectFit: "cover" }} /> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: 48, width: 570 }}>
          <div style={{ fontSize: 26, color: "#6D5EF5", fontWeight: 700 }}>{shop?.name ?? "Jaarle"}</div>
          <div style={{ fontSize: 52, fontWeight: 800, color: "#111", marginTop: 14, lineHeight: 1.1 }}>{product?.name ?? "Produit"}</div>
          <div style={{ fontSize: 44, fontWeight: 800, color: "#111", marginTop: 24 }}>{formatPrice(product?.price ?? null)}</div>
          <div style={{ display: "flex", marginTop: 36 }}>
            <div style={{ background: "#25D366", color: "white", borderRadius: 16, padding: "14px 24px", fontSize: 26, fontWeight: 700, display: "flex" }}>
              {product?.status === "sold_out" ? "Demander la disponibilité" : "Commander sur WhatsApp"}
            </div>
          </div>
        </div>
      </div>
    ),
    size
    )
  );
}
