import sharp from "sharp";
import { ImageResponse } from "next/og";
import { FORMAT_SIZE, type StudioFormat } from "@/lib/studio/platforms";
import { JaarleBadge, loadFonts, loadJaarleMark, Watermark } from "@/lib/studio/visual";

// Visuels du Studio à partir d'une AFFICHE déjà générée (le texte est incrusté dans l'affiche, on
// ne la redessine pas) :
//  - même ratio que la plateforme → l'affiche telle quelle ;
//  - sinon → l'affiche entière (jamais recadrée) posée sur un fond flouté tiré de ses propres
//    couleurs. En 9:16 on ajoute une accroche en haut et l'appel à l'action en bas, dans les zones
//    sûres (rien dans les 14 % du haut ni les 20 % du bas, occupés par les applications).
// Aucune information commerciale n'est ajoutée ici : le prix reste celui imprimé sur l'affiche.

export interface PosterVisualInput {
  format: StudioFormat;
  poster: Buffer; // affiche originale (JPEG) — ou déjà filigranée si non débloquée
  headline: string;
  cta: string;
  whatsapp: string | null;
  watermark: boolean;
  branding?: boolean; // signature Jaarle façon CapCut (offre gratuite / affiche non débloquée)
}

const STORY_POSTER_BOX = 840;

function toUri(buf: Buffer, mime = "image/jpeg") {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** true si l'affiche a déjà (à 3 % près) le ratio du format demandé. */
export async function posterMatchesFormat(poster: Buffer, format: StudioFormat): Promise<boolean> {
  const meta = await sharp(poster).metadata();
  if (!meta.width || !meta.height) return false;
  const { width, height } = FORMAT_SIZE[format];
  return Math.abs(meta.width / meta.height - width / height) < 0.03;
}

export async function renderPosterVisual(input: PosterVisualInput): Promise<Buffer> {
  const { width, height } = FORMAT_SIZE[input.format];
  const same = await posterMatchesFormat(input.poster, input.format);
  const [fonts, mark] = await Promise.all([loadFonts(), input.branding ? loadJaarleMark() : Promise.resolve(null)]);

  let element: React.ReactElement;
  if (same) {
    const full = await sharp(input.poster).resize(width, height, { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
    element = (
      <div style={{ width, height, display: "flex", position: "relative" }}>
        <img src={toUri(full)} width={width} height={height} />
        {input.branding && <JaarleBadge format={input.format} mark={mark} corner />}
        {input.watermark && <Watermark width={width} height={height} />}
      </div>
    );
  } else {
    const box = input.format === "square" ? { w: width, h: height } : { w: STORY_POSTER_BOX, h: STORY_POSTER_BOX };
    const fitted = await sharp(input.poster)
      .resize({ width: box.w, height: box.h, fit: "inside" })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    // Fond : l'affiche elle-même, réduite puis floutée (couleurs cohérentes, très léger à transporter).
    const bg = await sharp(input.poster)
      .resize(Math.round(width / 24), Math.round(height / 24), { fit: "cover" })
      .blur(2.5)
      .modulate({ brightness: 0.75, saturation: 1.15 })
      .jpeg({ quality: 70 })
      .toBuffer();
    const pw = fitted.info.width;
    const ph = fitted.info.height;
    const story = input.format === "story";

    element = (
      <div style={{ width, height, display: "flex", position: "relative", fontFamily: "Inter", background: "#111" }}>
        <img src={toUri(bg)} width={width} height={height} style={{ position: "absolute", left: 0, top: 0 }} />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width,
            height,
            display: "flex",
            background: story
              ? "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.55) 100%)"
              : "rgba(0,0,0,0.18)",
          }}
        />
        {story ? (
          // Zone utile : y 290 → 1530.
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 290,
              width,
              height: 1240,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 44,
            }}
          >
            {input.headline && (
              <div
                style={{
                  display: "flex",
                  maxWidth: 860,
                  textAlign: "center",
                  justifyContent: "center",
                  fontSize: 62,
                  fontWeight: 800,
                  lineHeight: 1.08,
                  letterSpacing: -1.2,
                  color: "#FFFFFF",
                  textShadow: "0 2px 12px rgba(0,0,0,0.45)",
                }}
              >
                {input.headline}
              </div>
            )}
            <div style={{ display: "flex", borderRadius: 36, overflow: "hidden", boxShadow: "0 30px 70px rgba(0,0,0,0.45)" }}>
              <img src={toUri(fitted.data)} width={pw} height={ph} />
            </div>
            {(input.cta || input.whatsapp) && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                {input.cta && (
                  <div style={{ display: "flex", background: "#FFFFFF", color: "#111827", borderRadius: 999, padding: "20px 44px", fontSize: 38, fontWeight: 800 }}>
                    {input.cta}
                  </div>
                )}
                {input.whatsapp && (
                  <div style={{ display: "flex", color: "#FFFFFF", fontSize: 30, fontWeight: 700, textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
                    WhatsApp {input.whatsapp}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ position: "absolute", left: 0, top: 0, width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ display: "flex", boxShadow: "0 20px 60px rgba(0,0,0,0.45)" }}>
              <img src={toUri(fitted.data)} width={pw} height={ph} />
            </div>
          </div>
        )}
        {input.branding && <JaarleBadge format={input.format} mark={mark} />}
        {input.watermark && <Watermark width={width} height={height} />}
      </div>
    );
  }

  const image = new ImageResponse(element, { width, height, ...(fonts.length ? { fonts } : {}) });
  return Buffer.from(await image.arrayBuffer());
}
