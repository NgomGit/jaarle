import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { shopInitials } from "@/lib/shops/media";
import type { StorefrontTheme } from "@/lib/storefront/theme";
import { FORMAT_SIZE, type StudioFormat } from "@/lib/studio/platforms";

// Rendu déterministe des visuels du Studio (aucune IA image) : photo produit + identité de la
// boutique + textes de la variante. Carré 1080×1080 (Instagram, Facebook) ou vertical
// 1080×1920 (TikTok, Story, Statut WhatsApp) avec marges de sécurité : rien d'important dans les
// 14 % du haut, les 20 % du bas ni les 17 % de droite (interfaces des applications).
// Le prix et le badge viennent des DONNÉES, jamais de l'IA.

export interface VisualInput {
  format: StudioFormat;
  theme: StorefrontTheme;
  shopName: string;
  logo: string | null; // data URI PNG
  photo: string | null; // data URI PNG (recadrée au bon ratio)
  headline: string;
  subline: string;
  cta: string;
  priceLabel: string;
  badge: string | null;
  whatsapp: string;
  watermark: boolean;
  branding?: boolean; // signature Jaarle façon CapCut (offre gratuite)
  mark?: string | null; // logo Jaarle blanc (chargé par renderStudioVisual)
}

let fontsPromise: Promise<{ name: string; data: Buffer; weight: 500 | 700 | 800; style: "normal" }[]> | null = null;

export function loadFonts() {
  // En cas d'absence des fichiers (déploiement mal configuré), on retombe sur la police par
  // défaut de next/og plutôt que de faire échouer le rendu.
  fontsPromise ??= Promise.all(
    ([500, 700, 800] as const).map(async (weight) => ({
      name: "Inter",
      data: await readFile(join(process.cwd(), `public/fonts/inter-latin-${weight}-normal.woff`)),
      weight,
      style: "normal" as const,
    }))
  ).catch((err) => {
    console.error("[studio/visual] polices introuvables, police par défaut utilisée:", err);
    fontsPromise = null;
    return [];
  });
  return fontsPromise;
}

/** Dimensions de la photo à préparer selon le format. */
export function photoBox(format: StudioFormat): { width: number; height: number } {
  return format === "square" ? { width: 1080, height: 1080 } : { width: 880, height: 780 };
}

let markPromise: Promise<string | null> | null = null;

/** Logo Jaarle en blanc (silhouette), pour la signature façon CapCut. Mis en cache. */
export function loadJaarleMark(): Promise<string | null> {
  markPromise ??= (async () => {
    try {
      const sharp = (await import("sharp")).default;
      const src = await readFile(join(process.cwd(), "public/images/logo-icon.png"));
      const alpha = await sharp(src).resize(96, 96).ensureAlpha().extractChannel("alpha").toBuffer();
      const white = await sharp({ create: { width: 96, height: 96, channels: 3, background: "#FFFFFF" } })
        .joinChannel(alpha)
        .png()
        .toBuffer();
      return `data:image/png;base64,${white.toString("base64")}`;
    } catch (err) {
      console.error("[studio/visual] logo Jaarle introuvable:", err);
      markPromise = null;
      return null;
    }
  })();
  return markPromise;
}

/**
 * Signature Jaarle (offre gratuite / affiche non débloquée), à la manière de CapCut : logo blanc +
 * « jaarle » en semi-transparence avec une ombre, dans un coin, lisible sur tous les fonds.
 * Carré : coin bas-droit. Vertical : centré en bas, juste au-dessus de la zone des applications, ou
 * coin haut-droit (sous l'en-tête des applications) quand l'affiche occupe tout le cadre.
 */
