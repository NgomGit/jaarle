import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Jaarle — Vendez comme une grande marque";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logoData = await readFile(join(process.cwd(), "public/images/logo-icon.png"));
  const logoBase64 = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6D5EF5 0%, #3B82F6 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <img src={logoBase64} width={130} height={130} style={{ marginBottom: 36 }} />
        <div style={{ display: "flex", fontSize: 76, fontWeight: 800, color: "white", letterSpacing: -2 }}>Jaarle</div>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: "rgba(255,255,255,0.92)",
            marginTop: 20,
            textAlign: "center",
            maxWidth: 820,
          }}
        >
          Vends comme une grande marque, en 30 secondes.
        </div>
      </div>
    ),
    { ...size }
  );
}
