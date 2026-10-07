import type { ReactNode } from "react";
import type { TypePair } from "@/lib/poster-v2/fonts";
import type { FittedTitle } from "@/lib/poster-v2/text-fit";
import type { Box } from "@/lib/poster-v2/layouts";
import type { LayoutId } from "@/lib/poster-v2/types";
import { Caption, Chip, Cta, Kicker, Logo, Price, Title, sx, type Pal } from "@/lib/poster-v2/render/primitives";
import { rgba } from "@/lib/poster-v2/color";

// Les 9 mises en page (maquettes validées le 2026-10-07), base 1080 × 1080.
// Chaque variante déclare : la zone du titre (largeur, lignes, tailles), le nombre de points forts
// affichés et leur largeur, la zone de texte posée sur la scène (pour calculer le voile), et sa
// fonction de rendu. Aucune position ne vient de l'IA.

export interface Prepared {
  pair: TypePair;
  pal: Pal;
  title: FittedTitle;
  kicker: string | null;
  /** Points forts retenus (déjà ajustés à la place disponible). */
  benefits: string[];
  price: { amount: string | null; currency: string | null; label: string };
  phone: string;
  cta: string;
  logo: { uri: string; width: number; height: number } | null;
  businessName: string | null;
  sceneUri: string;
  photos: string[];
  captions: string[];
  /** Opacité du voile sous le texte posé sur la scène (calculée sur les pixels réels). */
  veil: number;
}

export interface VariantDef {
  titleBox: { maxWidth: number; maxLines: number; maxSize: number; minSize: number; maxHeight?: number };
  benefits: { max: number; width: number; size: number; mode: "line" | "chips" | "list" };
  /** Zone de la scène sous du texte (px affiche) — sert au calcul du voile. */
  textOverScene: Box | null;
  /** Fond sur lequel le texte principal est posé (choix des couleurs de texte). */
  textTone: "dark" | "light";
  render(p: Prepared): JSX.Element;
}

const M = 54; // marge extérieure (5 %)

function abs(b: Box, extra: Record<string, unknown> = {}) {
  return sx({ position: "absolute" as const, left: b.x, top: b.y, width: b.w, height: b.h, display: "flex", ...extra });
}

function SceneImg({ uri, frame, radius = 0 }: { uri: string; frame: Box; radius?: number }) {
  return (
    <div style={abs(frame, { overflow: "hidden", borderRadius: radius })}>
      <img src={uri} width={frame.w} height={frame.h} />
    </div>
  );
}

function Photo({ uri, box, radius = 0, border, shadow }: { uri: string; box: Box; radius?: number; border?: string; shadow?: boolean }) {
  return (
    <div style={abs(box, { overflow: "hidden", borderRadius: radius, border, boxShadow: shadow ? "0 24px 60px rgba(0,0,0,0.45)" : undefined })}>
      <img src={uri} width={box.w} height={box.h} />
    </div>
  );
}

function BenefitsLine({ items, color, size }: { items: string[]; color: string; size: number }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 600, fontSize: size, color, whiteSpace: "pre" }}>{items.join("  ·  ")}</div>
  );
}

/**
 * Voile sous le texte posé sur la scène : opacité PLEINE (calculée) sur toute la hauteur du texte,
 * puis fondu vers le haut. `hold` = part de la boîte (depuis le bas) où le voile reste plein.
 */
function veilGradient(p: Prepared, hold: number, bottom?: number): string {
  const v = Math.min(0.97, p.veil);
  const b = bottom ?? Math.min(0.98, v + 0.04);
  return `linear-gradient(0deg, ${rgba(p.pal.dark, b)} 0%, ${rgba(p.pal.dark, v)} ${Math.round(hold * 100)}%, ${rgba(p.pal.dark, 0)} 100%)`;
}

function Root({ bg, children }: { bg: string; children: ReactNode }) {
  return <div style={{ width: 1080, height: 1080, display: "flex", position: "relative", overflow: "hidden", background: bg }}>{children}</div>;
}

// ——— HERO_DETAIL ———

