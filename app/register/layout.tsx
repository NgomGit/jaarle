import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

const title = "Créer ma boutique en ligne gratuitement";
const description =
  "Inscris-toi gratuitement sur Jaarle : ta boutique en ligne avec lien et QR code, tes affiches et tes publications réseaux, et tes clients commandent sur WhatsApp.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: absoluteUrl("/register") },
  openGraph: { title, description, url: absoluteUrl("/register"), siteName: "Jaarle", locale: "fr_SN", type: "website" },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
