import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { toJpegResponse, toPngDataUri } from "@/lib/shops/og-images";
import type { MarketProduct } from "@/lib/market/queries";

// Image d'aperçu (WhatsApp, Facebook, X…) des pages du Market : titre, nombre de produits,
// prix minimum et 3 vrais produits avec leur prix. JPEG léger (< 300 Ko pour WhatsApp).

export const OG_SIZE = { width: 1200, height: 630 };

// Inter embarquée (public/fonts, tracée dans le bundle via next.config) : sans elle, le rendu
// n'a qu'une graisse et les titres paraissent maigres.
let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700 | 800; style: "normal" }[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    ([500, 700, 800] as const).map(async (weight) => ({
      name: "Inter",
      data: await readFile(join(process.cwd(), `public/fonts/inter-latin-${weight}-normal.woff`)),
      weight,
      style: "normal" as const,
    }))
  ).catch(() => {
    fonts = null;
    return [];
  });
  return fonts;
}

async function jaarleMark(): Promise<string | null> {
  try {
    return `data:image/png;base64,${(await readFile(join(process.cwd(), "public/images/logo-icon-96.png"))).toString("base64")}`;
  } catch {
    return null;
  }
}

async function photo(p: MarketProduct, w: number, h: number): Promise<string | null> {
  return (await toPngDataUri(p.thumbUrl, w, h)) ?? (await toPngDataUri(p.fullUrl, w, h));
}

export async function marketOgImage(opts: { eyebrow: string; title: string; subtitle: string; products: MarketProduct[] }): Promise<Response> {
  const items = opts.products.slice(0, 3);
  const [loadedFonts, mark, ...photos] = await Promise.all([
    loadFonts(),
    jaarleMark(),
    ...items.map((p, i) => (i === 0 ? photo(p, 300, 380) : photo(p, 200, 150))),
  ]);
  const tiles = items.map((p, i) => ({ p, src: photos[i] as string | null })).filter((t) => t.src);

  return toJpegResponse(
    new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", background: "#FAFAF7", padding: 56, fontFamily: loadedFonts.length ? "Inter" : "sans-serif", color: "#17151F" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: tiles.length ? 520 : 1088 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 800 }}>
                {mark && <img src={mark} width={44} height={44} style={{ marginRight: 12 }} />}
                Jaarle
                <div style={{ display: "flex", marginLeft: 12, fontSize: 16, letterSpacing: 3, color: "#4F43E0", border: "2px solid #4F43E0", borderRadius: 8, padding: "3px 8px" }}>
                  MARKET
                </div>
              </div>
              <div style={{ display: "flex", marginTop: 44, fontSize: 20, fontWeight: 800, letterSpacing: 2, color: "#3F34C4", textTransform: "uppercase" }}>{opts.eyebrow}</div>
              <div style={{ display: "flex", marginTop: 12, fontSize: opts.title.length > 26 ? 54 : 66, fontWeight: 800, lineHeight: 1.02, letterSpacing: -1.5 }}>{opts.title}</div>
              <div style={{ display: "flex", marginTop: 18, fontSize: 28, color: "#5E5A6B", lineHeight: 1.35 }}>{opts.subtitle}</div>
            </div>
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex", background: "#0E7A4B", color: "white", borderRadius: 999, padding: "14px 26px", fontSize: 24, fontWeight: 700 }}>
                Commande directe sur WhatsApp
              </div>
            </div>
          </div>
          {tiles.length > 0 && (
            <div style={{ display: "flex", marginLeft: 32, gap: 16, alignItems: "flex-start", alignSelf: "center" }}>
              {tiles[0] && <Tile src={tiles[0].src!} price={tiles[0].p.priceLabel} w={300} h={380} />}
              {tiles.length > 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {tiles.slice(1).map((t) => (
                    <Tile key={t.p.id} src={t.src!} price={t.p.priceLabel} w={200} h={150} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ),
      { ...OG_SIZE, fonts: loadedFonts }
    )
  );
}

function Tile({ src, price, w, h }: { src: string; price: string; w: number; h: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", background: "white", borderRadius: 24, padding: 8, border: "1px solid #ECE9E1" }}>
      <img src={src} width={w} height={h} style={{ borderRadius: 18, objectFit: "cover" }} />
      <div style={{ display: "flex", padding: "10px 8px 4px", fontSize: 22, fontWeight: 800 }}>{price}</div>
    </div>
  );
}
