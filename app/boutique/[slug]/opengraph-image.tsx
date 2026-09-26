import { ImageResponse } from "next/og";
import { formatPrice } from "@/lib/shops/format";
import { shopInitials, shopMediaThumbUrl, shopMediaUrl } from "@/lib/shops/media";
import { toPngDataUri } from "@/lib/shops/og-images";
import { getPublicProducts, getPublicShop } from "@/lib/shops/public";

// Aperçu du lien de la boutique (WhatsApp, Facebook…) : nom, activité, ville + 3 produits.
export const runtime = "nodejs";
export const revalidate = 300;
export const alt = "Boutique sur Jaarle";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { slug: string } }) {
  const shop = await getPublicShop(params.slug);
  const products = shop ? (await getPublicProducts(shop.id)).slice(0, 3) : [];
  const [logo, ...photos] = await Promise.all([
    toPngDataUri(shopMediaUrl(shop?.logo_path), 160),
    ...products.map((p) => toPngDataUri(shopMediaThumbUrl(p.product_images[0]?.path), 300)),
  ]);
  const location = [shop?.district, shop?.city].filter(Boolean).join(", ");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #6D5EF5, #3B82F6)", padding: 56, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 520, color: "white" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ width: 120, height: 120, borderRadius: 28, background: "white", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", fontSize: 48, fontWeight: 800, color: "#6D5EF5" }}>
              {logo ? <img src={logo} width={120} height={120} style={{ objectFit: "contain" }} /> : shopInitials(shop?.name ?? "Jaarle")}
            </div>
            <div style={{ fontSize: 60, fontWeight: 800, marginTop: 28, lineHeight: 1.05 }}>{shop?.name ?? "Boutique"}</div>
            <div style={{ fontSize: 28, opacity: 0.9, marginTop: 12 }}>
              {[shop?.category_label, location].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", fontSize: 26, fontWeight: 700 }}>
            <div style={{ background: "#25D366", borderRadius: 16, padding: "12px 22px", display: "flex" }}>Commander sur WhatsApp</div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginLeft: 32, width: 520, alignContent: "center" }}>
          {photos.map((src, i) =>
            src ? (
              <div key={i} style={{ display: "flex", flexDirection: "column", background: "white", borderRadius: 20, overflow: "hidden", width: i === 0 ? 520 : 252 }}>
                <img src={src} width={i === 0 ? 520 : 252} height={i === 0 ? 250 : 150} style={{ objectFit: "cover" }} />
                <div style={{ display: "flex", padding: "8px 14px", fontSize: 20, fontWeight: 700, color: "#111" }}>
                  {formatPrice(products[i]?.price ?? null)}
                </div>
              </div>
            ) : null
          )}
        </div>
      </div>
    ),
    size
  );
}
