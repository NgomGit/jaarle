import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

const SIZE = { width: 1024, height: 1024 };
const PANEL_WIDTH = 340;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_ACCENT = { from: "#6D5EF5", to: "#3B82F6" };

const COLORS = {
  dark: "rgba(0,0,0,0.72)",
  glass: "rgba(17,24,39,0.78)",
  panel: "rgba(10,12,20,0.85)",
  white: "#FFFFFF",
  whatsapp: "#25D366",
};

function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "flex" }}>
      <circle cx="12" cy="12" r="12" fill={COLORS.whatsapp} />
      <path
        d="M16.6 14.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8.9-.1.2-.3.2-.5.1-.7-.3-1.5-.8-2.1-1.5-.5-.6-.9-1.2-1-1.5-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.2-.4 0-.1 0-.3-.1-.4-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.3 0 1.4.9 2.7 1.1 2.9.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"
        fill={COLORS.white}
      />
    </svg>
  );
}

function CheckIcon({ size = 15, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "flex" }}>
      <circle cx="12" cy="12" r="12" fill={color} />
      <path d="M7 12.5l3 3 7-7" stroke={COLORS.white} strokeWidth={2.4} fill="none" />
    </svg>
  );
}

function SparkleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "flex" }}>
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke={COLORS.white} strokeWidth={2.5} />
    </svg>
  );
}

function TagIcon({ size = 14, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "flex" }}>
      <path
        d="M12.6 2.6L21 11l-9.4 9.4a2 2 0 01-2.8 0l-6.2-6.2a2 2 0 010-2.8L12 2.6a2 2 0 01.6 0z"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
      />
      <circle cx="8.3" cy="8.3" r="1.6" fill={color} />
    </svg>
  );
}

function ArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "flex" }}>
      <path d="M5 12h13M13 6l7 6-7 6" stroke={COLORS.white} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = (current + " " + w).trim();
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current.trim());
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tier = params.get("tier") || "basic";
  const layout = params.get("layout") === "side-panel" ? "side-panel" : "bottom-bar";
  const productName = params.get("productName") || "";
  const price = params.get("price") || "";
  const phone = params.get("phone") || "";
  const badge = params.get("badge") || "";
  const businessName = params.get("businessName") || "";
  const benefits = (params.get("benefits") || "")
    .split("|")
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 3);

  const accentFromParam = params.get("accentFrom") || "";
  const accentToParam = params.get("accentTo") || "";
  const accent =
    HEX_RE.test(accentFromParam) && HEX_RE.test(accentToParam)
      ? { from: accentFromParam, to: accentToParam }
      : DEFAULT_ACCENT;
  const accentGradient = `linear-gradient(135deg, ${accent.from}, ${accent.to})`;

  const showBadge = (tier === "medium" || tier === "premium") && !!badge;
  const showContact = (tier === "medium" || tier === "premium") && !!phone;

  const badgePill = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: accentGradient,
        color: COLORS.white,
        fontSize: 22,
        fontWeight: 700,
        padding: "10px 20px",
        borderRadius: 999,
        alignSelf: "flex-start",
      }}
    >
      {tier === "premium" && <SparkleIcon size={16} />}
      {badge}
    </div>
  );

  const contactPill = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: COLORS.glass,
        color: COLORS.white,
        fontSize: 18,
        fontWeight: 600,
        padding: "8px 18px 8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.25)",
        alignSelf: "flex-start",
      }}
    >
      <WhatsAppIcon size={22} />
      {phone}
    </div>
  );

  const ctaButton = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: accentGradient,
        color: COLORS.white,
        fontSize: 18,
        fontWeight: 700,
        padding: "10px 22px",
        borderRadius: 999,
      }}
    >
      Commander sur WhatsApp
      <ArrowIcon size={16} />
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: "sans-serif" }}>
        {layout === "side-panel" ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: PANEL_WIDTH,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              background: COLORS.panel,
              padding: "32px 26px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {showBadge && badgePill}
              <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
                {wrapText(productName, 15, 3).map((line) => (
                  <div key={line} style={{ display: "flex", color: COLORS.white, fontSize: 27, fontWeight: 800 }}>
                    {line}
                  </div>
                ))}
              </div>
              {businessName && (
                <div style={{ display: "flex", color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 600 }}>{businessName}</div>
              )}
              <div style={{ display: "flex", width: 48, height: 3, background: accent.from }} />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: 12,
                  padding: "12px 16px",
                  gap: 2,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <TagIcon size={12} color="rgba(255,255,255,0.6)" />
                  <span style={{ display: "flex", color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600 }}>PRIX</span>
                </div>
                <span style={{ display: "flex", color: COLORS.white, fontSize: 26, fontWeight: 800 }}>{price} FCFA</span>
              </div>
              {tier === "premium" &&
                benefits.map((b) => (
                  <div key={b} style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.white, fontSize: 14, fontWeight: 600 }}>
                    <CheckIcon size={14} color={accent.from} />
                    {b}
                  </div>
                ))}
            </div>

            {showContact && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {contactPill}
                {tier === "premium" && ctaButton}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", width: "100%", height: "100%", position: "relative" }}>
            {showBadge && (
              <div style={{ display: "flex", position: "absolute", top: 28, left: 28 }}>{badgePill}</div>
            )}

            {tier === "premium" && benefits.length > 0 && (
              <div style={{ position: "absolute", top: 28, right: 28, display: "flex", flexDirection: "column", gap: 10 }}>
                {benefits.map((b) => (
                  <div
                    key={b}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: COLORS.glass,
                      color: COLORS.white,
                      fontSize: 17,
                      fontWeight: 600,
                      padding: "8px 16px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.18)",
                    }}
                  >
                    <CheckIcon size={15} color={accent.from} />
                    {b}
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                display: "flex",
                flexDirection: "column",
                background: `linear-gradient(to top, ${COLORS.dark} 0%, rgba(0,0,0,0.35) 60%, transparent 100%)`,
                padding: tier === "basic" ? "60px 28px 24px" : "80px 32px 32px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", width: "100%" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", color: COLORS.white, fontSize: tier === "premium" ? 36 : 26, fontWeight: 800 }}>
                    {productName}
                  </div>
                  {businessName && (
                    <div style={{ display: "flex", color: "rgba(255,255,255,0.65)", fontSize: 14, fontWeight: 600 }}>{businessName}</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {tier === "premium" && <TagIcon size={20} color={COLORS.white} />}
                  <div style={{ display: "flex", color: COLORS.white, fontSize: tier === "premium" ? 32 : 24, fontWeight: 700 }}>
                    {price} FCFA
                  </div>
                </div>
              </div>

              {showContact && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
                  {contactPill}
                  {tier === "premium" && ctaButton}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    ),
    { ...SIZE }
  );
}
