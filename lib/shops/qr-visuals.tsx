import type { StorefrontTheme } from "@/lib/storefront/theme";

// Visuels QR de la boutique (rendus par /api/shop-qr avec next/og) : statut WhatsApp / story
// 1080×1920 et carte à imprimer 1080×1350, aux couleurs de la boutique.

export type QrVisualData = {
  name: string;
  city: string | null;
  activity: string | null;
  url: string;
  whatsapp: string;
  qr: string;
  logo: string | null;
  initials: string;
  theme: StorefrontTheme;
  mark: string | null; // signature Jaarle (Gratuit), sinon null
};

/** Assombrit une couleur hex (dégradés). */
function shade(hex: string, factor: number): string {
  const n = hex.replace("#", "");
  const v = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const ch = [0, 2, 4].map((i) => Math.round(parseInt(v.slice(i, i + 2), 16) * factor));
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}

function Logo({ d, size }: { d: QrVisualData; size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        fontSize: size * 0.38,
        fontWeight: 800,
        color: d.theme.accent,
        boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
      }}
    >
      {d.logo ? <img src={d.logo} width={size * 0.84} height={size * 0.84} style={{ objectFit: "contain" }} /> : d.initials}
    </div>
  );
}

function WhatsAppPill({ d, size }: { d: QrVisualData; size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.4, background: "#25D366", color: "#FFFFFF", borderRadius: 999, padding: `${size * 0.55}px ${size * 1.2}px`, fontSize: size, fontWeight: 800 }}>
      <svg width={size * 1.3} height={size * 1.3} viewBox="0 0 24 24" fill="#FFFFFF">
        <path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 4.9L2 22l5.3-1.4c1.4.7 2.9 1.1 4.7 1.1 5.5 0 10-4.5 10-10S17.5 2 12 2zm4.6 12.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8.9-.1.2-.3.2-.5.1-.7-.3-1.5-.8-2.1-1.5-.5-.6-.9-1.2-1-1.5-.1-.2 0-.4.1-.5l.4-.4.2-.4c0-.1 0-.3-.1-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.3 0 1.4.9 2.7 1.1 2.9.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
      </svg>
      <span style={{ display: "flex" }}>{d.whatsapp}</span>
    </div>
  );
}

function Signature({ d, color }: { d: QrVisualData; color: string }) {
  if (!d.mark) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.85 }}>
      {color === "#FFFFFF" && <img src={d.mark} width={34} height={34} />}
      <span style={{ display: "flex", fontSize: 28, fontWeight: 700, color }}>Créé avec Jaarle</span>
    </div>
  );
}

/** Statut WhatsApp / story (1080×1920). Contenu important dans la zone sûre y 280 → 1540. */
export function StatusVisual({ d }: { d: QrVisualData }) {
  const dark = shade(d.theme.accent, 0.35);
  return (
    <div style={{ width: 1080, height: 1920, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", fontFamily: "Inter", background: `linear-gradient(165deg, ${d.theme.accent} 0%, ${shade(d.theme.accent, 0.7)} 45%, ${dark} 100%)` }}>
      <div style={{ position: "absolute", width: 900, height: 900, borderRadius: 999, right: -420, top: -300, background: "rgba(255,255,255,0.08)", display: "flex" }} />
      <div style={{ position: "absolute", width: 760, height: 760, borderRadius: 999, left: -380, top: 1180, background: "rgba(255,255,255,0.06)", display: "flex" }} />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 290 }}>
        <Logo d={d} size={170} />
        <div style={{ display: "flex", marginTop: 30, fontSize: d.name.length > 18 ? 64 : 78, fontWeight: 800, color: "#FFFFFF", letterSpacing: -1.5, textAlign: "center", maxWidth: 900, lineHeight: 1.05 }}>{d.name}</div>
        {(d.activity || d.city) && (
          <div style={{ display: "flex", marginTop: 14, fontSize: 32, fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>
            {[d.activity, d.city].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      <div style={{ display: "flex", marginTop: 56, fontSize: 50, fontWeight: 800, color: "#FFFFFF", letterSpacing: -0.5 }}>Découvre ma boutique en ligne</div>
      <div style={{ display: "flex", marginTop: 12, fontSize: 30, fontWeight: 500, color: "rgba(255,255,255,0.82)" }}>Scanne le QR code pour voir mes produits</div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 44, background: "#FFFFFF", borderRadius: 56, padding: "40px 40px 30px", boxShadow: "0 40px 80px rgba(0,0,0,0.35)" }}>
        <img src={d.qr} width={520} height={520} />
        <div style={{ display: "flex", marginTop: 18, fontSize: 30, fontWeight: 800, color: d.theme.accent }}>{d.url}</div>
      </div>

      <div style={{ display: "flex", marginTop: 40, fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>Commande directement sur WhatsApp</div>
      <div style={{ display: "flex", marginTop: 14 }}>
        <WhatsAppPill d={d} size={36} />
      </div>

      <div style={{ position: "absolute", bottom: 150, display: "flex" }}>
        <Signature d={d} color="#FFFFFF" />
      </div>
    </div>
  );
}

/** Carte à imprimer (1080×1350) : fond clair, bandeau aux couleurs de la boutique. */
export function CardVisual({ d }: { d: QrVisualData }) {
  return (
    <div style={{ width: 1080, height: 1350, display: "flex", flexDirection: "column", alignItems: "center", background: "#FFFFFF", fontFamily: "Inter", position: "relative" }}>
      <div style={{ width: 1080, height: 420, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `linear-gradient(135deg, ${d.theme.accent} 0%, ${shade(d.theme.accent, 0.55)} 100%)`, borderBottomLeftRadius: 80, borderBottomRightRadius: 80 }}>
        <Logo d={d} size={150} />
        <div style={{ display: "flex", marginTop: 24, fontSize: d.name.length > 18 ? 58 : 68, fontWeight: 800, color: "#FFFFFF", letterSpacing: -1 }}>{d.name}</div>
        {(d.activity || d.city) && (
          <div style={{ display: "flex", marginTop: 8, fontSize: 28, color: "rgba(255,255,255,0.85)" }}>{[d.activity, d.city].filter(Boolean).join(" · ")}</div>
        )}
      </div>
      <div style={{ display: "flex", marginTop: 44, fontSize: 44, fontWeight: 800, color: "#111827", letterSpacing: -0.5 }}>Scannez pour voir nos produits</div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 28, color: "#4B5563" }}>et commandez directement sur WhatsApp</div>
      <div style={{ display: "flex", marginTop: 34, padding: 22, borderRadius: 40, border: `6px solid ${d.theme.accent}` }}>
        <img src={d.qr} width={470} height={470} />
      </div>
      <div style={{ display: "flex", marginTop: 26, fontSize: 32, fontWeight: 800, color: d.theme.accent }}>{d.url}</div>
      <div style={{ display: "flex", marginTop: 24 }}>
        <WhatsAppPill d={d} size={30} />
      </div>
      <div style={{ position: "absolute", bottom: 26, display: "flex" }}>
        <Signature d={d} color="#9CA3AF" />
      </div>
    </div>
  );
}

