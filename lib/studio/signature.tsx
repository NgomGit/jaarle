import sharp from "sharp";
import { ImageResponse } from "next/og";
import { loadFonts, loadJaarleMark } from "@/lib/studio/visual";

// Signature Jaarle façon CapCut (logo blanc + « jaarle », ombre douce) appliquée sur une image
// existante (aperçu d'une affiche non débloquée). Même rendu que la signature des visuels du Studio :
// ce que le commerçant voit est exactement ce qu'il télécharge.

const cache = new Map<number, Promise<Buffer | null>>();

/** PNG transparent de la signature, pour une hauteur de logo donnée (mis en cache par taille). */
function signaturePng(logo: number): Promise<Buffer | null> {
  const key = Math.max(16, Math.round(logo));
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const [fonts, mark] = await Promise.all([loadFonts(), loadJaarleMark()]);
      const width = Math.ceil(key * 3.9);
      const height = Math.ceil(key * 1.5);
      const img = new ImageResponse(
        (
          <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: Math.round(key * 0.22), opacity: 0.88 }}>
            {mark && <img src={mark} width={key} height={key} style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))" }} />}
            <span
              style={{
                display: "flex",
                color: "#FFFFFF",
                fontFamily: "Inter",
                fontWeight: 800,
                fontSize: Math.round(key * 0.8),
                letterSpacing: -0.5,
                textShadow: "0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              jaarle
            </span>
          </div>
        ),
        { width, height, ...(fonts.length ? { fonts } : {}) }
      );
      return Buffer.from(await img.arrayBuffer());
    })().catch((err) => {
      console.error("[signature] rendu impossible:", err);
      cache.delete(key);
      return null;
    });
    cache.set(key, p);
  }
  return p;
}

/**
 * Aperçu d'une affiche non débloquée : résolution réduite (≤ maxWidth, ratio conservé) + signature
 * Jaarle dans un coin (bas-droit ; haut-droit pour une affiche verticale, dont le bas porte souvent
 * le prix). Lève une erreur si la signature ne peut pas être posée : l'appelant ne doit JAMAIS
 * servir l'image brute dans ce cas.
 */
export async function applyJaarleSignature(buffer: Buffer, maxWidth = 720): Promise<Buffer> {
  const resized = await sharp(buffer).resize({ width: maxWidth, height: maxWidth * 2, fit: "inside", withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const { width, height } = resized.info;
  const logo = Math.round(width * 0.05);
  const png = await signaturePng(logo);
  if (!png) throw new Error("Signature Jaarle indisponible.");
  const meta = await sharp(png).metadata();
  const margin = Math.round(width * 0.028);
  const tall = height / width > 1.3;
  const left = Math.max(0, width - (meta.width ?? 0) - margin);
  const top = tall ? Math.round(height * 0.15) : Math.max(0, height - (meta.height ?? 0) - margin);
  return sharp(resized.data)
    .composite([{ input: png, left, top }])
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}
