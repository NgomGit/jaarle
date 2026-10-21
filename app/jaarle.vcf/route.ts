import { JAARLE_STATUS_NUMBER, vcard } from "@/lib/whatsapp/contact";

// GET /jaarle.vcf — fiche contact de Jaarle à enregistrer par les vendeurs (statuts WhatsApp).
export const dynamic = "force-static";

export function GET() {
  const body =
    vcard({
      name: "Jaarle",
      phone: JAARLE_STATUS_NUMBER,
      org: "Jaarle",
      url: "https://jaarle.com",
      note: "Astuces de vente et nouveautés Jaarle dans nos statuts WhatsApp.",
    }) + "\r\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'attachment; filename="Jaarle.vcf"',
      "Cache-Control": "public, max-age=86400",
    },
  });
}
