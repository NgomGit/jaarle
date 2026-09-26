import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/lib/locale-context";
import { WhatsAppFloatButton } from "@/components/whatsapp-float-button";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const title = "Jaarle — Ta boutique en ligne, tes affiches et tes publications.";
const description =
  "Crée ta boutique en ligne gratuitement. Jaarle fait tes affiches, prépare tes publications Instagram, Facebook, TikTok et WhatsApp, et tes clients commandent sur WhatsApp.";

export const metadata: Metadata = {
  metadataBase: new URL("https://jaarle.com"),
  title,
  description,
  keywords: [
    "Jaarle",
    "marketing IA",
    "Sénégal",
    "commerçants",
    "affiche produit",
    "Wave",
    "Orange Money",
    "Dakar",
    "réseaux sociaux",
    "publicité",
    "boutique en ligne",
    "WhatsApp",
  ],
  openGraph: {
    title,
    description,
    url: "https://jaarle.com",
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