const HERO_DETAIL_A: VariantDef = {
  titleBox: { maxWidth: 600, maxLines: 2, maxSize: 80, minSize: 50 },
  benefits: { max: 2, width: 600, size: 22, mode: "line" },
  textOverScene: { x: 0, y: 700, w: 1080, h: 380 },
  textTone: "dark",
  render: (p) => (
    <Root bg={p.pal.dark}>
      <SceneImg uri={p.sceneUri} frame={{ x: 0, y: 0, w: 1080, h: 1080 }} />
      <div style={abs({ x: 0, y: 640, w: 1080, h: 440 }, { background: veilGradient(p, 0.6) })} />
      <div style={{ position: "absolute", left: M, top: M, display: "flex" }}>
        <Logo logo={p.logo} businessName={p.businessName} onDark />
      </div>
      {/* Loupe : la vraie photo du détail */}
      <div style={abs({ x: 714, y: 54, w: 312, h: 312 }, { borderRadius: 156, border: `6px solid ${p.pal.accentOnDark}`, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" })}>
        <img src={p.photos[0]} width={300} height={300} />
      </div>
      <div style={{ position: "absolute", left: 714, top: 382, width: 312, display: "flex", justifyContent: "center" }}>
        <Caption text={p.captions[0]} bg={rgba(p.pal.dark, 0.82)} color={p.pal.textOnDark} />
      </div>
      <div style={{ position: "absolute", left: M, right: M, bottom: M, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", width: 600 }}>
          <Kicker text={p.kicker} color={p.pal.accentOnDark} />
          <div style={{ display: "flex", marginTop: p.kicker ? 12 : 0 }}>
            <Title fitted={p.title} pair={p.pair} color={p.pal.textOnDark} accentColor={p.pal.accentOnDark} />
          </div>
          <div style={{ display: "flex", marginTop: 14 }}>
            <BenefitsLine items={p.benefits} color={p.pal.subOnDark} size={22} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <Price {...p.price} pair={p.pair} size={54} color={p.pal.accentOnDark} currencyColor={p.pal.accentOnDark} />
          <div style={{ display: "flex", marginTop: 16 }}>
            <Cta label={p.phone} bg={p.pal.accent} color={p.pal.onAccent} height={66} fontSize={22} />
          </div>
        </div>
      </div>
    </Root>
  ),
};

const HERO_DETAIL_B: VariantDef = {
  titleBox: { maxWidth: 660, maxLines: 2, maxSize: 68, minSize: 44 },
  benefits: { max: 2, width: 660, size: 21, mode: "line" },
  textOverScene: null,
  textTone: "light",
  render: (p) => (
    <Root bg={p.pal.light}>
      <SceneImg uri={p.sceneUri} frame={{ x: 0, y: 0, w: 1080, h: 700 }} />
      <div style={{ position: "absolute", right: M, top: 48, display: "flex" }}>
        <Logo logo={p.logo} businessName={p.businessName} onDark />
      </div>
      <Photo uri={p.photos[0]} box={{ x: 756, y: 512, w: 280, h: 352 }} border="8px solid #FFFFFF" shadow />
      <div style={{ position: "absolute", left: 756, top: 884, width: 290, display: "flex", flexDirection: "column" }}>
        <Kicker text="Détail" color={p.pal.accentOnLight} size={18} />
        <div style={{ display: "flex", marginTop: 6, fontFamily: "Manrope", fontWeight: 600, fontSize: 22, color: p.pal.subOnLight }}>{p.captions[0]}</div>
      </div>
      <div style={{ position: "absolute", left: M, top: 740, width: 660, height: 286, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Kicker text={p.kicker} color={p.pal.accentOnLight} />
          <div style={{ display: "flex", marginTop: p.kicker ? 12 : 0 }}>
            <Title fitted={p.title} pair={p.pair} color={p.pal.textOnLight} accentColor={p.pal.accentOnLight} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Price {...p.price} pair={p.pair} size={44} color={p.pal.textOnLight} currencyColor={p.pal.accentOnLight} />
            <div style={{ display: "flex", marginLeft: 22 }}>
              <Cta label={p.phone} bg={p.pal.dark} color={p.pal.textOnDark} height={64} fontSize={22} />
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 14 }}>
            <BenefitsLine items={p.benefits} color={p.pal.subOnLight} size={21} />
          </div>
        </div>
      </div>
    </Root>
  ),
};

const HERO_DETAIL_C: VariantDef = {
  titleBox: { maxWidth: 312, maxLines: 4, maxSize: 56, minSize: 36, maxHeight: 230 },
  benefits: { max: 2, width: 312, size: 21, mode: "list" },
  textOverScene: null,
  textTone: "light",
  render: (p) => (
    <Root bg={p.pal.light}>
      <SceneImg uri={p.sceneUri} frame={{ x: 0, y: 0, w: 684, h: 1080 }} />
      <div style={{ position: "absolute", left: 48, top: 48, display: "flex" }}>
        <Logo logo={p.logo} businessName={p.businessName} onDark />
      </div>
      <div style={{ position: "absolute", left: 684, top: 0, width: 396, height: 1080, padding: "52px 44px 52px 40px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Kicker text={p.kicker} color={p.pal.accentOnLight} size={18} />
          <div style={{ display: "flex", marginTop: p.kicker ? 12 : 0 }}>
            <Title fitted={p.title} pair={p.pair} color={p.pal.textOnLight} accentColor={p.pal.accentOnLight} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: 312, height: 264, borderRadius: 24, overflow: "hidden" }}>
            <img src={p.photos[0]} width={312} height={264} />
          </div>
          <div style={{ display: "flex", marginTop: 14 }}>
            <Kicker text={p.captions[0]} color={p.pal.accentOnLight} size={18} />
          </div>
          {p.benefits.length ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 10, fontFamily: "Manrope", fontWeight: 600, fontSize: 21, lineHeight: 1.45, color: p.pal.subOnLight }}>
              {p.benefits.map((b, i) => (
                <div key={i} style={{ display: "flex" }}>{b}</div>
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Price {...p.price} pair={p.pair} size={46} color={p.pal.textOnLight} currencyColor={p.pal.accentOnLight} />
          <div style={{ display: "flex", marginTop: 16 }}>
            <Cta label="Commander" bg={p.pal.dark} color={p.pal.textOnDark} height={68} fontSize={22} width={312} radius={20} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 14, fontFamily: "Manrope", fontWeight: 700, fontSize: 23, color: p.pal.textOnLight }}>{p.phone}</div>
        </div>
      </div>
    </Root>
  ),
};

// ——— DETAIL_STRIP ———

const DETAIL_STRIP_A: VariantDef = {
  titleBox: { maxWidth: 780, maxLines: 2, maxSize: 64, minSize: 42 },
  benefits: { max: 0, width: 0, size: 0, mode: "line" },
  textOverScene: { x: 0, y: 420, w: 1080, h: 252 },
  textTone: "dark",
  render: (p) => (
    <Root bg={p.pal.dark}>
      <SceneImg uri={p.sceneUri} frame={{ x: 0, y: 0, w: 1080, h: 672 }} />
      <div style={abs({ x: 0, y: 360, w: 1080, h: 312 }, { background: veilGradient(p, 0.72, 1) })} />
      <div style={{ position: "absolute", left: M, top: 44, display: "flex" }}>
        <Logo logo={p.logo} businessName={p.businessName} onDark />
      </div>
      <div style={{ position: "absolute", left: M, right: M, bottom: 1080 - 664, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Title fitted={p.title} pair={p.pair} color={p.pal.textOnDark} accentColor={p.pal.accentOnDark} />
        <div style={{ display: "flex", marginBottom: 8 }}>
          <Kicker text={p.kicker} color={p.pal.accentOnDark} size={18} />
        </div>
      </div>
      {[0, 1].map((i) => (
        <div key={i} style={{ position: "absolute", left: M + i * (308 + 24), top: 704, width: 308, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", width: 308, height: 264, borderRadius: 20, overflow: "hidden" }}>
            <img src={p.photos[i]} width={308} height={264} />
          </div>
          <div style={{ display: "flex", marginTop: 12, fontFamily: "Manrope", fontWeight: 700, fontSize: 20, color: p.pal.subOnDark }}>{p.captions[i]}</div>
        </div>
      ))}
      <div style={{ position: "absolute", left: M + 2 * (308 + 24), top: 704, width: 308, height: 304, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Kicker text="Prix" color={p.pal.subOnDark} size={18} />
          <div style={{ display: "flex", marginTop: 8 }}>
            <Price {...p.price} pair={p.pair} size={46} color={p.pal.accentOnDark} currencyColor={p.pal.accentOnDark} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Cta label="Commander" bg={p.pal.accent} color={p.pal.onAccent} height={68} fontSize={22} width={308} radius={20} />
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12, fontFamily: "Manrope", fontWeight: 700, fontSize: 22, color: p.pal.textOnDark }}>{p.phone}</div>
        </div>
      </div>
    </Root>
  ),
};

const DETAIL_STRIP_B: VariantDef = {
  titleBox: { maxWidth: 640, maxLines: 2, maxSize: 64, minSize: 44 },
  benefits: { max: 0, width: 0, size: 0, mode: "line" },
  textOverScene: { x: 0, y: 720, w: 760, h: 360 },
  textTone: "dark",
  render: (p) => (
    <Root bg={p.pal.dark}>
      <SceneImg uri={p.sceneUri} frame={{ x: 0, y: 0, w: 1080, h: 1080 }} />
      <div style={abs({ x: 0, y: 660, w: 760, h: 420 }, { background: veilGradient(p, 0.6) })} />
      <div style={{ position: "absolute", left: M, top: 48, display: "flex" }}>
        <Logo logo={p.logo} businessName={p.businessName} onDark />
      </div>
      <div style={abs({ x: 760, y: 0, w: 320, h: 1080 }, { flexDirection: "column", padding: "54px 34px", background: rgba(p.pal.dark, 0.84), borderLeft: `2px solid ${rgba(p.pal.accentOnDark, 0.4)}` })}>
        <Kicker text="En détail" color={p.pal.accentOnDark} size={18} />
        {[0, 1].map((i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
            <div style={{ display: "flex", width: 252, height: 252, borderRadius: 16, overflow: "hidden" }}>
              <img src={p.photos[i]} width={252} height={252} />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 12 }}>
              <span style={{ fontFamily: p.pair.display.family, fontWeight: p.pair.display.weight, fontSize: 24, color: p.pal.accentOnDark }}>{`0${i + 1}`}</span>
              <span style={{ fontFamily: "Manrope", fontWeight: 600, fontSize: 20, color: p.pal.subOnDark, marginLeft: 12 }}>{p.captions[i]}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: M, bottom: M, width: 660, display: "flex", flexDirection: "column" }}>
        <Kicker text={p.kicker} color={p.pal.accentOnDark} />
        <div style={{ display: "flex", marginTop: p.kicker ? 12 : 0 }}>
          <Title fitted={p.title} pair={p.pair} color={p.pal.textOnDark} accentColor={p.pal.accentOnDark} />
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 22 }}>
          <Price {...p.price} pair={p.pair} size={42} color={p.pal.accentOnDark} currencyColor={p.pal.accentOnDark} />
          <div style={{ display: "flex", marginLeft: 22 }}>
            <Cta label={p.phone} bg={p.pal.light} color={p.pal.textOnLight} height={62} fontSize={21} radius={16} />
          </div>
        </div>
      </div>
    </Root>
  ),
};

const DETAIL_STRIP_C: VariantDef = {
  titleBox: { maxWidth: 780, maxLines: 1, maxSize: 64, minSize: 40 },
  benefits: { max: 2, width: 560, size: 22, mode: "line" },
  textOverScene: null,
  textTone: "light",
  render: (p) => (
    <Root bg={p.pal.light}>
      <div style={{ position: "absolute", left: M, top: 44, width: 972, height: 80, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Title fitted={p.title} pair={p.pair} color={p.pal.textOnLight} accentColor={p.pal.accentOnLight} />
        <Logo logo={p.logo} businessName={p.businessName} onDark={false} />
      </div>
      <SceneImg uri={p.sceneUri} frame={{ x: M, y: 148, w: 972, h: 524 }} radius={12} />
      <div style={abs({ x: M, y: 696, w: 972, h: 264 }, { padding: 20, borderRadius: 12, background: p.pal.dark })}>
        {[0, 1].map((i) => (
          <div key={i} style={{ position: "relative", display: "flex", width: 297, height: 224, borderRadius: 6, overflow: "hidden", marginRight: 20 }}>
            <img src={p.photos[i]} width={297} height={224} />
            <div style={{ position: "absolute", left: 12, bottom: 12, display: "flex" }}>
              <Caption text={`0${i + 1} · ${p.captions[i]}`} bg={rgba(p.pal.dark, 0.82)} color={p.pal.textOnDark} fontSize={15} />
            </div>
          </div>
        ))}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: 298, paddingLeft: 8 }}>
          <Price {...p.price} pair={p.pair} size={44} color={p.pal.accentOnDark} currencyColor={p.pal.accentOnDark} />
          <div style={{ display: "flex", marginTop: 18 }}>
            <Cta label="Commander" bg={p.pal.accent} color={p.pal.onAccent} height={62} fontSize={21} width={276} />
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: M, top: 984, width: 972, display: "flex", justifyContent: "space-between", fontFamily: "Manrope", fontWeight: 700, fontSize: 22 }}>
        <div style={{ display: "flex", color: p.pal.subOnLight }}>{p.benefits.join("  ·  ")}</div>
        <div style={{ display: "flex", color: p.pal.textOnLight }}>{p.phone}</div>
      </div>
    </Root>
  ),
};

// ——— COLLAGE ———

const COLLAGE_A: VariantDef = {
  titleBox: { maxWidth: 600, maxLines: 2, maxSize: 64, minSize: 44 },
  benefits: { max: 0, width: 0, size: 0, mode: "line" },
  textOverScene: { x: 0, y: 640, w: 688, h: 440 },
  textTone: "dark",
  render: (p) => (
    <Root bg={p.pal.light}>
      <SceneImg uri={p.sceneUri} frame={{ x: 0, y: 0, w: 688, h: 1080 }} />
      <div style={abs({ x: 0, y: 520, w: 688, h: 560 }, { background: veilGradient(p, 0.8) })} />
      <div style={{ position: "absolute", left: 44, top: 40, display: "flex" }}>
        <Logo logo={p.logo} businessName={p.businessName} onDark />
      </div>
      {[0, 1].map((i) => (
        <div key={i} style={abs({ x: 704, y: i * 548, w: 376, h: 532 }, { overflow: "hidden" })}>
          <img src={p.photos[i]} width={376} height={532} />
          <div style={{ position: "absolute", left: 18, bottom: 18, display: "flex" }}>
            <Caption text={p.captions[i]} bg={rgba(p.pal.dark, 0.78)} color={p.pal.textOnDark} fontSize={15} />
          </div>
        </div>
      ))}
      <div style={{ position: "absolute", left: 48, bottom: 52, width: 600, display: "flex", flexDirection: "column" }}>
        <Kicker text={p.kicker} color={p.pal.accentOnDark} />
        <div style={{ display: "flex", marginTop: p.kicker ? 12 : 0 }}>
          <Title fitted={p.title} pair={p.pair} color={p.pal.textOnDark} accentColor={p.pal.accentOnDark} />
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 22 }}>
          <Price {...p.price} pair={p.pair} size={42} color={p.pal.textOnDark} currencyColor={p.pal.accentOnDark} />
          <div style={{ display: "flex", marginLeft: 22 }}>
            <Cta label={p.phone} bg={p.pal.light} color={p.pal.textOnLight} height={62} fontSize={21} />
          </div>
        </div>
      </div>
    </Root>
  ),
};

const COLLAGE_B: VariantDef = {
  titleBox: { maxWidth: 608, maxLines: 2, maxSize: 52, minSize: 36 },
  benefits: { max: 3, width: 608, size: 20, mode: "chips" },
  textOverScene: null,
  textTone: "dark",
  render: (p) => (
    <Root bg={p.pal.dark}>
      <SceneImg uri={p.sceneUri} frame={{ x: 32, y: 32, w: 672, h: 672 }} radius={28} />
      <div style={{ position: "absolute", left: 60, top: 56, display: "flex" }}>
        <Logo logo={p.logo} businessName={p.businessName} onDark />
      </div>
      {[0, 1].map((i) => (
        <div key={i} style={abs({ x: 720, y: 32 + i * 344, w: 328, h: 328 }, { borderRadius: 28, overflow: "hidden" })}>
          <img src={p.photos[i]} width={328} height={328} />
          <div style={{ position: "absolute", left: 16, bottom: 16, display: "flex" }}>
            <Caption text={p.captions[i]} bg={rgba(p.pal.dark, 0.78)} color={p.pal.textOnDark} fontSize={14} />
          </div>
        </div>
      ))}
      <div style={abs({ x: 32, y: 720, w: 672, h: 328 }, { borderRadius: 28, background: rgba(p.pal.light, 0.08), padding: 32, flexDirection: "column", justifyContent: "space-between" })}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Kicker text={p.kicker} color={p.pal.accentOnDark} size={18} />
          <div style={{ display: "flex", marginTop: p.kicker ? 10 : 0 }}>
            <Title fitted={p.title} pair={p.pair} color={p.pal.textOnDark} accentColor={p.pal.accentOnDark} />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {p.benefits.map((b, i) => (
            <div key={i} style={{ display: "flex", marginRight: 10, marginTop: 8 }}>
              <Chip text={b} bg={rgba(p.pal.light, 0.12)} color={p.pal.textOnDark} fontSize={20} />
            </div>
          ))}
        </div>
      </div>
      <div style={abs({ x: 720, y: 720, w: 328, h: 328 }, { borderRadius: 28, background: p.pal.accent, padding: 28, flexDirection: "column", justifyContent: "space-between" })}>
        <Price {...p.price} pair={p.pair} size={40} color={p.pal.onAccent} currencyColor={p.pal.onAccent} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", fontFamily: "Manrope", fontWeight: 800, fontSize: 21, color: p.pal.onAccent }}>WhatsApp</div>
          <div style={{ display: "flex", marginTop: 6, fontFamily: "Manrope", fontWeight: 800, fontSize: 23, color: p.pal.onAccent }}>{p.phone}</div>
        </div>
      </div>
    </Root>
  ),
};

const COLLAGE_C: VariantDef = {
  titleBox: { maxWidth: 620, maxLines: 2, maxSize: 76, minSize: 48 },
  benefits: { max: 0, width: 0, size: 0, mode: "line" },
  textOverScene: { x: 0, y: 820, w: 1080, h: 260 },
  textTone: "dark",
  render: (p) => (
    <Root bg={p.pal.dark}>
      <SceneImg uri={p.sceneUri} frame={{ x: 0, y: 0, w: 1080, h: 1080 }} />
      <div style={abs({ x: 0, y: 0, w: 1080, h: 420 }, { background: `linear-gradient(180deg, ${rgba(p.pal.dark, 0.7)} 0%, ${rgba(p.pal.dark, 0)} 100%)` })} />
      <div style={abs({ x: 0, y: 700, w: 1080, h: 380 }, { background: veilGradient(p, 0.5) })} />
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: i === 0 ? 60 : 344,
            top: i === 0 ? 68 : 104,
            width: 324,
            height: 304,
            display: "flex",
            flexDirection: "column",
            padding: 12,
            background: "#F6F1E8",
            boxShadow: "0 28px 56px rgba(0,0,0,0.5)",
            transform: `rotate(${i === 0 ? -3 : 2.5}deg)`,
          }}
        >
          <img src={p.photos[i]} width={300} height={236} />
          <div style={{ display: "flex", marginTop: 12, fontFamily: "Manrope", fontWeight: 800, fontSize: 16, letterSpacing: "0.14em", textTransform: "uppercase", color: "#4A3A30" }}>
            {p.captions[i]}
          </div>
        </div>
      ))}
      <div style={{ position: "absolute", right: M, top: 48, display: "flex" }}>
        <Logo logo={p.logo} businessName={p.businessName} onDark />
      </div>
      <div style={{ position: "absolute", left: M, right: M, bottom: M, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <Title fitted={p.title} pair={p.pair} color={p.pal.textOnDark} accentColor={p.pal.accentOnDark} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <Price {...p.price} pair={p.pair} size={48} color={p.pal.accentOnDark} currencyColor={p.pal.accentOnDark} />
          <div style={{ display: "flex", marginTop: 14 }}>
            <Cta label={p.phone} bg={p.pal.accent} color={p.pal.onAccent} height={64} fontSize={21} />
          </div>
        </div>
      </div>
    </Root>
  ),
};

export const VARIANT_DEFS: Record<LayoutId, VariantDef> = {
  "HERO_DETAIL.A": HERO_DETAIL_A,
  "HERO_DETAIL.B": HERO_DETAIL_B,
  "HERO_DETAIL.C": HERO_DETAIL_C,
  "DETAIL_STRIP.A": DETAIL_STRIP_A,
  "DETAIL_STRIP.B": DETAIL_STRIP_B,
  "DETAIL_STRIP.C": DETAIL_STRIP_C,
  "COLLAGE.A": COLLAGE_A,
  "COLLAGE.B": COLLAGE_B,
  "COLLAGE.C": COLLAGE_C,
};
