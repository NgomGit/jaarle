import QRCode from "qrcode";
import { shopPublicUrl } from "@/lib/shops/format";

// QR code de la boutique : pointe vers jaarle.com/boutique/{slug}?src=qr — la source « qr » permet
// de compter dans les statistiques les visites venues d'un emballage, d'un flyer, d'un comptoir…

export function shopQrTarget(slug: string): string {
  return `${shopPublicUrl(slug)}?src=qr`;
}

export function shopQrSvg(slug: string, color = "#111827"): Promise<string> {
  return QRCode.toString(shopQrTarget(slug), {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: color, light: "#FFFFFF" },
  });
}

export function shopQrPng(slug: string, width = 1024, color = "#111827"): Promise<Buffer> {
  return QRCode.toBuffer(shopQrTarget(slug), {
    type: "png",
    width,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: color, light: "#FFFFFF" },
  });
}
