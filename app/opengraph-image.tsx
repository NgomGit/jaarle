import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadFonts } from "@/lib/studio/visual";

// Image de partage de jaarle.com (Google, WhatsApp, Facebook, X…) — message Jaarle 2.0.
export const alt = "Jaarle — Ta boutique en ligne, tes affiches et tes publications. Tes clients sur WhatsApp.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg"; // JPEG : bien plus léger (aperçus WhatsApp < 300 Ko)

export default async function Image() {
  const [logo, ex1, ex2, fonts] = await Promise.all([
    readFile(join(process.cwd(), "public/images/logo-icon-96.png")),
    readFile(join(process.cwd(), "public/images/premium-examples/example-1-600.webp")).catch(() => null),
    readFile(join(process.cwd(), "public/images/premium-examples/example-2-600.webp")).catch(() => null),
    loadFonts(),
  ]);
  const uri = (b: Buffer, type: string) => `data:${type};base64,${b.toString("base64")}`;
  // satori ne lit pas le WebP : on convertit les exemples en JPEG.
  const sharp = (await import("sharp")).default;
  const toJpg = async (b: Buffer | null) => (b ? uri(await sharp(b).resize(360, 360).jpeg({ quality: 80 }).toBuffer(), "image/jpeg") : null);
  const [p1, p2] = await Promise.all([toJpg(ex1), toJpg(ex2)]);

  const png = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #6D5EF5 0%, #3B82F6 100%)", fontFamily: "Inter", padding: 64 }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 640 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", width: 72, height: 72, borderRadius: 20, background: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
              <img src={uri(logo, "image/png")} width={52} height={52} />
            </div>
            <span style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "#FFFFFF" }}>Jaarle</span>
          </div>
          <div style={{ display: "flex", marginTop: 34, fontSize: 54, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.08, letterSpacing: -1.5 }}>
            Ta boutique, tes affiches et tes publications.
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 30, fontWeight: 500, color: "rgba(255,255,255,0.9)" }}>
            Tes clients commandent sur WhatsApp. Gratuit pour commencer.
          </div>
        </div>
        <div style={{ display: "flex", position: "relative", flex: 1 }}>
          {p1 && <img src={p1} width={300} height={300} style={{ position: "absolute", left: 20, top: 20, borderRadius: 28, transform: "rotate(-6deg)", boxShadow: "0 30px 60px rgba(0,0,0,0.3)" }} />}
          {p2 && <img src={p2} width={300} height={300} style={{ position: "absolute", left: 130, top: 190, borderRadius: 28, transform: "rotate(5deg)", boxShadow: "0 30px 60px rgba(0,0,0,0.3)" }} />}
        </div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) }
  );
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400, immutable" } });
}
