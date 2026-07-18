import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/lib/locale-context";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const title = "Jaarle — Nako nepp yeg";
const description =
  "L'assistant marketing IA pour les commerçants africains. Crée ton affiche, ta story et ton texte de vente en 30 secondes.";

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
          <LocaleProvider>{children}</LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
