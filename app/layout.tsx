import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { siteUrl } from "@/lib/shops/format";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/lib/locale-context";
import { WhatsAppFloatButton } from "@/components/whatsapp-float-button";
import { MetaPixel } from "@/components/meta-pixel";
import { PwaProvider } from "@/components/pwa/pwa-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const title = "Jaarle — Boutique en ligne gratuite et marketplace au Sénégal";
const description =
  "Crée ta boutique en ligne gratuite au Sénégal et vends sur WhatsApp. Tes produits et services sur Jaarle Market, la marketplace des boutiques sénégalaises, et des affiches créées par l'IA.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: title, template: "%s | Jaarle" },
  description,
  applicationName: "Jaarle",
  // PWA sur iPhone : plein écran une fois ajoutée à l'écran d'accueil.
  appleWebApp: { capable: true, title: "Jaarle", statusBarStyle: "default" },
  keywords: [
    "Jaarle",
    "boutique en ligne",
    "boutique en ligne Sénégal",
    "créer une boutique en ligne gratuite",
    "vendre en ligne au Sénégal",
    "annonces Sénégal",
    "petites annonces Dakar",
    "services Dakar",
    "affiche publicitaire",
    "vendre sur WhatsApp",
    "Jaarle Market",
    "marketplace Sénégal",
    "affiche produit IA",
    "publication Instagram",
    "statut WhatsApp",
    "commerçants Dakar",
    "Wave",
    "Orange Money",
  ],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  formatDetection: { telephone: false },
  openGraph: {
    title,
    description,
    siteName: "Jaarle",
    locale: "fr_SN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B12" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <LocaleProvider>
            {children}
            <WhatsAppFloatButton />
            <PwaProvider />
          </LocaleProvider>
        </ThemeProvider>
        <MetaPixel />
      </body>
    </html>
  );
}
