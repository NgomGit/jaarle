import type { TypePair } from "@/lib/poster-v2/fonts";
import type { FittedTitle } from "@/lib/poster-v2/text-fit";

// Briques visuelles du renderer V2 (rendues par next/og / satori). Base 1080 px.

/** satori plante sur une valeur de style `undefined` : on les retire. */
export function sx<T extends Record<string, unknown>>(style: T): T {
  return Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined && v !== null)) as T;
}

export interface Pal {
  dark: string;
  light: string;
  accent: string;
  muted: string;
  /** Texte sur l'accent (calculé). */
  onAccent: string;
  /** Accent lisible sur fond sombre / clair (ajusté si besoin). */
  accentOnDark: string;
  accentOnLight: string;
  /** Texte principal sur fond sombre / clair. */
  textOnDark: string;
  textOnLight: string;
  /** Texte secondaire sur fond sombre / clair. */
  subOnDark: string;
  subOnLight: string;
}

export function Kicker({ text, color, size = 20 }: { text?: string | null; color: string; size?: number }) {
  if (!text) return null;
  return (
    <div style={{ display: "flex", fontFamily: "Manrope", fontWeight: 800, fontSize: size, letterSpacing: "0.2em", textTransform: "uppercase", color }}>
      {text}
    </div>
  );
}

export function Title({ fitted, pair, color, accentColor }: { fitted: FittedTitle; pair: TypePair; color: string; accentColor: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {fitted.lines.map((line, li) => (
        <div
          key={li}
          style={{
            display: "flex",
            flexDirection: "row",
            fontSize: fitted.size,
            lineHeight: pair.lineHeight,
            height: Math.round(fitted.size * pair.lineHeight),
            alignItems: "flex-end",
            letterSpacing: `${pair.letterSpacing}em`,
          }}
        >
          {line.map((t, ti) => {
            const face = t.accent && pair.accent ? pair.accent : pair.display;
            return (
              <span
                key={ti}
                style={{
                  fontFamily: face.family,
                  fontWeight: face.weight,
                  fontStyle: face.style,
                  color: t.accent ? accentColor : color,
                  whiteSpace: "pre",
                }}
              >
                {ti < line.length - 1 ? `${t.text} ` : t.text}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function Price({
  amount,
  currency,
  label,
  pair,
  size,
  color,
  currencyColor,
}: {
  amount: string | null;
  currency: string | null;
  label: string;
  pair: TypePair;
  size: number;
  color: string;
  currencyColor: string;
}) {
  const face = pair.priceInDisplay ? pair.display : { family: "Manrope", weight: 800 as const, style: "normal" as const };
  const text = amount ?? label;
  return (
    <div style={{ display: "flex", alignItems: "baseline", fontFamily: face.family, fontWeight: face.weight, fontSize: size, lineHeight: 1, color, whiteSpace: "pre" }}>
      <span>{pair.uppercase && !amount ? text.toUpperCase() : text}</span>
      {amount && currency ? (
        <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: Math.round(size * 0.46), color: currencyColor, marginLeft: Math.round(size * 0.18) }}>{currency}</span>
      ) : null}
    </div>
  );
}

export function WhatsAppIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" />
    </svg>
  );
}

export function Cta({
  label,
  bg,
  color,
  height = 72,
  fontSize = 23,
  width,
  radius,
  outline,
}: {
  label: string;
  bg: string;
  color: string;
  height?: number;
  fontSize?: number;
  width?: number;
  radius?: number;
  outline?: string;
}) {
  return (
    <div
      style={sx({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height,
        width,
        padding: width ? 0 : `0 ${Math.round(height * 0.42)}px`,
        borderRadius: radius ?? height / 2,
        background: bg,
        border: outline ? `2px solid ${outline}` : undefined,
        color,
        fontFamily: "Manrope",
        fontWeight: 800,
        fontSize,
        whiteSpace: "pre",
      })}
    >
      <div style={{ display: "flex", marginRight: 14 }}>
        <WhatsAppIcon size={Math.round(fontSize * 1.25)} color={color} />
      </div>
      {label}
    </div>
  );
}

export function Logo({
  logo,
  businessName,
  onDark,
  maxH = 64,
}: {
  logo: { uri: string; width: number; height: number } | null;
  businessName?: string | null;
  onDark: boolean;
  maxH?: number;
}) {
  if (logo) {
    return (
      <div style={{ display: "flex", padding: "10px 16px", borderRadius: 16, background: "rgba(255,255,255,0.94)", boxShadow: "0 6px 18px rgba(0,0,0,0.25)" }}>
        <img src={logo.uri} width={logo.width} height={Math.min(maxH, logo.height)} style={{ objectFit: "contain" }} />
      </div>
    );
  }
  if (businessName) {
    return (
      <div
        style={{
          display: "flex",
          fontFamily: "Manrope",
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: onDark ? "rgba(255,255,255,0.95)" : "rgba(20,20,20,0.88)",
          // Le nom est souvent posé sur la scène : une ombre douce le garde lisible sur fond clair.
          textShadow: onDark ? "0 1px 3px rgba(0,0,0,0.55), 0 0 18px rgba(0,0,0,0.35)" : "none",
        }}
      >
        {businessName}
      </div>
    );
  }
  return null;
}

export function Chip({ text, bg, color, fontSize = 21 }: { text: string; bg: string; color: string; fontSize?: number }) {
  return (
    <div style={{ display: "flex", padding: "9px 18px", borderRadius: 999, background: bg, color, fontFamily: "Manrope", fontWeight: 600, fontSize, whiteSpace: "pre" }}>
      {text}
    </div>
  );
}

export function Caption({ text, bg, color, fontSize = 18 }: { text: string; bg: string; color: string; fontSize?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: Math.round(fontSize * 2.3),
        padding: `0 ${Math.round(fontSize)}px`,
        borderRadius: 999,
        background: bg,
        color,
        fontFamily: "Manrope",
        fontWeight: 800,
        fontSize,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        whiteSpace: "pre",
      }}
    >
      {text}
    </div>
  );
}
