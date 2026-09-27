import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { siteUrl } from "@/lib/shops/format";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/lib/locale-context";
import { WhatsAppFloatButton } from "@/components/whatsapp-float-button";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const title = "Jaarle — Ta boutique en ligne, tes affiches et tes publications";
const description =
  "Crée ta boutique en ligne gratuitement. Jaarle fait tes affiches, prépare tes publications Instagram, Facebook, TikTok et WhatsApp, et tes clients commandent sur WhatsApp.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: title, template: "%s | Jaarle" },
  description,
  applicationName: "Jaarle",
  keywords: [
    "Jaarle",
    "boutique en ligne Sénégal",
    "créer une boutique en ligne gratuite",
    "vendre sur WhatsApp",
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
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
