import { ImageResponse } from "next/og";
import { jaarleMark, loadFonts, OG_SIZE } from "@/lib/market/og";
import { formatPrice } from "@/lib/shops/format";
import { shopInitials, shopMediaThumbUrl, shopMediaUrl } from "@/lib/shops/media";
import { toJpegResponse, toPngDataUri } from "@/lib/shops/og-images";
import { formatOrderCode, type OrderWithShop } from "@/lib/shops/orders";

// Aperçu WhatsApp du reçu d'une commande : boutique, nombre d'articles, total, et les photos des
// articles avec leur quantité. JPEG léger (< 300 Ko). Lisible en petit : peu de texte, gros chiffres.

const INK = "#17151F";
const MUTED = "#5E5A6B";

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export async function orderOgImage(order: OrderWithShop): Promise<Response> {
  const items = order.items;
  const overflow = items.length > 4 ? items.length - 3 : 0;
  const shown = overflow ? items.slice(0, 3) : items.slice(0, 4);
  // Taille des tuiles selon le nombre d'articles (zone photos : 616 × 518).
  // w, h : taille de la photo ; chaque tuile = photo + nom + prix (≈ 70 px) dans un cadre de 18 px.
  const layout = shown.length === 1 ? { w: 380, h: 360 } : shown.length === 2 && !overflow ? { w: 280, h: 340 } : { w: 280, h: 150 };

  const [fonts, mark, logo, ...photos] = await Promise.all([
    loadFonts(),
    jaarleMark(),
    toPngDataUri(shopMediaUrl(order.shop.logo_path), 96),
    ...shown.map(async (i) => (await toPngDataUri(shopMediaThumbUrl(i.image_path), layout.w, layout.h)) ?? (await toPngDataUri(shopMediaUrl(i.image_path), layout.w, layout.h))),
  ]);

  const count = order.item_count;
  return toJpegResponse(
    new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", background: "#F3F1EA", padding: 56, fontFamily: fonts.length ? "Inter" : "sans-serif", color: INK }}>
          {/* Colonne gauche : la boutique et le total */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 440, paddingRight: 32 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                {logo ? (
                  <img src={logo} width={72} height={72} style={{ borderRadius: 999, background: "white", border: "1px solid #E4E1D8" }} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 72, height: 72, borderRadius: 999, background: INK, color: "white", fontSize: 28, fontWeight: 800 }}>
                    {shopInitials(order.shop.name)}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", marginLeft: 16 }}>
                  <div style={{ display: "flex", fontSize: 18, fontWeight: 800, letterSpacing: 2, color: "#3F34C4", textTransform: "uppercase" }}>Commande</div>
                  <div style={{ display: "flex", fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{short(order.shop.name, 22)}</div>
                </div>
              </div>
              <div style={{ display: "flex", marginTop: 44, fontSize: 34, fontWeight: 700, color: MUTED }}>
                {count} article{count > 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", marginTop: 6, fontSize: order.total >= 1_000_000 ? 62 : 72, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>
                {formatPrice(order.total)}
              </div>
              <div style={{ display: "flex", marginTop: 14, fontSize: 22, color: MUTED }}>
                {order.has_unpriced ? "+ prix à confirmer · hors livraison" : "Total hors livraison"}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", background: INK, color: "white", borderRadius: 14, padding: "10px 16px", fontSize: 24, fontWeight: 800, letterSpacing: 2 }}>
                N° {formatOrderCode(order.code)}
              </div>
              <div style={{ display: "flex", alignItems: "center", fontSize: 20, fontWeight: 700, color: MUTED }}>
                {mark && <img src={mark} width={28} height={28} style={{ marginRight: 8 }} />}
                Jaarle
              </div>
            </div>
          </div>

          {/* Colonne droite : les articles et leur quantité */}
          <div style={{ display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center", gap: 20, width: 616 }}>
            {shown.map((item, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", width: layout.w + 18, background: "white", borderRadius: 22, padding: 8, border: "1px solid #E4E1D8" }}>
                <div style={{ display: "flex", position: "relative", width: layout.w, height: layout.h }}>
                  {photos[i] ? (
                    <img src={photos[i] as string} width={layout.w} height={layout.h} style={{ borderRadius: 16, objectFit: "cover" }} />
                  ) : (
                    <div style={{ display: "flex", width: layout.w, height: layout.h, borderRadius: 16, background: "#F2F0EA" }} />
                  )}
                  <div style={{ display: "flex", position: "absolute", top: 10, right: 10, background: INK, color: "white", borderRadius: 999, padding: "6px 14px", fontSize: 26, fontWeight: 800 }}>
                    ×{item.qty}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", padding: "8px 6px 2px" }}>
                  <div style={{ display: "flex", fontSize: 19, fontWeight: 600, color: MUTED }}>{short(item.name, layout.w > 300 ? 30 : 22)}</div>
                  <div style={{ display: "flex", fontSize: 23, fontWeight: 800 }}>{item.unit_price != null ? formatPrice(item.unit_price * item.qty) : "Prix à confirmer"}</div>
                </div>
              </div>
            ))}
            {overflow > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: layout.w + 18, height: layout.h + 80, borderRadius: 22, background: "#E7E4DC", fontSize: 38, fontWeight: 800, color: "#4A4656" }}>
                +{overflow} article{overflow > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      ),
      { ...OG_SIZE, fonts }
    )
  );
}