export function JaarleBadge({
  format,
  mark,
  corner = false,
}: {
  format: "square" | "story";
  mark: string | null;
  corner?: boolean; // vertical « plein cadre » : coin haut-droit (le bas de l'affiche porte souvent le prix)
}) {
  const story = format === "story";
  const size = story ? 58 : 50;
  return (
    <div
      style={{
        position: "absolute",
        ...(story
          ? corner
            ? { right: 40, top: 290 }
            : { left: 0, right: 0, top: 1548, justifyContent: "center" }
          : { right: 30, bottom: 26 }),
        display: "flex",
        opacity: 0.88,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {mark && <img src={mark} width={size} height={size} style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.55))" }} />}
        <span
          style={{
            display: "flex",
            color: "#FFFFFF",
            fontFamily: "Inter",
            fontWeight: 800,
            fontSize: story ? 46 : 40,
            letterSpacing: -0.5,
            textShadow: "0 2px 8px rgba(0,0,0,0.6)",
          }}
        >
          jaarle
        </span>
      </div>
    </div>
  );
}

export function Watermark({ width, height }: { width: number; height: number }) {
  const rows = Math.ceil(height / 260);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, display: "flex", flexDirection: "column", justifyContent: "space-around", overflow: "hidden" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            width: width + 800,
            gap: 150,
            marginLeft: i % 2 === 0 ? -260 : -60,
            transform: "rotate(-24deg)",
            color: "rgba(255,255,255,0.34)",
            textShadow: "0 1px 3px rgba(0,0,0,0.25)",
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: 6,
            whiteSpace: "nowrap",
          }}
        >
          {[0, 1, 2, 3].map((k) => (
            <span key={k} style={{ flexShrink: 0 }}>
              APERÇU JAARLE
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function ShopPill({ input, size }: { input: VisualInput; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.94)", borderRadius: 999, padding: "10px 26px 10px 10px" }}>
      <div style={{ width: size, height: size, borderRadius: 999, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", color: input.theme.accent, fontSize: size * 0.4, fontWeight: 800 }}>
        {input.logo ? <img src={input.logo} width={size} height={size} style={{ objectFit: "contain" }} /> : shopInitials(input.shopName)}
      </div>
      <span style={{ fontSize: size * 0.5, fontWeight: 700, color: "#111827", maxWidth: 560, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
        {input.shopName}
      </span>
    </div>
  );
}

function SquareVisual({ input }: { input: VisualInput }) {
  const { theme } = input;
  return (
    <div style={{ width: 1080, height: 1080, display: "flex", position: "relative", background: theme.accent, fontFamily: "Inter" }}>
      {input.photo && <img src={input.photo} width={1080} height={1080} style={{ position: "absolute", left: 0, top: 0 }} />}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 560, display: "flex", background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.82) 100%)" }} />
      <div style={{ position: "absolute", left: 48, top: 48, display: "flex" }}>
        <ShopPill input={input} size={64} />
      </div>
      {input.badge && (
        <div style={{ position: "absolute", right: 48, top: 56, display: "flex", background: theme.accent, color: theme.accentText, borderRadius: 999, padding: "14px 28px", fontSize: 30, fontWeight: 800, letterSpacing: 1 }}>
          {input.badge}
        </div>
      )}
      <div style={{ position: "absolute", left: 64, right: 64, bottom: 60, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 76, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.05, letterSpacing: -1.5 }}>{input.headline}</div>
        {input.subline && <div style={{ fontSize: 34, fontWeight: 500, color: "rgba(255,255,255,0.88)", marginTop: 14 }}>{input.subline}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 30 }}>
          <div style={{ display: "flex", background: "#FFFFFF", color: theme.accent, borderRadius: 999, padding: "14px 30px", fontSize: 40, fontWeight: 800 }}>{input.priceLabel}</div>
          <div style={{ display: "flex", background: theme.accent, color: theme.accentText, borderRadius: 999, padding: "16px 30px", fontSize: 30, fontWeight: 700 }}>{input.cta}</div>
        </div>
      </div>
      {input.branding && <JaarleBadge format="square" mark={input.mark ?? null} />}
      {input.watermark && <Watermark width={1080} height={1080} />}
    </div>
  );
}

function StoryVisual({ input }: { input: VisualInput }) {
  const { theme } = input;
  // Zone utile : x 80→900 (droite libre pour les boutons TikTok), y 290→1530.
  return (
    <div style={{ width: 1080, height: 1920, display: "flex", position: "relative", background: `linear-gradient(165deg, ${theme.accent} 0%, #0B0B12 100%)`, fontFamily: "Inter" }}>
      <div style={{ position: "absolute", width: 900, height: 900, borderRadius: 999, right: -380, top: -260, background: "rgba(255,255,255,0.07)", display: "flex" }} />
      <div style={{ position: "absolute", width: 700, height: 700, borderRadius: 999, left: -320, bottom: 120, background: "rgba(255,255,255,0.05)", display: "flex" }} />
      <div style={{ position: "absolute", left: 80, top: 290, display: "flex" }}>
        <ShopPill input={input} size={60} />
      </div>
      <div style={{ position: "absolute", left: 80, top: 400, width: 880, height: 780, borderRadius: 48, overflow: "hidden", display: "flex", background: "#FFFFFF", boxShadow: "0 30px 60px rgba(0,0,0,0.35)" }}>
        {input.photo && <img src={input.photo} width={880} height={780} />}
        {input.badge && (
          <div style={{ position: "absolute", left: 28, top: 28, display: "flex", background: theme.accent, color: theme.accentText, borderRadius: 999, padding: "12px 26px", fontSize: 28, fontWeight: 800, letterSpacing: 1 }}>
            {input.badge}
          </div>
        )}
      </div>
      {/* Textes : de y=1220 à ~1530 au plus (au-dessus de la zone basse réservée aux applications). */}
      <div style={{ position: "absolute", left: 80, top: 1220, width: 800, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 64, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.06, letterSpacing: -1.5 }}>{input.headline}</div>
        {input.subline && <div style={{ fontSize: 30, fontWeight: 500, color: "rgba(255,255,255,0.85)", marginTop: 12 }}>{input.subline}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 26 }}>
          <div style={{ display: "flex", background: "#FFFFFF", color: theme.accent, borderRadius: 999, padding: "12px 28px", fontSize: 38, fontWeight: 800 }}>{input.priceLabel}</div>
          <div style={{ display: "flex", flexDirection: "column", color: "#FFFFFF" }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{input.cta}</span>
            <span style={{ fontSize: 24, fontWeight: 500, opacity: 0.8 }}>WhatsApp {input.whatsapp}</span>
          </div>
        </div>
      </div>
      {input.branding && <JaarleBadge format="story" mark={input.mark ?? null} />}
      {input.watermark && <Watermark width={1080} height={1920} />}
    </div>
  );
}

export async function renderStudioVisual(input: VisualInput): Promise<ImageResponse> {
  const { width, height } = FORMAT_SIZE[input.format];
  const [fonts, mark] = await Promise.all([loadFonts(), input.branding ? loadJaarleMark() : Promise.resolve(null)]);
  input = { ...input, mark };
  return new ImageResponse(input.format === "square" ? <SquareVisual input={input} /> : <StoryVisual input={input} />, {
    width,
    height,
    ...(fonts.length ? { fonts } : {}),
  });
}
